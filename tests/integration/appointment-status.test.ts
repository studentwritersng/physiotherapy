import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import { transitionStatus, InvalidTransitionError } from "@/server/services/appointment-status";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function seed(status: "scheduled" | "arrived" | "completed" = "scheduled") {
  const therapist = await testPrisma.user.create({
    data: { name: "Dr. T", phone: "+2348010000001", passwordHash: "x", role: "therapist" },
  });
  const patient = await testPrisma.patient.create({
    data: { patientCode: "TP-00001", fullName: "P One", phone: "+2348020000001" },
  });
  const service = await testPrisma.service.create({
    data: { name: "Sports", slug: "sports", defaultDurationMinutes: 45, defaultPrice: "15000" },
  });
  const appointment = await testPrisma.appointment.create({
    data: {
      patientId: patient.id,
      therapistId: therapist.id,
      serviceId: service.id,
      scheduledStart: new Date("2026-09-15T08:00:00.000Z"),
      scheduledEnd: new Date("2026-09-15T08:45:00.000Z"),
      status,
      bookedVia: "staff",
    },
  });
  return { therapist, appointment };
}

describe("transitionStatus", () => {
  it("moves scheduled to arrived and writes one history row", async () => {
    const { therapist, appointment } = await seed();

    const updated = await transitionStatus(appointment.id, "arrived", therapist.id);

    expect(updated.status).toBe("arrived");
    const history = await testPrisma.appointmentStatusHistory.findMany({
      where: { appointmentId: appointment.id },
    });
    expect(history).toHaveLength(1);
    expect(history[0]!.status).toBe("arrived");
    expect(history[0]!.changedById).toBe(therapist.id);
  });

  it("rejects completed back to scheduled without writing history", async () => {
    const { therapist, appointment } = await seed("completed");

    await expect(transitionStatus(appointment.id, "scheduled", therapist.id)).rejects.toThrow(
      InvalidTransitionError,
    );
    expect(
      await testPrisma.appointmentStatusHistory.count({ where: { appointmentId: appointment.id } }),
    ).toBe(0);
  });

  it("rejects a transition on a soft-deleted appointment", async () => {
    const { therapist, appointment } = await seed();
    await testPrisma.appointment.update({
      where: { id: appointment.id },
      data: { deletedAt: new Date() },
    });

    await expect(transitionStatus(appointment.id, "arrived", therapist.id)).rejects.toThrow(
      /not found/,
    );
  });

  it("chains arrived to in_session to completed with three history rows", async () => {
    const { therapist, appointment } = await seed("arrived");

    await transitionStatus(appointment.id, "in_session", therapist.id);
    await transitionStatus(appointment.id, "completed", therapist.id);

    const history = await testPrisma.appointmentStatusHistory.findMany({
      where: { appointmentId: appointment.id },
      orderBy: { changedAt: "asc" },
    });
    expect(history.map((h) => h.status)).toEqual(["in_session", "completed"]);
  });
});
