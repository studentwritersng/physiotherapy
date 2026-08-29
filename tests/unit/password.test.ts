import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";

describe("password hashing", () => {
  it("produces an argon2id hash", async () => {
    const hash = await hashPassword("correct1horse");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("verifies the correct password", async () => {
    const hash = await hashPassword("correct1horse");
    expect(await verifyPassword(hash, "correct1horse")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct1horse");
    expect(await verifyPassword(hash, "wrong1horse")).toBe(false);
  });

  it("produces a different hash for the same input (unique salt)", async () => {
    const a = await hashPassword("correct1horse");
    const b = await hashPassword("correct1horse");
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, "correct1horse")).toBe(true);
    expect(await verifyPassword(b, "correct1horse")).toBe(true);
  });

  it("returns false rather than throwing on a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "correct1horse")).toBe(false);
  });
});
