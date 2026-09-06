import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import type { SessionUser } from "@/server/auth/session";
import {
  createInvoice,
  recordManualPayment,
  getPatientBalance,
  getRevenueByMethod,
} from "@/server/services/billing";

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

async function makeAdmin(phone: string) {
  return testPrisma.user.create({
    data: { name: "Admin", phone, passwordHash: "x", role: "admin" },
  });
}

async function makePatient(code: string, phone: string) {
  return testPrisma.patient.create({
    data: { patientCode: code, fullName: code, phone, status: "registered" },
  });
}

describe("billing staff views", () => {
  it("groups today's revenue by method with string totals", async () => {
    const admin = await makeAdmin("+2348013000001");
    const patient = await makePatient("TS-00001", "+2348023000001");
    const a = actor({ id: admin.id, role: "admin" });

    const first = await createInvoice(a, {
      patientId: patient.id,
      items: [{ description: "Session", quantity: 1, unitPrice: "10000" }],
    });
    const second = await createInvoice(a, {
      patientId: patient.id,
      items: [{ description: "Assessment", quantity: 1, unitPrice: "5000" }],
    });
    await recordManualPayment(a, { invoiceId: first.id, amount: "4000", method: "cash" });
    await recordManualPayment(a, { invoiceId: first.id, amount: "2000", method: "cash" });
    await recordManualPayment(a, { invoiceId: second.id, amount: "5000", method: "pos" });

    const revenue = await getRevenueByMethod(new Date("2020-01-01"), new Date("2030-01-01"));
    const byMethod = new Map(revenue.map((r) => [r.method, r.total]));
    expect(byMethod.get("cash")).toBe("6000.00");
    expect(byMethod.get("pos")).toBe("5000.00");
  });

  it("patient balance sums remainders only, skipping fully paid invoices", async () => {
    const admin = await makeAdmin("+2348013000002");
    const patient = await makePatient("TS-00002", "+2348023000002");
    const a = actor({ id: admin.id, role: "admin" });

    const settled = await createInvoice(a, {
      patientId: patient.id,
      items: [{ description: "Session", quantity: 1, unitPrice: "8000" }],
    });
    await recordManualPayment(a, { invoiceId: settled.id, amount: "8000", method: "cash" });

    const open = await createInvoice(a, {
      patientId: patient.id,
      items: [{ description: "Session", quantity: 1, unitPrice: "10000" }],
    });
    await recordManualPayment(a, { invoiceId: open.id, amount: "3000", method: "bank_transfer" });

    expect(await getPatientBalance(patient.id)).toBe("7000.00");
  });
});
