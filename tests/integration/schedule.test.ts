import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import { getDaySchedule, getWeekSchedule } from "@/server/services/schedule";
import { transitionStatus } from "@/server/services/appointment-status";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function seed() {
  const a = await testPrisma.user.create({
    data: { name: "Dr. A", phone: "+2348010000001", passwordHash: "x", role: "therapist" },
  });
  const b = await testPrisma.user.create({
    data: { name: "Dr. B", phone: "+2348010000002", passwordHash: "x", role: "therapist" },
  });
  const patient = await testPrisma.patient.create({
    data: { patientCode: "TP-00001", fullName: "P One", phone: "+2348020000001" },
  });
  const service = await testPrisma.service.create({
    data: { name: "Sports", slug: "sports", defaultDurationMinutes: 45, defaultPrice: "15000" },
  });
  return { a, b, patient, service };
}

async function book(args: {
  patientId: string;
  therapistId: string | null;
  serviceId: string;
  start: string;
  end: string;
  status?: "scheduled" | "cancelled";
}) {
  return testPrisma.appointment.create({
    data: {
      patientId: args.patientId,
      therapistId: args.therapistId,
      serviceId: args.serviceId,
      scheduledStart: new Date(args.start),
      scheduledEnd: new Date(args.end),
      status: args.status ?? "scheduled",
      bookedVia: "staff",
    },
  });
}

describe("getDaySchedule", () => {
  it("returns the day ordered by start time with patient and service", async () => {
    const { a, patient, service } = await seed();
    // 10:00 and 09:00 Lagos.
    await book({
      patientId: patient.id, therapistId: a.id, serviceId: service.id,
      start: "2026-09-15T09:00:00.000Z", end: "2026-09-15T09:45:00.000Z",
    });
    await book({
      patientId: patient.id, therapistId: a.id, serviceId: service.id,
      start: "2026-09-15T08:00:00.000Z", end: "2026-09-15T08:45:00.000Z",
    });

    const entries = await getDaySchedule("2026-09-15");

    expect(entries).toHaveLength(2);
    expect(entries[0]!.scheduledStart.toISOString()).toBe("2026-09-15T08:00:00.000Z");
    expect(entries[0]!.patient.fullName).toBe("P One");
    expect(entries[0]!.patient.patientCode).toBe("TP-00001");
    expect(entries[0]!.service.name).toBe("Sports");
    expect(entries[0]!.therapist?.name).toBe("Dr. A");
  });

  it("keeps cancelled rows visible — a day view that hides them lies", async () => {
    const { a, patient, service } = await seed();
    await book({
      patientId: patient.id, therapistId: a.id, serviceId: service.id,
      start: "2026-09-15T08:00:00.000Z", end: "2026-09-15T08:45:00.000Z",
      status: "cancelled",
    });

    const entries = await getDaySchedule("2026-09-15");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.status).toBe("cancelled");
  });

  it("filters by therapist", async () => {
    const { a, b, patient, service } = await seed();
    const base = {
      patientId: patient.id, serviceId: service.id,
      start: "2026-09-15T08:00:00.000Z", end: "2026-09-15T08:45:00.000Z",
    };
    await book({ ...base, therapistId: a.id });
    await book({ ...base, therapistId: b.id });

    expect(await getDaySchedule("2026-09-15", a.id)).toHaveLength(1);
    expect((await getDaySchedule("2026-09-15", a.id))[0]!.therapist?.name).toBe("Dr. A");
    expect(await getDaySchedule("2026-09-15")).toHaveLength(2);
  });

  it("excludes soft-deleted rows", async () => {
    const { a, patient, service } = await seed();
    const appt = await book({
      patientId: patient.id, therapistId: a.id, serviceId: service.id,
      start: "2026-09-15T08:00:00.000Z", end: "2026-09-15T08:45:00.000Z",
    });
    await testPrisma.appointment.update({ where: { id: appt.id }, data: { deletedAt: new Date() } });

    expect(await getDaySchedule("2026-09-15")).toHaveLength(0);
  });

  it("places a 23:30 Lagos appointment on the right day", async () => {
    const { a, patient, service } = await seed();
    // 23:30 Lagos on the 15th is 22:30Z on the 15th — inside the Lagos day range.
    await book({
      patientId: patient.id, therapistId: a.id, serviceId: service.id,
      start: "2026-09-15T22:30:00.000Z", end: "2026-09-15T23:15:00.000Z",
    });

    expect(await getDaySchedule("2026-09-15")).toHaveLength(1);
    expect(await getDaySchedule("2026-09-16")).toHaveLength(0);
  });
});

describe("getWeekSchedule", () => {
  it("returns seven days starting from the given Monday", async () => {
    const { a, patient, service } = await seed();
    await book({
      patientId: patient.id, therapistId: a.id, serviceId: service.id,
      start: "2026-09-16T08:00:00.000Z", end: "2026-09-16T08:45:00.000Z",
    });

    // 2026-09-14 is a Monday.
    const week = await getWeekSchedule("2026-09-14");

    expect(week).toHaveLength(7);
    expect(week.map((d) => d.dateKey)).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
    expect(week[2]!.entries).toHaveLength(1);
    expect(week[0]!.entries).toHaveLength(0);
  });

  it("accepts a therapist filter", async () => {
    const { a, b, patient, service } = await seed();
    const base = {
      patientId: patient.id, serviceId: service.id,
      start: "2026-09-16T08:00:00.000Z", end: "2026-09-16T08:45:00.000Z",
    };
    await book({ ...base, therapistId: a.id });
    await book({ ...base, therapistId: b.id });

    const week = await getWeekSchedule("2026-09-14", a.id);
    expect(week[2]!.entries).toHaveLength(1);
  });
});
