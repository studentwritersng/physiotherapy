import "server-only";
import { cookies } from "next/headers";
import type { UserRole } from "@/generated/prisma/client";
import { resolveSession, type SessionUser } from "@/server/auth/session";
import { env } from "@/lib/env";

export class UnauthenticatedError extends Error {
  readonly status = 401;
  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "You do not have access to this resource") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * The only path to an authenticated user. Because every guard funnels through
 * here, a route handler that forgets to authorize has no user object to leak
 * data with, so the failure mode is a 401 rather than a bypass (spec §5.3).
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return resolveSession(jar.get(env.SESSION_COOKIE_NAME)?.value);
}

/** Throws rather than returning null, so an unchecked call still fails closed. */
export async function requireSession(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireSession();
  if (!roles.includes(user.role)) throw new ForbiddenError();
  return user;
}
