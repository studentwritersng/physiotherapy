import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import type { SessionUser } from "@/server/auth/session";
import { createInvoice, recordManualPayment } from "@/server/services/billing";
import { getPortalBilling, prepareOnlinePayment } from "@/server/services/portal";
import { initializePayment } from "@/server/payments/paystack";

vi.mock("@/server/payments/paystack", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/payments/paystack")>();
  return { ...actual, initializePayment: vi.fn() };
});

const mockedInitialize = vi.mocked(initializePayment);

beforeEach(async () => {
  await truncateAll();
  mockedInitialize.mockReset();
  mockedInitialize.mockResolvedValue({
    authorizationUrl: "https://paystack.test/pay/abc",
    reference: "test-ref-1",
  });
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

let n = 0;
let m = 0;
async function makePatient(code: string, email: string | null) {
  n += 1;
  return testPrisma.patient.create({
    data: {
      patientCode: code,
      fullName: code,
      phone: `+2348055000${String(n).padStart(3, "0")}`,
      email,
      status: "registered",
    },
  });
}

async function makeOpenInvoice(patientId: string, unitPrice: string) {
  m += 1;
  const admin = await testPrisma.user.create({
    data: { name: "Admin", phone: `+2348036000${String(m).padStart(3, "0")}`, passwordHash: "x", role: "admin" },
  });
  return createInvoice(actor({ id: admin.id, role: "admin" }), {
    patientId,
    items: [{ description: "Session", quantity: 1, unitPrice }],
  });
}

describe("getPortalBilling scoping", () => {
  it("patient B sees none of patient A's invoices or payments", async () => {
    const a = await makePatient("PB-00001", "a@example.com");
    const b = await makePatient("PB-00002", "b@example.com");
    const inv = await makeOpenInvoice(a.id, "10000");
    const admin = await testPrisma.user.findFirstOrThrow({ where: { role: "admin" } });
    await recordManualPayment(actor({ id: admin.id, role: "admin" }), {
      invoiceId: inv.id,
      amount: "4000",
      method: "cash",
    });

    const billingB = await getPortalBilling(b.id);
    expect(billingB.invoices).toHaveLength(0);
    expect(billingB.payments).toHaveLength(0);
    expect(billingB.balanceDue).toBe("0.00");
  });

  it("returns open invoices with items, paid sums and remainder strings, newest-first payments", async () => {
    const a = await makePatient("PB-00011", "a11@example.com");
    const inv = await makeOpenInvoice(a.id, "10000");
    const admin = await testPrisma.user.findFirstOrThrow({ where: { role: "admin" } });
    await recordManualPayment(actor({ id: admin.id, role: "admin" }), {
      invoiceId: inv.id,
      amount: "4000",
      method: "cash",
    });
    // A fully paid invoice leaves the open list but stays in history.
    const paidInv = await makeOpenInvoice(a.id, "5000");
    await recordManualPayment(actor({ id: admin.id, role: "admin" }), {
      invoiceId: paidInv.id,
      amount: "5000",
      method: "pos",
    });

    const billing = await getPortalBilling(a.id);
    expect(billing.invoices).toHaveLength(1);
    const [open] = billing.invoices;
    expect(open!.invoiceNumber).toBe(inv.invoiceNumber);
    expect(open!.items).toHaveLength(1);
    expect(open!.items[0]).toMatchObject({ description: "Session", quantity: 1 });
    expect(open!.paid).toBe("4000.00");
    expect(open!.remainder).toBe("6000.00");
    expect(billing.balanceDue).toBe("6000.00");

    expect(billing.payments).toHaveLength(2);
    // Newest first: the full 5000 payment was recorded last.
    expect(billing.payments[0]!.amount).toBe("5000.00");
    expect(billing.payments[1]!.amount).toBe("4000.00");
    for (const p of billing.payments) {
      expect(typeof p.method).toBe("string");
      expect(p.invoiceNumber.length).toBeGreaterThan(0);
    }
  });
});

describe("prepareOnlinePayment fail-closed", () => {
  it("a forged invoice id belonging to another patient fails closed and never initializes", async () => {
    const a = await makePatient("PB-00021", "a21@example.com");
    const b = await makePatient("PB-00022", "b22@example.com");
    const inv = await makeOpenInvoice(a.id, "10000");

    await expect(prepareOnlinePayment({ patientId: b.id, invoiceId: inv.id })).rejects.toThrow(
      /not found/i,
    );
    expect(mockedInitialize).not.toHaveBeenCalled();
  });

  it("a null patient email fails closed and never initializes", async () => {
    const a = await makePatient("PB-00031", null);
    const inv = await makeOpenInvoice(a.id, "10000");

    await expect(prepareOnlinePayment({ patientId: a.id, invoiceId: inv.id })).rejects.toThrow(
      /email/i,
    );
    expect(mockedInitialize).not.toHaveBeenCalled();
  });

  it("a fully paid invoice fails closed and never initializes", async () => {
    const a = await makePatient("PB-00041", "a41@example.com");
    const inv = await makeOpenInvoice(a.id, "5000");
    const admin = await testPrisma.user.findFirstOrThrow({ where: { role: "admin" } });
    await recordManualPayment(actor({ id: admin.id, role: "admin" }), {
      invoiceId: inv.id,
      amount: "5000",
      method: "cash",
    });

    await expect(prepareOnlinePayment({ patientId: a.id, invoiceId: inv.id })).rejects.toThrow(
      /paid|balance|remainder/i,
    );
    expect(mockedInitialize).not.toHaveBeenCalled();
  });

  it("initializes for the remainder in kobo with the portal success callback", async () => {
    const a = await makePatient("PB-00051", "a51@example.com");
    const inv = await makeOpenInvoice(a.id, "10000");
    const admin = await testPrisma.user.findFirstOrThrow({ where: { role: "admin" } });
    await recordManualPayment(actor({ id: admin.id, role: "admin" }), {
      invoiceId: inv.id,
      amount: "4000",
      method: "cash",
    });

    const result = await prepareOnlinePayment({ patientId: a.id, invoiceId: inv.id });
    expect(result.authorizationUrl).toBe("https://paystack.test/pay/abc");
    expect(mockedInitialize).toHaveBeenCalledTimes(1);
    expect(mockedInitialize).toHaveBeenCalledWith({
      email: "a51@example.com",
      amountKobo: 600000,
      invoiceId: inv.id,
      callbackUrl: expect.stringMatching(/\/portal\/billing\/success$/),
    });
  });
});
