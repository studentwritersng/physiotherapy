import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import {
  createSession,
  resolveSession,
  revokeSession,
  revokeAllSessions,
  hashToken,
  sessionCookieOptions,
} from "@/server/auth/session";
import { SESSION_TTL_SECONDS } from "@/lib/constants";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function makeUser() {
  return testPrisma.user.create({
    data: {
      name: "Session User",
      email: "session@example.com",
      phone: "+2348010000001",
      passwordHash: "x",
      role: "therapist",
    },
  });
}

describe("sessions", () => {
  it("returns a raw token and stores only its hash", async () => {
    const user = await makeUser();
    const raw = await createSession(user.id);

    expect(raw).toMatch(/^[0-9a-f]{64}$/);

    const rows = await testPrisma.session.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(raw);
    expect(rows[0]!.tokenHash).toBe(hashToken(raw));
  });

  it("resolves a valid token to the user", async () => {
    const user = await makeUser();
    const raw = await createSession(user.id);

    const resolved = await resolveSession(raw);
    expect(resolved?.id).toBe(user.id);
    expect(resolved?.role).toBe("therapist");
    expect(resolved?.mustResetPassword).toBe(false);
  });

  it("returns null for undefined, unknown and malformed tokens", async () => {
    expect(await resolveSession(undefined)).toBeNull();
    expect(await resolveSession("deadbeef")).toBeNull();
    expect(await resolveSession("")).toBeNull();
  });

  it("returns null for an expired session and deletes the row", async () => {
    const user = await makeUser();
    const raw = await createSession(user.id);
    await testPrisma.session.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await resolveSession(raw)).toBeNull();
    expect(await testPrisma.session.count()).toBe(0);
  });

  it("returns null for a soft-deleted or inactive user", async () => {
    const user = await makeUser();
    const raw = await createSession(user.id);

    await testPrisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
    expect(await resolveSession(raw)).toBeNull();

    await testPrisma.user.update({
      where: { id: user.id },
      data: { deletedAt: null, status: "inactive" },
    });
    expect(await resolveSession(raw)).toBeNull();
  });

  it("does not slide expiry on a freshly used session", async () => {
    const user = await makeUser();
    const raw = await createSession(user.id);
    const before = await testPrisma.session.findFirstOrThrow();

    await resolveSession(raw);

    const after = await testPrisma.session.findFirstOrThrow();
    expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());
  });

  it("slides expiry once the session has been idle beyond the threshold", async () => {
    const user = await makeUser();
    const raw = await createSession(user.id);

    const stale = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await testPrisma.session.updateMany({ data: { lastUsedAt: stale } });
    const before = await testPrisma.session.findFirstOrThrow();

    await resolveSession(raw);

    const after = await testPrisma.session.findFirstOrThrow();
    expect(after.expiresAt.getTime()).toBeGreaterThan(before.expiresAt.getTime());
    expect(after.lastUsedAt.getTime()).toBeGreaterThan(stale.getTime());
  });

  it("revokes a single session immediately", async () => {
    const user = await makeUser();
    const raw = await createSession(user.id);

    await revokeSession(raw);

    expect(await resolveSession(raw)).toBeNull();
    expect(await testPrisma.session.count()).toBe(0);
  });

  it("revokes every session for a user", async () => {
    const user = await makeUser();
    const a = await createSession(user.id);
    const b = await createSession(user.id);
    expect(await testPrisma.session.count()).toBe(2);

    await revokeAllSessions(user.id);

    expect(await resolveSession(a)).toBeNull();
    expect(await resolveSession(b)).toBeNull();
  });

  it("issues cookie options that match the spec", () => {
    const opts = sessionCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBe(SESSION_TTL_SECONDS);
  });
});
