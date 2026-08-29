import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { env } from "@/lib/env";
import {
  SESSION_SLIDE_AFTER_SECONDS,
  SESSION_TOKEN_BYTES,
  SESSION_TTL_SECONDS,
} from "@/lib/constants";

export type SessionUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  role: UserRole;
  mustResetPassword: boolean;
};

/** SHA-256 of the raw token. Only this is persisted (spec §5.2). */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function sessionCookieOptions() {
  return {
    name: env.SESSION_COOKIE_NAME,
    httpOnly: true as const,
    sameSite: "lax" as const,
    // Localhost is served over plain HTTP, so Secure would drop the cookie.
    secure: env.NODE_ENV === "production",
    path: "/" as const,
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function createSession(
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<string> {
  const raw = randomBytes(SESSION_TOKEN_BYTES).toString("hex");
  await prisma.session.create({
    data: {
      tokenHash: hashToken(raw),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });
  return raw;
}

/**
 * Validates the token, applies sliding expiry, and returns the user.
 *
 * Returns null when the token is absent, unknown, expired, or belongs to a
 * soft-deleted or deactivated user. Expired rows are deleted on read so the
 * table self-cleans without a scheduled job (spec §5.2).
 */
export async function resolveSession(rawToken: string | undefined): Promise<SessionUser | null> {
  if (!rawToken) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });
  if (!session) return null;

  const now = Date.now();

  if (session.expiresAt.getTime() <= now) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  if (session.user.deletedAt !== null || session.user.status !== "active") {
    return null;
  }

  // Only write when the session has been idle past the threshold, so a busy
  // session does not cause a database write on every request.
  if (now - session.lastUsedAt.getTime() > SESSION_SLIDE_AFTER_SECONDS * 1000) {
    await prisma.session.update({
      where: { id: session.id },
      data: {
        lastUsedAt: new Date(now),
        expiresAt: new Date(now + SESSION_TTL_SECONDS * 1000),
      },
    });
  }

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    phone: session.user.phone,
    role: session.user.role,
    mustResetPassword: session.user.mustResetPassword,
  };
}

export async function revokeSession(rawToken: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
}

/** Logout-everywhere, and the hook admin-forced logout will use. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
