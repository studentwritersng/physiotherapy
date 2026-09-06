import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { nairaToKobo, verifyWebhookSignature } from "@/server/payments/paystack";

/**
 * env.ts parses process.env once at import, so the ambient .env (which may or
 * may not set PAYSTACK_SECRET_KEY) would leak into this assertion. Same
 * fresh-module technique as tests/unit/r2.test.ts: strip the key, reset the
 * module registry, re-import fresh — then restore.
 */
async function freshPaystack(env: Record<string, string | undefined>) {
  const saved = process.env.PAYSTACK_SECRET_KEY;
  if (env.PAYSTACK_SECRET_KEY === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = env.PAYSTACK_SECRET_KEY;
  vi.resetModules();
  try {
    return await import("@/server/payments/paystack");
  } finally {
    if (saved === undefined) delete process.env.PAYSTACK_SECRET_KEY;
    else process.env.PAYSTACK_SECRET_KEY = saved;
  }
}

describe("paystack", () => {
  it("converts without float artefacts", () => {
    expect(nairaToKobo("8000.50")).toBe(800050);
    expect(nairaToKobo("15000")).toBe(1500000);
  });
  it("verifies a known HMAC-SHA512 vector", () => {
    const body = '{"event":"charge.success"}';
    const sig = createHmac("sha512", "test-secret").update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig, "test-secret")).toBe(true);
    expect(verifyWebhookSignature(body, sig + "0", "test-secret")).toBe(false);
  });
  it("is not configured without the key", async () => {
    // same env-isolation pattern as tests/unit/r2.test.ts — read that file first and copy the freshR2 technique for PAYSTACK_SECRET_KEY.
    const { isGatewayConfigured } = await freshPaystack({});
    expect(isGatewayConfigured()).toBe(false);
  });
});
