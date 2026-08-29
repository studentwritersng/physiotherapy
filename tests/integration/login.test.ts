import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import { login, registerPatient, changePassword, normalisePhone } from "@/server/auth/login";
import { hashPassword } from "@/server/auth/password";
import { resolveSession } from "@/server/auth/session";
import { RATE_LIMIT_MAX_ATTEMPTS } from "@/lib/constants";

const META = { ipAddress: "127.0.0.1", userAgent: "vitest" };

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function makeStaff(over: { status?: "active" | "inactive"; mustReset?: boolean } = {}) {
  return testPrisma.user.create({
    data: {
      name: "Dr Staff",
      email: "staff@example.com",
      phone: "+2348010000001",
      passwordHash: await hashPassword("correct1horse"),
      role: "therapist",
      status: over.status ?? "active",
      mustResetPassword: over.mustReset ?? false,
    },
  });
}

describe("normalisePhone", () => {
  it("converts every accepted format to E.164", () => {
    expect(normalisePhone("08031234567")).toBe("+2348031234567");
    expect(normalisePhone("2348031234567")).toBe("+2348031234567");
    expect(normalisePhone("+2348031234567")).toBe("+2348031234567");
    expect(normalisePhone(" 0803 123 4567 ")).toBe("+2348031234567");
  });
});

describe("login", () => {
  it("succeeds by email and returns a working session token", async () => {
    const user = await makeStaff();
    const result = await login(
      { identifier: "staff@example.com", password: "correct1horse" },
      META,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe(user.id);
      expect(await resolveSession(result.token)).not.toBeNull();
    }
  });

  it("succeeds by phone in local format", async () => {
    await makeStaff();
    const result = await login({ identifier: "08010000001", password: "correct1horse" }, META);
    expect(result.ok).toBe(true);
  });

  it("is case-insensitive on email", async () => {
    await makeStaff();
    const result = await login(
      { identifier: "STAFF@example.com", password: "correct1horse" },
      META,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a wrong password with invalid_credentials", async () => {
    await makeStaff();
    const result = await login({ identifier: "staff@example.com", password: "wrong1pass" }, META);
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("returns invalid_credentials for an unknown identifier, not a distinct error", async () => {
    const result = await login({ identifier: "ghost@example.com", password: "whatever1" }, META);
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("rejects a deactivated account", async () => {
    await makeStaff({ status: "inactive" });
    const result = await login(
      { identifier: "staff@example.com", password: "correct1horse" },
      META,
    );
    expect(result).toEqual({ ok: false, reason: "account_inactive" });
  });

  it("rejects a soft-deleted account as invalid credentials", async () => {
    const user = await makeStaff();
    await testPrisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
    const result = await login(
      { identifier: "staff@example.com", password: "correct1horse" },
      META,
    );
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("throttles after too many failures and reports retryAfterSeconds", async () => {
    await makeStaff();
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
      await login({ identifier: "staff@example.com", password: "wrong1pass" }, META);
    }

    const result = await login(
      { identifier: "staff@example.com", password: "correct1horse" },
      META,
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "rate_limited") {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    } else {
      throw new Error("expected rate_limited");
    }
  });

  it("clears the throttle bucket after a successful login", async () => {
    await makeStaff();
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS - 1; i++) {
      await login({ identifier: "staff@example.com", password: "wrong1pass" }, META);
    }
    expect(
      (await login({ identifier: "staff@example.com", password: "correct1horse" }, META)).ok,
    ).toBe(true);
    expect(await testPrisma.loginAttempt.count()).toBe(0);
  });

  it("records lastLoginAt and audits success and failure", async () => {
    await makeStaff();
    await login({ identifier: "staff@example.com", password: "wrong1pass" }, META);
    await login({ identifier: "staff@example.com", password: "correct1horse" }, META);

    const user = await testPrisma.user.findFirstOrThrow();
    expect(user.lastLoginAt).not.toBeNull();

    const actions = (await testPrisma.auditLog.findMany()).map((a) => a.action);
    expect(actions).toContain("login_failure");
    expect(actions).toContain("login_success");
  });

  it("surfaces mustResetPassword so the caller can force a change", async () => {
    await makeStaff({ mustReset: true });
    const result = await login(
      { identifier: "staff@example.com", password: "correct1horse" },
      META,
    );
    expect(result.ok && result.user.mustResetPassword).toBe(true);
  });
});

describe("registerPatient", () => {
  it("creates a user, a linked patient record and a session", async () => {
    const result = await registerPatient(
      { fullName: "Ada Obi", phone: "08031234567", email: "ada@example.com", password: "newpass1" },
      META,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const user = await testPrisma.user.findFirstOrThrow({ where: { role: "patient" } });
    expect(user.phone).toBe("+2348031234567");

    const patient = await testPrisma.patient.findFirstOrThrow();
    expect(patient.userId).toBe(user.id);
    expect(patient.status).toBe("registered");
    expect(patient.patientCode).toMatch(/^TP-\d{5}$/);

    expect(await resolveSession(result.token)).not.toBeNull();
  });

  it("claims an existing walk-in lead with the same phone instead of duplicating", async () => {
    const lead = await testPrisma.patient.create({
      data: {
        patientCode: "TP-00001",
        fullName: "Ada Obi",
        phone: "+2348031234567",
        status: "lead",
      },
    });

    const result = await registerPatient(
      { fullName: "Ada Obi", phone: "08031234567", password: "newpass1" },
      META,
    );
    expect(result.ok).toBe(true);

    expect(await testPrisma.patient.count()).toBe(1);
    const claimed = await testPrisma.patient.findUniqueOrThrow({ where: { id: lead.id } });
    expect(claimed.status).toBe("registered");
    expect(claimed.userId).not.toBeNull();
  });

  it("refuses when the phone already belongs to a login", async () => {
    await registerPatient({ fullName: "Ada Obi", phone: "08031234567", password: "newpass1" }, META);
    const again = await registerPatient(
      { fullName: "Someone Else", phone: "08031234567", password: "newpass1" },
      META,
    );
    expect(again).toEqual({ ok: false, reason: "phone_taken" });
  });

  it("issues sequential patient codes", async () => {
    await registerPatient({ fullName: "One", phone: "08031234567", password: "newpass1" }, META);
    await registerPatient({ fullName: "Two", phone: "08039999999", password: "newpass1" }, META);

    const codes = (await testPrisma.patient.findMany({ orderBy: { createdAt: "asc" } })).map(
      (p) => p.patientCode,
    );
    expect(codes).toEqual(["TP-00001", "TP-00002"]);
  });
});

describe("changePassword", () => {
  it("changes the password, clears mustResetPassword and revokes other sessions", async () => {
    const user = await makeStaff({ mustReset: true });
    const first = await login({ identifier: "staff@example.com", password: "correct1horse" }, META);
    expect(first.ok).toBe(true);

    const result = await changePassword(
      user.id,
      { currentPassword: "correct1horse", newPassword: "brandnew1" },
      META,
    );
    expect(result).toEqual({ ok: true });

    const updated = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.mustResetPassword).toBe(false);

    // All sessions are revoked, so the old token must no longer resolve.
    if (first.ok) expect(await resolveSession(first.token)).toBeNull();

    expect((await login({ identifier: "staff@example.com", password: "brandnew1" }, META)).ok).toBe(
      true,
    );
  });

  it("refuses when the current password is wrong", async () => {
    const user = await makeStaff();
    const result = await changePassword(
      user.id,
      { currentPassword: "notit1234", newPassword: "brandnew1" },
      META,
    );
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("audits the change", async () => {
    const user = await makeStaff();
    await changePassword(
      user.id,
      { currentPassword: "correct1horse", newPassword: "brandnew1" },
      META,
    );
    const actions = (await testPrisma.auditLog.findMany()).map((a) => a.action);
    expect(actions).toContain("password_changed");
  });
});
