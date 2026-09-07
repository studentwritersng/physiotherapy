import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import { getStaffOverview } from "@/server/services/dashboard";
import type { SessionUser } from "@/server/auth/session";

function actorFor(id: string, role: SessionUser["role"]): SessionUser {
  return { id, name: "Test", email: null, phone: "+234800000000", role, mustResetPassword: false };
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function seedBasics() {
  const admin = await testPrisma.user.create({
    data: { name: "Admin", phone: "+234800000001", passwordHash: "x", role: "admin" },
  });
  const rest = await seedRest();
  return { admin, ...rest };
}

async function seedRest() {
  const therapist = await testPrisma.user.create({
    data: { name: "Therapist", phone: "+234800000002", passwordHash: "x", role: "therapist" },
  });
  const patient = await testPrisma.patient.create({
    data: { patientCode: "TP-DASH-1", fullName: "Dash Patient", phone: "+234803000001", status: "registered" },
  });
  const service = await testPrisma.service.create({
    data: { name: "Dash Service", slug: "dash-service", defaultDurationMinutes: 45, defaultPrice: "5000.00" },
  });
  return { therapist, patient, service };
}

describe("staff overview", () => {
  it("counts live rows and zeroes when empty", async () => {
    const admin = await testPrisma.user.create({
      data: { name: "Admin", phone: "+234800000001", passwordHash: "x", role: "admin" },
    });
    const actor = actorFor(admin.id, "admin");

    const empty = await getStaffOverview(actor);
    expect(empty.totalPatients).toBe(0);
    expect(empty.appointmentsToday).toBe(0);
    expect(empty.outstanding).toBe("0.00");

    const { therapist, patient, service } = await seedRest();

    const now = new Date();
    await testPrisma.appointment.create({
      data: {
        patientId: patient.id,
        therapistId: therapist.id,
        serviceId: service.id,
        scheduledStart: new Date(now.getTime() + 3_600_000),
        scheduledEnd: new Date(now.getTime() + 2 * 3_600_000),
        status: "scheduled",
        bookedVia: "staff",
      },
    });
    const invoice = await testPrisma.invoice.create({
      data: {
        invoiceNumber: "INV-DASH-1",
        patientId: patient.id,
        totalAmount: "15000.00",
        status: "unpaid",
        createdById: admin.id,
      },
    });
    void invoice;

    const full = await getStaffOverview(actor);
    expect(full.totalPatients).toBe(1);
    expect(full.appointmentsToday).toBe(1);
    expect(full.upcoming).toBe(1);
    expect(full.unpaidInvoices).toBe(1);
    expect(full.outstanding).toBe("15000.00");
    expect(full.today).toHaveLength(1);
    expect(full.recentInvoices).toHaveLength(1);
  });

  it("scopes the day list to the therapist's own visits", async () => {
    const { admin, therapist, patient, service } = await seedBasics();
    const other = await testPrisma.user.create({
      data: { name: "Other", phone: "+234800000003", passwordHash: "x", role: "therapist" },
    });
    const now = new Date();
    const mk = (therapistId: string) =>
      testPrisma.appointment.create({
        data: {
          patientId: patient.id,
          therapistId,
          serviceId: service.id,
          scheduledStart: new Date(now.getTime() + 3_600_000),
          scheduledEnd: new Date(now.getTime() + 2 * 3_600_000),
          status: "scheduled",
          bookedVia: "staff",
        },
      });
    await mk(therapist.id);
    await mk(other.id);

    const mine = await getStaffOverview(actorFor(therapist.id, "therapist"));
    expect(mine.today).toHaveLength(1);
    const all = await getStaffOverview(actorFor(admin.id, "admin"));
    expect(all.today).toHaveLength(2);
  });
});
