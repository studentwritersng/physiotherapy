import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import {
  portalBookAppointment,
  portalCancelAppointment,
  portalRescheduleAppointment,
} from "@/server/services/portal";
import { bookAppointment } from "@/server/services/booking";
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

/** Far future so the cancel/reschedule cutoffs never bite. */
const START = new Date("2026-12-15T08:00:00.000Z");
const MOVED = new Date("2026-12-16T08:00:00.000Z");

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

async function makePatientActor(code: string, phone: string) {
  const user = await testPrisma.user.create({
    data: { name: code, phone: `${phone}-u`, passwordHash: "x", role: "patient" },
  });
  const patient = await testPrisma.patient.create({
    data: { patientCode: code, fullName: code, phone, status: "registered", userId: user.id },
  });
  return { user, patient };
}

async function makeService() {
  return testPrisma.service.create({
    data: { name: "Sports", slug: "sports", defaultDurationMinutes: 45, defaultPrice: "15000" },
  });
}

describe("portal appointment mutations", () => {
  it("a patient cannot cancel another patient's appointment", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const s = await makeService();
    const a = await makePatientActor("TP-00001", "+2348020000001");
    const b = await makePatientActor("TP-00002", "+2348020000002");
    const appt = await bookAppointment({
      patientId: a.patient.id,
      therapistId: t.id,
      serviceId: s.id,
      start: START,
      bookedVia: "portal",
      actorId: a.user.id,
    });

    await expect(portalCancelAppointment(b.patient.id, appt.id, "nope", b.user.id)).rejects.toThrow(
      /not found/i,
    );
    // Nothing changed — the appointment is still scheduled.
    const kept = await testPrisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(kept.status).toBe("scheduled");
  });

  it("a patient cannot reschedule another patient's appointment", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const s = await makeService();
    const a = await makePatientActor("TP-00001", "+2348020000001");
    const b = await makePatientActor("TP-00002", "+2348020000002");
    const appt = await bookAppointment({
      patientId: a.patient.id,
      therapistId: t.id,
      serviceId: s.id,
      start: START,
      bookedVia: "portal",
      actorId: a.user.id,
    });

    await expect(portalRescheduleAppointment(b.patient.id, appt.id, MOVED, b.user.id)).rejects.toThrow(
      /not found/i,
    );
  });

  it("cancel works for the owning patient", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const s = await makeService();
    const a = await makePatientActor("TP-00001", "+2348020000001");
    const appt = await bookAppointment({
      patientId: a.patient.id,
      therapistId: t.id,
      serviceId: s.id,
      start: START,
      bookedVia: "portal",
      actorId: a.user.id,
    });

    const cancelled = await portalCancelAppointment(a.patient.id, appt.id, "feeling better", a.user.id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancellationReason).toBe("feeling better");
  });

  it("reschedule works for the owning patient", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const s = await makeService();
    const a = await makePatientActor("TP-00001", "+2348020000001");
    const appt = await bookAppointment({
      patientId: a.patient.id,
      therapistId: t.id,
      serviceId: s.id,
      start: START,
      bookedVia: "portal",
      actorId: a.user.id,
    });

    const moved = await portalRescheduleAppointment(a.patient.id, appt.id, MOVED, a.user.id);
    expect(moved.scheduledStart.toISOString()).toBe(MOVED.toISOString());
  });

  it("reschedule of a booking with no pinned therapist asks to contact the clinic", async () => {
    const s = await makeService();
    const a = await makePatientActor("TP-00001", "+2348020000001");
    const appt = await testPrisma.appointment.create({
      data: {
        patientId: a.patient.id,
        therapistId: null,
        serviceId: s.id,
        scheduledStart: START,
        scheduledEnd: new Date(START.getTime() + 45 * 60_000),
        status: "scheduled",
        bookedVia: "staff",
      },
    });

    await expect(portalRescheduleAppointment(a.patient.id, appt.id, MOVED, a.user.id)).rejects.toThrow(
      /contact the clinic/i,
    );
  });

  it("portal booking records bookedVia portal, resolving no-preference to a free therapist", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    const s = await makeService();
    const a = await makePatientActor("TP-00001", "+2348020000001");
    await testPrisma.therapistAvailability.create({
      data: { therapistId: t.id, dayOfWeek: 2, startTime: "08:00", endTime: "17:00", isBlocked: false },
    });

    const appt = await portalBookAppointment({
      patientId: a.patient.id,
      serviceId: s.id,
      therapistId: null,
      start: START,
      actorId: a.user.id,
    });

    expect(appt.appointment.bookedVia).toBe("portal");
    expect(appt.appointment.therapistId).toBe(t.id);
    expect(appt.appointment.patientId).toBe(a.patient.id);
    expect(appt.therapistName).toBe("Dr. A");
  });
});
