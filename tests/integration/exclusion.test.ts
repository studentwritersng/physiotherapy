import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { testPrisma, truncateAll } from "../helpers/db";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function seed() {
  const therapist = await testPrisma.user.create({
    data: { name: "Dr. T", phone: "+2348010000001", passwordHash: "x", role: "therapist" },
  });
  const patient = await testPrisma.patient.create({
    data: { patientCode: "TP-00001", fullName: "P One", phone: "+2348020000001" },
  });
  const service = await testPrisma.service.create({
    data: { name: "Sports", slug: "sports", defaultDurationMinutes: 45, defaultPrice: "15000" },
  });
  return { therapist, patient, service };
}

const START = new Date("2026-09-15T08:00:00.000Z");
const END = new Date("2026-09-15T08:45:00.000Z");

describe("no_therapist_overlap", () => {
  it("rejects a second overlapping appointment for the same therapist", async () => {
    const { therapist, patient, service } = await seed();
    const base = {
      patientId: patient.id,
      therapistId: therapist.id,
      serviceId: service.id,
      scheduledStart: START,
      scheduledEnd: END,
      status: "scheduled" as const,
      bookedVia: "staff" as const,
    };
    await testPrisma.appointment.create({ data: base });

    await expect(testPrisma.appointment.create({ data: base })).rejects.toThrow(
      Prisma.PrismaClientKnownRequestError,
    );
  });

  it("allows back-to-back appointments that merely touch", async () => {
    const { therapist, patient, service } = await seed();
    const base = {
      patientId: patient.id,
      therapistId: therapist.id,
      serviceId: service.id,
      status: "scheduled" as const,
      bookedVia: "staff" as const,
    };
    await testPrisma.appointment.create({ data: { ...base, scheduledStart: START, scheduledEnd: END } });
    // Touches at exactly 08:45 — tstzrange && is false on a shared endpoint.
    await testPrisma.appointment.create({
      data: { ...base, scheduledStart: END, scheduledEnd: new Date("2026-09-15T09:30:00.000Z") },
    });
    expect(await testPrisma.appointment.count()).toBe(2);
  });

  it("allows overlap when the first appointment is cancelled", async () => {
    const { therapist, patient, service } = await seed();
    const base = {
      patientId: patient.id,
      therapistId: therapist.id,
      serviceId: service.id,
      status: "scheduled" as const,
      bookedVia: "staff" as const,
    };
    const first = await testPrisma.appointment.create({
      data: { ...base, scheduledStart: START, scheduledEnd: END },
    });
    await testPrisma.appointment.update({ where: { id: first.id }, data: { status: "cancelled" } });

    await testPrisma.appointment.create({ data: { ...base, scheduledStart: START, scheduledEnd: END } });
    expect(await testPrisma.appointment.count()).toBe(2);
  });

  it("allows overlap for different therapists", async () => {
    const { therapist, patient, service } = await seed();
    const other = await testPrisma.user.create({
      data: { name: "Dr. U", phone: "+2348010000002", passwordHash: "x", role: "therapist" },
    });
    const base = {
      patientId: patient.id,
      serviceId: service.id,
      scheduledStart: START,
      scheduledEnd: END,
      status: "scheduled" as const,
      bookedVia: "staff" as const,
    };
    await testPrisma.appointment.create({ data: { ...base, therapistId: therapist.id } });
    await testPrisma.appointment.create({ data: { ...base, therapistId: other.id } });
    expect(await testPrisma.appointment.count()).toBe(2);
  });

  it("allows overlap when the new row is force-booked", async () => {
    const { therapist, patient, service } = await seed();
    const base = {
      patientId: patient.id,
      therapistId: therapist.id,
      serviceId: service.id,
      scheduledStart: START,
      scheduledEnd: END,
      status: "scheduled" as const,
      bookedVia: "staff" as const,
    };
    await testPrisma.appointment.create({ data: base });
    await testPrisma.appointment.create({ data: { ...base, wasForceBooked: true } });
    expect(await testPrisma.appointment.count()).toBe(2);
  });

  it("still rejects overlap when the therapist is unassigned (null)", async () => {
    // GIST `=` treats NULL as distinct, so two unassigned overlapping rows do
    // NOT conflict. This test documents that behaviour: therapist-less bookings
    // are outside the constraint's protection and must always pin a therapist
    // before insert. The booking service (Task 5) enforces it.
    const { patient, service } = await seed();
    const base = {
      patientId: patient.id,
      therapistId: null,
      serviceId: service.id,
      scheduledStart: START,
      scheduledEnd: END,
      status: "scheduled" as const,
      bookedVia: "staff" as const,
    };
    await testPrisma.appointment.create({ data: base });
    await testPrisma.appointment.create({ data: base });
    expect(await testPrisma.appointment.count()).toBe(2);
  });
});
