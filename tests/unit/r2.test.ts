import { describe, expect, it, vi } from "vitest";
import { buildDocumentKey, MAX_DOCUMENT_BYTES } from "@/server/storage/r2";

const R2_KEYS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

/**
 * env.ts parses process.env once at import, so ambient credentials (live
 * .env under a full `vitest run`) would leak into these assertions. Strip or
 * set the four keys, reset the module registry, and re-import fresh — then
 * restore, so no other test observes the tampering.
 */
async function freshR2(env: Record<string, string | undefined>) {
  const saved = new Map(R2_KEYS.map((k) => [k, process.env[k]] as const));
  for (const k of R2_KEYS) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  vi.resetModules();
  try {
    return await import("@/server/storage/r2");
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const FAKE_CREDS = {
  R2_ACCOUNT_ID: "test-account",
  R2_ACCESS_KEY_ID: "test-key",
  R2_SECRET_ACCESS_KEY: "test-secret",
  R2_BUCKET: "test-bucket",
};

describe("r2", () => {
  it("is not configured without credentials, regardless of ambient env", async () => {
    const { isStorageConfigured } = await freshR2({});
    expect(isStorageConfigured()).toBe(false);
  });

  it("is configured when all four keys are present", async () => {
    const { isStorageConfigured } = await freshR2(FAKE_CREDS);
    expect(isStorageConfigured()).toBe(true);
  });

  it("rejects non-PDF/image types and oversize files without signing", async () => {
    // No credentials: validation must fail identically with or without them.
    const { presignedPutUrl } = await freshR2({});
    await expect(
      presignedPutUrl({ patientId: "p", fileName: "evil.exe", contentType: "application/x-msdownload", sizeBytes: 100 }),
    ).rejects.toThrow(/type/i);
    await expect(
      presignedPutUrl({ patientId: "p", fileName: "big.pdf", contentType: "application/pdf", sizeBytes: MAX_DOCUMENT_BYTES + 1 }),
    ).rejects.toThrow(/size|10\s?MB/i);
  });

  it("builds scoped keys", () => {
    expect(buildDocumentKey("p1", "X-Ray (1).PDF")).toMatch(/^patients\/p1\/[0-9a-f-]{36}-x-ray-1\.pdf$/);
  });
});
