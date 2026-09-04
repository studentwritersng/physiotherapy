import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import {
  SlotTakenError,
  bookAppointment,
  cancelAppointment,
  findWalkInMatch,
  forceBookAppointment,
  getSlotsForDate,
  rescheduleAppointment,
  walkInAppointment,
} from "@/server/services/booking";
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

/** 2026-09-15 is a Tuesday. */
const TUESDAY = "2026-09-15";

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

async function makePatient(code: string, phone: string) {
  return testPrisma.patient.create({
    data: { patientCode: code, fullName: "P", phone, status: "registered" },
  });
}

async function makeService() {
  return testPrisma.service.create({
    data: {
      name: "Sports",
      slug: "sports",
      defaultDurationMinutes: 45,
      defaultPrice: "15000",
    },
  });
}

async function giveHours(therapistId: string) {
  await testPrisma.therapistAvailability.create({
    data: { therapistId, dayOfWeek: 2, startTime: "08:00", endTime: "17:00", isBlocked: false },
  });
}

describe("bookAppointment", () => {
  it("books a scheduled appointment with an initial history row", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const p = await makePatient("TP-00001", "+2348020000001");
    const s = await makeService();

    const appt = await bookAppointment({
      patientId: p.id,
      therapistId: t.id,
      serviceId: s.id,
      start: new Date("2026-09-15T08:00:00.000Z"), // 09:00 Lagos
      bookedVia: "staff",
      actorId: t.id,
    });

    expect(appt.status).toBe("scheduled");
    expect(appt.scheduledEnd.toISOString()).toBe("2026-09-15T08:45:00.000Z");
    const history = await testPrisma.appointmentStatusHistory.findMany({
      where: { appointmentId: appt.id },
    });
    expect(history).toHaveLength(1);
    expect(history[0]!.status).toBe("scheduled");
  });

  it("derives the end time from the service duration", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const p = await makePatient("TP-00001", "+2348020000001");
    const s = await testPrisma.service.create({
      data: { name: "Neuro", slug: "neuro", defaultDurationMinutes: 60, defaultPrice: "25000" },
    });

    const appt = await bookAppointment({
      patientId: p.id,
      therapistId: t.id,
      serviceId: s.id,
      start: new Date("2026-09-15T08:00:00.000Z"),
      bookedVia: "staff",
      actorId: t.id,
    });
    expect(appt.scheduledEnd.toISOString()).toBe("2026-09-15T09:00:00.000Z");
  });

  it("rejects an overlap with the conflicting slot named", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const p = await makePatient("TP-00001", "+2348020000001");
    const s = await makeService();
    const base = {
      patientId: p.id,
      therapistId: t.id,
      serviceId: s.id,
      bookedVia: "staff" as const,
      actorId: t.id,
    };
    await bookAppointment({ ...base, start: new Date("2026-09-15T08:00:00.000Z") });

    try {
      await bookAppointment({ ...base, start: new Date("2026-09-15T08:30:00.000Z") });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SlotTakenError);
      expect((error as SlotTakenError).status).toBe(409);
      expect((error as SlotTakenError).conflicts).toHaveLength(1);
    }
    expect(await testPrisma.appointment.count()).toBe(1);
  });

  it("allows a touch at the exact endpoint", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const p = await makePatient("TP-00001", "+2348020000001");
    const s = await makeService();
    const base = {
      patientId: p.id,
      therapistId: t.id,
      serviceId: s.id,
      bookedVia: "staff" as const,
      actorId: t.id,
    };
    await bookAppointment({ ...base, start: new Date("2026-09-15T08:00:00.000Z") });
    await bookAppointment({ ...base, start: new Date("2026-09-15T08:45:00.000Z") });
    expect(await testPrisma.appointment.count()).toBe(2);
  });

  it("ignores a cancelled booking when checking overlap", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const p = await makePatient("TP-00001", "+2348020000001");
    const s = await makeService();
    const base = {
      patientId: p.id,
      therapistId: t.id,
      serviceId: s.id,
      bookedVia: "staff" as const,
      actorId: t.id,
    };
    const first = await bookAppointment({ ...base, start: new Date("2026-09-15T08:00:00.000Z") });
    await cancelAppointment(first.id, "Patient called in sick", t.id);

    await bookAppointment({ ...base, start: new Date("2026-09-15T08:00:00.000Z") });
    expect(await testPrisma.appointment.count()).toBe(2);
  });
});

describe("rescheduleAppointment", () => {
  it("moves the appointment and keeps its status", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const p = await makePatient("TP-00001", "+2348020000001");
    const s = await makeService();
    const appt = await bookAppointment({
      patientId: p.id,
      therapistId: t.id,
      serviceId: s.id,
      start: new Date("2026-12-15T08:00:00.000Z"),
      bookedVia: "staff",
      actorId: t.id,
    });

    const moved = await rescheduleAppointment(appt.id, new Date("2026-12-16T08:00:00.000Z"), t.id);

    expect(moved.scheduledStart.toISOString()).toBe("2026-12-16T08:00:00.000Z");
    expect(moved.scheduledEnd.toISOString()).toBe("2026-12-16T08:45:00.000Z");
    expect(moved.status).toBe("scheduled");
  });

  it("refuses a move into an occupied slot", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const p = await makePatient("TP-00001", "+2348020000001");
    const s = await makeService();
    const base = {
      patientId: p.id,
      therapistId: t.id,
      serviceId: s.id,
      bookedVia: "staff" as const,
      actorId: t.id,
    };
    await bookAppointment({ ...base, start: new Date("2026-12-15T08:00:00.000Z") });
    const second = await bookAppointment({ ...base, start: new Date("2026-12-15T09:00:00.000Z") });

    await expect(
      rescheduleAppointment(second.id, new Date("2026-12-15T08:30:00.000Z"), t.id),
    ).rejects.toThrow(SlotTakenError);
  });
});

describe("cancelAppointment", () => {
  it("cancels with a reason and records who", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const p = await makePatient("TP-00001", "+2348020000001");
    const s = await makeService();
    const appt = await bookAppointment({
      patientId: p.id,
      therapistId: t.id,
      serviceId: s.id,
      start: new Date("2026-12-15T08:00:00.000Z"),
      bookedVia: "staff",
      actorId: t.id,
    });

    const cancelled = await cancelAppointment(appt.id, "Patient called in sick", t.id);

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancellationReason).toBe("Patient called in sick");
    expect(cancelled.cancelledById).toBe(t.id);
  });
});

describe("walk-in", () => {
  it("findWalkInMatch returns the patient for a known phone", async () => {
    await makePatient("TP-00001", "+2348031234567");

    const match = await findWalkInMatch("08031234567");

    expect(match?.patientCode).toBe("TP-00001");
  });

  it("findWalkInMatch returns null for an unknown phone", async () => {
    expect(await findWalkInMatch("08039999999")).toBeNull();
  });

  it("walkInAppointment links the confirmed patient at arrived", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const p = await makePatient("TP-00001", "+2348031234567");
    const s = await makeService();

    const appt = await walkInAppointment({
      phone: "08031234567",
      fullName: "Ada Obi",
      patientId: p.id,
      serviceId: s.id,
      therapistId: t.id,
      actorId: t.id,
    });

    expect(appt.status).toBe("arrived");
    expect(appt.patientId).toBe(p.id);
    expect(appt.bookedVia).toBe("staff");
    // No duplicate patient.
    expect(await testPrisma.patient.count()).toBe(1);
  });

  it("walkInAppointment creates a registered patient when no id is given", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const s = await makeService();

    const appt = await walkInAppointment({
      phone: "08031234567",
      fullName: "Ada Obi",
      serviceId: s.id,
      therapistId: t.id,
      actorId: t.id,
    });

    const patient = await testPrisma.patient.findUniqueOrThrow({ where: { id: appt.patientId } });
    expect(patient.status).toBe("registered");
    expect(patient.phone).toBe("+2348031234567");
    expect(patient.patientCode).toMatch(/^TP-\d{5}$/);
    expect(appt.status).toBe("arrived");
  });
});

describe("forceBookAppointment", () => {
  it("inserts despite the overlap, flags the row, and names the conflict", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const p = await makePatient("TP-00001", "+2348020000001");
    const s = await makeService();
    const base = {
      patientId: p.id,
      therapistId: t.id,
      serviceId: s.id,
      bookedVia: "staff" as const,
      actorId: t.id,
    };
    await bookAppointment({ ...base, start: new Date("2026-09-15T08:00:00.000Z") });

    const { appointment, conflicts } = await forceBookAppointment({
      ...base,
      start: new Date("2026-09-15T08:30:00.000Z"),
    });

    expect(appointment.wasForceBooked).toBe(true);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.start.toISOString()).toBe("2026-09-15T08:00:00.000Z");
    expect(await testPrisma.appointment.count()).toBe(2);
  });
});

describe("getSlotsForDate", () => {
  it("offers slots tagged with the therapist", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const s = await makeService();
    await giveHours(t.id);

    const slots = await getSlotsForDate(TUESDAY, s.id, t.id);

    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0]!.therapistId).toBe(t.id);
    expect(slots[0]!.therapistName).toBe("Dr. A");
  });

  it("merges across therapists when none is chosen", async () => {
    const a = await makeTherapist("Dr. A", "+2348010000001");
    await makeTherapist("Dr. B", "+2348010000002");
    const s = await makeService();
    await giveHours(a.id);
    // B has no hours.

    const slots = await getSlotsForDate(TUESDAY, s.id, null);

    expect(slots.length).toBeGreaterThan(0);
    expect(new Set(slots.map((sl) => sl.therapistId))).toEqual(new Set([a.id]));
  });

  it("hides a slot taken by an existing booking", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const p = await makePatient("TP-00001", "+2348020000001");
    const s = await makeService();
    await giveHours(t.id);

    const before = await getSlotsForDate(TUESDAY, s.id, t.id);
    await bookAppointment({
      patientId: p.id,
      therapistId: t.id,
      serviceId: s.id,
      start: new Date(before[0]!.start),
      bookedVia: "staff",
      actorId: t.id,
    });
    const after = await getSlotsForDate(TUESDAY, s.id, t.id);

    // The booked start plus every start it overlaps are gone — strictly fewer.
    expect(after.length).toBeLessThan(before.length);
    expect(after.map((sl) => sl.start.toISOString())).not.toContain(
      before[0]!.start.toISOString(),
    );
  });

  it("returns nothing when the clinic is closed", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const s = await makeService();
    await giveHours(t.id);

    // 2026-09-20 is a Sunday; openWeek has sunday: null.
    expect(await getSlotsForDate("2026-09-20", s.id, t.id)).toEqual([]);
  });
});
