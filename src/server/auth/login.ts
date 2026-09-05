import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, revokeAllSessions, type SessionUser } from "@/server/auth/session";
import { checkRateLimit, clearAttempts, recordFailedAttempt } from "@/server/auth/rate-limit";
import { audit } from "@/server/audit";
import type { ChangePasswordInput, PatientRegisterInput } from "@/lib/zod/auth";

export type RequestMeta = { ipAddress?: string | null; userAgent?: string | null };

export type LoginOutcome =
  | { ok: true; token: string; user: SessionUser }
  | { ok: false; reason: "invalid_credentials" }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number }
  | { ok: false; reason: "account_inactive" };

export type RegisterOutcome =
  | { ok: true; token: string; user: SessionUser }
  | { ok: false; reason: "phone_taken" };

export type ChangePasswordOutcome = { ok: true } | { ok: false; reason: "invalid_credentials" };

/** Accepts 0803…, 234803… and +234803…, always stores E.164. */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+234")) return digits;
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function toSessionUser(u: {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  role: SessionUser["role"];
  mustResetPassword: boolean;
}): SessionUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    mustResetPassword: u.mustResetPassword,
  };
}

/**
 * Staff log in with email or phone; patients with phone. One function handles
 * both, because the only difference is which column matches.
 *
 * An unknown identifier and a wrong password both return `invalid_credentials`
 * so the response cannot be used to enumerate accounts.
 */
export async function login(
  input: { identifier: string; password: string },
  meta: RequestMeta = {},
): Promise<LoginOutcome> {
  const identifier = input.identifier.trim();

  const limit = await checkRateLimit(identifier);
  if (!limit.allowed) {
    await audit({
      userId: null,
      action: "login_failure",
      ipAddress: meta.ipAddress,
      metadata: { identifier, reason: "rate_limited" },
    });
    return { ok: false, reason: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds };
  }

  const asEmail = identifier.toLowerCase();
  const asPhone = normalisePhone(identifier);

  const user = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [{ email: asEmail }, { phone: asPhone }],
    },
  });

  if (!user) {
    await recordFailedAttempt(identifier, meta.ipAddress);
    await audit({
      userId: null,
      action: "login_failure",
      ipAddress: meta.ipAddress,
      metadata: { identifier, reason: "unknown_identifier" },
    });
    return { ok: false, reason: "invalid_credentials" };
  }

  if (!(await verifyPassword(user.passwordHash, input.password))) {
    await recordFailedAttempt(identifier, meta.ipAddress);
    await audit({
      userId: user.id,
      action: "login_failure",
      entityType: "user",
      entityId: user.id,
      ipAddress: meta.ipAddress,
      metadata: { identifier, reason: "bad_password" },
    });
    return { ok: false, reason: "invalid_credentials" };
  }

  // Checked after the password so a deactivated account cannot be probed.
  if (user.status !== "active") {
    await audit({
      userId: user.id,
      action: "login_failure",
      entityType: "user",
      entityId: user.id,
      ipAddress: meta.ipAddress,
      metadata: { identifier, reason: "inactive" },
    });
    return { ok: false, reason: "account_inactive" };
  }

  await clearAttempts(identifier);

  const token = await createSession(user.id, meta);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({
    userId: user.id,
    action: "login_success",
    entityType: "user",
    entityId: user.id,
    ipAddress: meta.ipAddress,
  });

  return { ok: true, token, user: toSessionUser(user) };
}

/**
 * Generates the next TP-00001-style code (PRD-06's searchable "patient ID").
 * Runs inside the caller's transaction so two concurrent registrations cannot
 * collide on the same code.
 */
async function nextPatientCode(tx: Prisma.TransactionClient): Promise<string> {
  const count = await tx.patient.count();
  return `TP-${String(count + 1).padStart(5, "0")}`;
}

export async function registerPatient(
  input: PatientRegisterInput,
  meta: RequestMeta = {},
): Promise<RegisterOutcome> {
  const phone = normalisePhone(input.phone);
  const email = input.email && input.email.length > 0 ? input.email.trim().toLowerCase() : null;

  const existingUser = await prisma.user.findFirst({ where: { phone, deletedAt: null } });
  if (existingUser) return { ok: false, reason: "phone_taken" };

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { name: input.fullName.trim(), email, phone, passwordHash, role: "patient" },
    });

    // Sub-project 5 (spec §6): a matching walk-in lead is NOT auto-linked.
    // Staff approve the link explicitly via approvePortalLink.
    await tx.patient.create({
      data: {
        patientCode: await nextPatientCode(tx),
        userId: created.id,
        fullName: input.fullName.trim(),
        phone,
        email,
        status: "registered",
      },
    });

    return created;
  });

  const token = await createSession(user.id, meta);
  await audit({
    userId: user.id,
    action: "account_created",
    entityType: "user",
    entityId: user.id,
    ipAddress: meta.ipAddress,
    metadata: { role: "patient", self_registered: true },
  });

  return { ok: true, token, user: toSessionUser(user) };
}

/**
 * Revokes every session on success, including the caller's. A password change is
 * the one moment where forcing a fresh login everywhere is the correct
 * behaviour, and it is what makes a compromised session recoverable.
 */
export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  meta: RequestMeta = {},
): Promise<ChangePasswordOutcome> {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) return { ok: false, reason: "invalid_credentials" };

  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    return { ok: false, reason: "invalid_credentials" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.newPassword), mustResetPassword: false },
  });
  await revokeAllSessions(user.id);
  await audit({
    userId: user.id,
    action: "password_changed",
    entityType: "user",
    entityId: user.id,
    ipAddress: meta.ipAddress,
  });

  return { ok: true };
}
