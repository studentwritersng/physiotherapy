import { describe, expect, it } from "vitest";
import { isStorageConfigured, buildDocumentKey, MAX_DOCUMENT_BYTES } from "@/server/storage/r2";

describe("r2", () => {
  it("is not configured without credentials", () => {
    expect(isStorageConfigured()).toBe(false); // CI has no R2_* set
  });
  it("rejects non-PDF/image types and oversize files without signing", async () => {
    const { presignedPutUrl } = await import("@/server/storage/r2");
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
