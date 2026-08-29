import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import { audit } from "@/server/audit";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function makeAdmin() {
  return testPrisma.user.create({
    data: {
      name: "Audit Admin",
      email: "audit.admin@example.com",
      phone: "+2348010000099",
      passwordHash: "x",
      role: "admin",
    },
  });
}

describe("audit", () => {
  it("writes an entry with actor, action and IP", async () => {
    const admin = await makeAdmin();
    await audit({
      userId: admin.id,
      action: "login_success",
      entityType: "user",
      entityId: admin.id,
      ipAddress: "127.0.0.1",
    });

    const rows = await testPrisma.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe("login_success");
    expect(rows[0]!.userId).toBe(admin.id);
    expect(rows[0]!.ipAddress).toBe("127.0.0.1");
  });

  it("accepts a null actor for a failed login on an unknown identifier", async () => {
    await audit({ userId: null, action: "login_failure", metadata: { identifier: "+2340000" } });
    const rows = await testPrisma.auditLog.findMany();
    expect(rows[0]!.userId).toBeNull();
    expect(rows[0]!.metadata).toEqual({ identifier: "+2340000" });
  });

  it("never stores a password even if one is passed in metadata", async () => {
    await audit({
      userId: null,
      action: "login_failure",
      metadata: { identifier: "+2340000", password: "secret123", token: "abc" },
    });
    const rows = await testPrisma.auditLog.findMany();
    const meta = rows[0]!.metadata as Record<string, unknown>;
    expect(meta.identifier).toBe("+2340000");
    expect(meta.password).toBeUndefined();
    expect(meta.token).toBeUndefined();
  });

  it("does not throw when the audit write fails", async () => {
    // A non-existent user id violates the FK; audit must swallow it so that a
    // logging failure can never break the action being logged.
    await expect(
      audit({ userId: "00000000-0000-0000-0000-000000000000", action: "login_success" }),
    ).resolves.toBeUndefined();
  });
});
