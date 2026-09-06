import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export function isGatewayConfigured(): boolean { return Boolean(env.PAYSTACK_SECRET_KEY); }
/** Decimal-string naira → integer kobo. String-split, never floats. */
export function nairaToKobo(naira: string): number {
  const [whole, frac = ""] = naira.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}
export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const digest = createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(digest), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function initializePayment(input: { email: string; amountKobo: number; invoiceId: string; callbackUrl: string }) {
  if (!isGatewayConfigured()) throw new Error("Online payment is not configured");
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: input.email, amount: input.amountKobo, callback_url: input.callbackUrl, metadata: { invoiceId: input.invoiceId } }),
  });
  if (!res.ok) throw new Error("Could not start the online payment. Try again.");
  const data = (await res.json()) as { status: boolean; data: { authorization_url: string; reference: string } };
  if (!data.status) throw new Error("Could not start the online payment. Try again.");
  return { authorizationUrl: data.data.authorization_url, reference: data.data.reference };
}
export async function verifyPayment(reference: string) {
  if (!isGatewayConfigured()) throw new Error("Online payment is not configured");
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
  });
  if (!res.ok) throw new Error("Could not verify the online payment. Try again.");
  const data = (await res.json()) as {
    status: boolean;
    data: { status: string; amount: number; metadata?: { invoiceId?: unknown } | null };
  };
  if (!data.status) throw new Error("Could not verify the online payment. Try again.");
  // The portal success page records against this invoice id (the callback URL
  // carries no invoice id, so verify is the only source). Null when Paystack
  // echoes no metadata — the caller fails closed.
  const rawInvoiceId = data.data.metadata?.invoiceId;
  return {
    paid: data.data.status === "success",
    amountKobo: data.data.amount,
    invoiceId: typeof rawInvoiceId === "string" ? rawInvoiceId : null,
  };
}
