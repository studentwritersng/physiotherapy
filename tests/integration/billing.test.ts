import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import type { SessionUser } from "@/server/auth/session";
import {
  createInvoice,
  recordManualPayment,
  getInvoiceWithBalance,
  getPatientBalance,
  getClinicOutstanding,
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

async function makeTherapist(phone: string) {
  return testPrisma.user.create({
    data: { name: "Dr. T", phone, passwordHash: "x", role: "therapist" },
  });
}

async function makePatient(code: string, phone: string) {
  return testPrisma.patient.create({
    data: { patientCode: code, fullName: code, phone, status: "registered" },
  });
}

describe("billing service core", () => {
  it("computes totals server-side and ignores client arithmetic", async () => {
    const admin = await makeAdmin("+2348012000001");
    const patient = await makePatient("TB-00001", "+2348022000001");
    const a = actor({ id: admin.id, role: "admin" });

    const inv = await createInvoice(a, {
      patientId: patient.id,
      items: [
        { description: "Assessment", quantity: 1, unitPrice: "15000" },
        { description: "Session", quantity: 2, unitPrice: "8000.50" },
      ],
    });
    // 15000 + 2×8000.50 = 31001, computed in integer kobo (no floats).
    // Prisma normalizes Decimal to canonical form (trailing zeros stripped),
    // so compare the value rather than the string (service-catalog convention).
    expect(Number(inv.totalAmount)).toBe(31001);
    expect(inv.status).toBe("unpaid");
  });

  it("partial then full payment flips unpaid → partially_paid → paid", async () => {
    const admin = await makeAdmin("+2348012000002");
    const patient = await makePatient("TB-00002", "+2348022000002");
    const a = actor({ id: admin.id, role: "admin" });

    const inv = await createInvoice(a, {
      patientId: patient.id,
      items: [{ description: "Session", quantity: 1, unitPrice: "10000" }],
    });
    expect(inv.status).toBe("unpaid");

    await recordManualPayment(a, { invoiceId: inv.id, amount: "4000", method: "cash" });
    const mid = await getInvoiceWithBalance(inv.id);
    expect(mid.invoice.status).toBe("partially_paid");
    expect(mid.paid).toBe("4000.00");
    expect(mid.remainder).toBe("6000.00");

    await recordManualPayment(a, { invoiceId: inv.id, amount: "6000", method: "pos" });
    const done = await getInvoiceWithBalance(inv.id);
    expect(done.invoice.status).toBe("paid");
    expect(done.paid).toBe("10000.00");
    expect(done.remainder).toBe("0.00");
  });

  it("rejects overpayment above the remainder", async () => {
    const admin = await makeAdmin("+2348012000003");
    const patient = await makePatient("TB-00003", "+2348022000003");
    const a = actor({ id: admin.id, role: "admin" });

    const inv = await createInvoice(a, {
      patientId: patient.id,
      items: [{ description: "Session", quantity: 1, unitPrice: "5000" }],
    });
    await expect(
      recordManualPayment(a, { invoiceId: inv.id, amount: "999999", method: "cash" }),
    ).rejects.toThrow(/exceed/i);
  });

  it("a therapist cannot create invoices or record payments", async () => {
    const admin = await makeAdmin("+2348012000004");
    const therapist = await makeTherapist("+2348012000005");
    const patient = await makePatient("TB-00004", "+2348022000004");
    const a = actor({ id: admin.id, role: "admin" });
    const t = actor({ id: therapist.id, role: "therapist" });

    await expect(
      createInvoice(t, {
        patientId: patient.id,
        items: [{ description: "Session", quantity: 1, unitPrice: "5000" }],
      }),
    ).rejects.toThrow(/forbidden|permission|role|restricted/i);

    const inv = await createInvoice(a, {
      patientId: patient.id,
      items: [{ description: "Session", quantity: 1, unitPrice: "5000" }],
    });
    await expect(
      recordManualPayment(t, { invoiceId: inv.id, amount: "1000", method: "cash" }),
    ).rejects.toThrow(/forbidden|permission|role|restricted/i);
  });

  it("tracks patient balance, clinic outstanding and revenue by method", async () => {
    const admin = await makeAdmin("+2348012000006");
    const patient = await makePatient("TB-00005", "+2348022000005");
    const a = actor({ id: admin.id, role: "admin" });

    const inv = await createInvoice(a, {
      patientId: patient.id,
      items: [{ description: "Session", quantity: 1, unitPrice: "10000" }],
    });
    await recordManualPayment(a, { invoiceId: inv.id, amount: "3000", method: "cash" });

    expect(await getPatientBalance(patient.id)).toBe("7000.00");
    expect(await getClinicOutstanding()).toBe("7000.00");

    const revenue = await getRevenueByMethod(new Date("2020-01-01"), new Date("2030-01-01"));
    const cash = revenue.find((r) => r.method === "cash");
    expect(cash?.total).toBe("3000.00");
  });

  it("rejects online_gateway on the manual payment path", async () => {
    const admin = await makeAdmin("+2348012000007");
    const patient = await makePatient("TB-00006", "+2348022000006");
    const a = actor({ id: admin.id, role: "admin" });

    const inv = await createInvoice(a, {
      patientId: patient.id,
      items: [{ description: "Session", quantity: 1, unitPrice: "5000" }],
    });
    await expect(
      // @ts-expect-error — online_gateway is gateway-recorded, never manual
      recordManualPayment(a, { invoiceId: inv.id, amount: "1000", method: "online_gateway" }),
    ).rejects.toThrow(/automatically|manual/i);
  });
});
