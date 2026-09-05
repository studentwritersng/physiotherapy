import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import { getPortalDashboard } from "@/server/services/portal";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("portal scoping", () => {
  it("returns only the linked patient's appointments", async () => {
    const svc = await testPrisma.service.create({
      data: {
        name: "Scope Check",
        slug: "scope-check",
        defaultDurationMinutes: 45,
        defaultPrice: 5000,
      },
    });
    const mk = (code: string, phone: string) =>
      testPrisma.patient.create({
        data: { patientCode: code, fullName: code, phone, status: "registered" },
      });
    const a = await mk("T-000201", "08020100011");
    const b = await mk("T-000202", "08020200022");
    await testPrisma.appointment.create({
      data: {
        patientId: a.id,
        serviceId: svc.id,
        scheduledStart: new Date("2026-10-01T09:00:00Z"),
        scheduledEnd: new Date("2026-10-01T09:45:00Z"),
        status: "scheduled",
        bookedVia: "staff",
      },
    });
    expect((await getPortalDashboard(a.id)).upcoming).toHaveLength(1);
    expect((await getPortalDashboard(b.id)).upcoming).toHaveLength(0);
  });
});
