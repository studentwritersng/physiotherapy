import "server-only";
import { prisma } from "@/server/db";
import { RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_SECONDS } from "@/lib/constants";

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Case-insensitive so an email in different casing cannot open a fresh bucket. */
function normalise(identifier: string): string {
  return identifier.trim().toLowerCase();
}

function windowStart(): Date {
  return new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000);
}

/**
 * Sliding-window throttle, not a lockout (PRD-01 FR5). Locking an account keyed
 * on a phone number would be a trivial denial-of-service against a real patient,
 * so the caller returns 429 with Retry-After and the account stays usable.
 */
export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  const since = windowStart();
  const attempts = await prisma.loginAttempt.findMany({
    where: { identifier: normalise(identifier), successful: false, attemptedAt: { gte: since } },
    orderBy: { attemptedAt: "asc" },
    select: { attemptedAt: true },
  });

  if (attempts.length < RATE_LIMIT_MAX_ATTEMPTS) return { allowed: true };

  // The bucket frees up when the oldest attempt in the window ages out.
  const oldest = attempts[0]!.attemptedAt.getTime();
  const freeAt = oldest + RATE_LIMIT_WINDOW_SECONDS * 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil((freeAt - Date.now()) / 1000));

  return { allowed: false, retryAfterSeconds };
}

export async function recordFailedAttempt(
  identifier: string,
  ipAddress?: string | null,
): Promise<void> {
  await prisma.loginAttempt.create({
    data: { identifier: normalise(identifier), ipAddress: ipAddress ?? null, successful: false },
  });
}

export async function clearAttempts(identifier: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { identifier: normalise(identifier) } });
}
