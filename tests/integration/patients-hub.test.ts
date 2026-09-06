import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import type { SessionUser } from "@/server/auth/session";
import { listPatientsForActor } from "@/server/services/patient";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

function actor(over: Partial<SessionUser> & Pick<SessionUser, "id" | "role">): SessionUser {
  return {
    name: "Actor",
    email: null,
    phone: "+2348000000000",
    mustResetPassword: false,
    ...over,
  };
}

async function seed() {
  const t = await testPrisma.user.create({
    data: { name: "Dr. T", phone: "+2348010000001", passwordHash: "x", role: "therapist" },
  });
  const other = await testPrisma.user.create({
    data: { name: "Dr. O", phone: "+2348010000002", passwordHash: "x", role: "therapist" },
  });
  const a = await testPrisma.patient.create({
    data: { patientCode: "TP-00001", fullName: "Adaeze Okonkwo", phone: "+2348020000001" },
  });
  const b = await testPrisma.patient.create({
    data: { patientCode: "TP-00002", fullName: "Bola Adeyemi", phone: "+2348020000002" },
  });
  const service = await testPrisma.service.create({
    data: { name: "Sports", slug: "sports", defaultDurationMinutes: 45, defaultPrice: "15000" },
  });
  await testPrisma.appointment.create({
    data: {
      patientId: a.id,
      therapistId: t.id,
      serviceId: service.id,
      scheduledStart: new Date("2026-09-15T08:00:00.000Z"),
      scheduledEnd: new Date("2026-09-15T08:45:00.000Z"),
      bookedVia: "staff",
    },
  });
  await testPrisma.appointment.create({
    data: {
      patientId: b.id,
      therapistId: other.id,
      serviceId: service.id,
      scheduledStart: new Date("2026-09-15T09:00:00.000Z"),
      scheduledEnd: new Date("2026-09-15T09:45:00.000Z"),
      bookedVia: "staff",
    },
  });
  return { t, other, a, b };
}

describe("patients hub list scoping", () => {
  it("a therapist lists only patients they share an appointment with", async () => {
    const { t, a } = await seed();
    const list = await listPatientsForActor(actor({ id: t.id, role: "therapist" }), {});
    expect(list.map((p) => p.id)).toEqual([a.id]);
  });

  it("a receptionist lists all active patients", async () => {
    const r = await testPrisma.user.create({
      data: { name: "R", phone: "+2348010000009", passwordHash: "x", role: "receptionist" },
    });
    const { a, b } = await seed();
    const list = await listPatientsForActor(actor({ id: r.id, role: "receptionist" }), {});
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("search filters by name across the actor's scope", async () => {
    const { t } = await seed();
    const list = await listPatientsForActor(actor({ id: t.id, role: "therapist" }), {
      search: "adaeze",
    });
    expect(list).toHaveLength(1);
    expect(list[0]!.fullName).toBe("Adaeze Okonkwo");
  });
});
