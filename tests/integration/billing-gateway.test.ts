import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";
import { createHmac } from "node:crypto";
import { testPrisma, truncateAll } from "../helpers/db";
import type { SessionUser } from "@/server/auth/session";
import { createInvoice } from "@/server/services/billing";

const SECRET = "test-webhook-secret";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await testPrisma.$disconnect();
});

/** Route module reads env at import; stub the key and import fresh. */
async function freshWebhook() {
  vi.stubEnv("PAYSTACK_SECRET_KEY", SECRET);
  vi.resetModules();
  try {
    return await import("@/app/api/payments/paystack/webhook/route");
  } finally {
    vi.unstubAllEnvs();
  }
}

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
async function makeInvoice(total: string) {
  n += 1;
  const admin = await testPrisma.user.create({
    data: { name: "Admin", phone: `+23480330000${String(n).padStart(2, "0")}`, passwordHash: "x", role: "admin" },
  });
  const patient = await testPrisma.patient.create({
    data: { patientCode: `TG-${String(n).padStart(5, "0")}`, fullName: `Gateway ${n}`, phone: `+23480440000${String(n).padStart(2, "0")}`, status: "registered" },
  });
  return createInvoice(actor({ id: admin.id, role: "admin" }), {
    patientId: patient.id,
    items: [{ description: "Session", quantity: 1, unitPrice: total }],
  });
}

function webhookRequest(rawBody: string, secret: string) {
  const sig = createHmac("sha512", secret).update(rawBody).digest("hex");
  return new Request("http://localhost/api/payments/paystack/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-paystack-signature": sig },
    body: rawBody,
  });
}

function chargeSuccess(invoiceId: string, amountKobo: number, reference: string) {
  return JSON.stringify({
    event: "charge.success",
    data: { reference, amount: amountKobo, metadata: { invoiceId } },
  });
}

describe("paystack webhook", () => {
  it("records a charge.success webhook as an online_gateway payment with null recorder", async () => {
    const { POST } = await freshWebhook();
    const inv = await makeInvoice("10000");

    const res = await POST(webhookRequest(chargeSuccess(inv.id, 1000000, "gw-ref-1"), SECRET));
    expect(res.status).toBe(200);

    const payments = await testPrisma.payment.findMany({ where: { invoiceId: inv.id } });
    expect(payments).toHaveLength(1);
    const payment = payments[0]!;
    expect(payment.method).toBe("online_gateway");
    expect(payment.providerReference).toBe("gw-ref-1");
    expect(payment.recordedById).toBeNull();
    expect(Number(payment.amount)).toBe(10000);

    const updated = await testPrisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(updated.status).toBe("paid");
  });

  it("replaying the same webhook twice records one payment (idempotent, both 200)", async () => {
    const { POST } = await freshWebhook();
    const inv = await makeInvoice("5000");
    const body = chargeSuccess(inv.id, 500000, "gw-ref-replay");

    const first = await POST(webhookRequest(body, SECRET));
    const second = await POST(webhookRequest(body, SECRET));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const count = await testPrisma.payment.count({ where: { providerReference: "gw-ref-replay" } });
    expect(count).toBe(1);
  });

  it("a forged signature is rejected with 401 and records nothing", async () => {
    const { POST } = await freshWebhook();
    const inv = await makeInvoice("5000");

    const res = await POST(webhookRequest(chargeSuccess(inv.id, 500000, "gw-ref-forged"), "wrong-secret"));
    expect(res.status).toBe(401);

    const count = await testPrisma.payment.count({ where: { invoiceId: inv.id } });
    expect(count).toBe(0);
  });

  it("a gateway overpayment above the remainder is rejected-and-skipped with 200 and records nothing (no overpayments, anywhere)", async () => {
    const { POST } = await freshWebhook();
    const inv = await makeInvoice("5000");

    const res = await POST(webhookRequest(chargeSuccess(inv.id, 99999900, "gw-ref-over"), SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, skipped: "overpayment" });

    const count = await testPrisma.payment.count({ where: { invoiceId: inv.id } });
    expect(count).toBe(0);
    const updated = await testPrisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(updated.status).toBe("unpaid");
  });

  it("non-charge.success events are ignored with 200", async () => {
    const { POST } = await freshWebhook();
    const inv = await makeInvoice("5000");
    const body = JSON.stringify({ event: "charge.failed", data: { reference: "gw-ref-fail", amount: 500000, metadata: { invoiceId: inv.id } } });

    const res = await POST(webhookRequest(body, SECRET));
    expect(res.status).toBe(200);

    const count = await testPrisma.payment.count({ where: { invoiceId: inv.id } });
    expect(count).toBe(0);
  });
});
