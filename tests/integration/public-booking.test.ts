import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import { bookPublicAppointment, SlotTakenError } from "@/server/services/booking";
import { updateOpeningHours } from "@/server/services/clinic-settings";
import type { OpeningHours } from "@/lib/zod/clinic";

const openWeek: OpeningHours = {
  monday: { open: "08:00", close: "17:00" },
  tuesday: { open: "08:00", close: "17:00" },
  wednesday: { open: "08:00", close: "17:00" },
  thursday: { open: "08:00", close: "17:00" },
  friday: { open: "08:00", close: "17:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: null,
};

beforeEach(async () => {
  await truncateAll();
  await updateOpeningHours(openWeek);
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function makeTherapist(name: string, phone: string) {
  const user = await testPrisma.user.create({
    data: { name, phone, passwordHash: "x", role: "therapist" },
  });
  await testPrisma.staffProfile.create({ data: { userId: user.id } });
  return user;
}

async function makeService() {
  return testPrisma.service.create({
    data: { name: "Sports", slug: "sports", defaultDurationMinutes: 45, defaultPrice: "15000" },
  });
}

const START = new Date("2026-12-15T08:00:00.000Z");

describe("bookPublicAppointment", () => {
  it("creates a scheduled public booking with a reference for a new visitor", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const s = await makeService();

    const { appointment, reference, isNewPatient } = await bookPublicAppointment({
      fullName: "Ada Obi",
      phone: "08031234567",
      email: "ada@example.com",
      isNewPatient: true,
      serviceId: s.id,
      therapistId: t.id,
      start: START,
    });

    expect(appointment.status).toBe("scheduled");
    expect(appointment.bookedVia).toBe("public");
    expect(reference).toMatch(/^APT-[0-9A-Z]{6}$/);
    expect(isNewPatient).toBe(true);

    const patient = await testPrisma.patient.findUniqueOrThrow({ where: { id: appointment.patientId } });
    expect(patient.status).toBe("lead");
    expect(patient.phone).toBe("+2348031234567");
    expect(patient.email).toBe("ada@example.com");

    const history = await testPrisma.appointmentStatusHistory.findMany({
      where: { appointmentId: appointment.id },
    });
    expect(history).toHaveLength(1);
    expect(history[0]!.changedById).toBeNull();
  });

  it("links by phone regardless of what the visitor ticked", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const s = await makeService();
    await testPrisma.patient.create({
      data: { patientCode: "TP-00001", fullName: "Ada Obi", phone: "+2348031234567", status: "registered" },
    });

    // Ticks "new" but the phone matches: linkage wins, no duplicate.
    const linked = await bookPublicAppointment({
      fullName: "Someone Else",
      phone: "08031234567",
      isNewPatient: true,
      serviceId: s.id,
      therapistId: t.id,
      start: START,
    });
    expect(linked.isNewPatient).toBe(false);
    expect(await testPrisma.patient.count()).toBe(1);

    // Ticks "returning" but nothing matches: a lead is created.
    const fresh = await bookPublicAppointment({
      fullName: "New Person",
      phone: "08039999999",
      isNewPatient: false,
      serviceId: s.id,
      therapistId: t.id,
      start: new Date("2026-12-15T09:00:00.000Z"),
    });
    expect(fresh.isNewPatient).toBe(true);
    expect(await testPrisma.patient.count()).toBe(2);
  });

  it("rejects an overlap like the staff path", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const s = await makeService();
    const base = {
      fullName: "Ada Obi",
      phone: "08031234567",
      isNewPatient: true,
      serviceId: s.id,
      therapistId: t.id,
    };
    await bookPublicAppointment({ ...base, start: START });

    await expect(
      bookPublicAppointment({ ...base, phone: "08039999999", start: new Date("2026-12-15T08:30:00.000Z") }),
    ).rejects.toThrow(SlotTakenError);
    expect(await testPrisma.appointment.count()).toBe(1);
  });
});
