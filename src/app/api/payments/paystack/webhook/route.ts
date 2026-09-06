import "server-only";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { jsonError } from "@/server/http";
import { verifyWebhookSignature } from "@/server/payments/paystack";
import { recordGatewayPayment } from "@/server/services/billing";

/** Kobo (Paystack integer) → Decimal(12,2) string. Integer math only. */
function koboToDecimalString(kobo: number): string {
  return `${Math.trunc(kobo / 100)}.${String(Math.abs(kobo % 100)).padStart(2, "0")}`;
}

type ChargeEvent = {
  event?: unknown;
  data?: {
    reference?: unknown;
    amount?: unknown;
    metadata?: { invoiceId?: unknown } | null;
  } | null;
};

/**
 * No requireRole/requireSession here on purpose: Paystack calls this with no
 * session cookie, so the HMAC-SHA512 signature check against
 * PAYSTACK_SECRET_KEY IS the authorization. Always 200 on handled-or-duplicate
 * (replays hit the idempotent recordGatewayPayment path); 401 on forged
 * signature; over-amount webhooks are rejected-and-logged with a 200 skip so
 * Paystack stops retrying — the manual no-overpayment rule applies to gateway
 * money too.
 */
export async function POST(req: Request) {
  const secret = env.PAYSTACK_SECRET_KEY;
  if (!secret) return jsonError(503, "Online payment is not configured");

  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");
  if (!signature || !verifyWebhookSignature(rawBody, signature, secret)) {
    return jsonError(401, "Invalid webhook signature");
  }

  let event: ChargeEvent;
  try {
    event = JSON.parse(rawBody) as ChargeEvent;
  } catch {
    return jsonError(400, "Invalid webhook payload");
  }

  if (event?.event !== "charge.success") {
    return NextResponse.json({ ok: true, ignored: event?.event ?? null });
  }

  const invoiceId = event.data?.metadata?.invoiceId;
  const reference = event.data?.reference;
  const amountKobo = event.data?.amount;
  if (typeof invoiceId !== "string" || typeof reference !== "string" || typeof amountKobo !== "number") {
    return jsonError(400, "Invalid webhook payload");
  }
  // Signed payloads still get shape-checked: a negative or fractional amount
  // must never become a positive payment (koboToDecimalString drops signs).
  if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
    return jsonError(400, "Invalid webhook amount");
  }

  try {
    await recordGatewayPayment({
      invoiceId,
      amount: koboToDecimalString(amountKobo),
      providerReference: reference,
    });
  } catch (error) {
    if (error instanceof Error && /exceed/i.test(error.message)) {
      console.warn("[paystack webhook] gateway overpayment skipped", { reference, invoiceId });
      return NextResponse.json({ ok: true, skipped: "overpayment" });
    }
    console.error("[paystack webhook] unhandled error", error);
    return jsonError(500, "Something went wrong");
  }
  return NextResponse.json({ ok: true });
}
