import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ARGON2_OPTIONS } from "@/lib/constants";

/**
 * Playwright drives the app against the development database, and several
 * journeys mutate it: a forced first login rewrites the password hash and clears
 * mustResetPassword, and registration inserts a user and a patient.
 *
 * Left alone that makes the suite single-use — the `mobile` project would replay
 * the same specs against state the `chromium` project already changed, and every
 * re-run would need `npm run db:reset` first. So each test arms the precondition
 * it needs here rather than inheriting it from the seed or from a test that
 * happened to run earlier.
 *
 * `next start` loads .env itself; this process does not, hence dotenv above.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** 0803… → +234803…, matching normalisePhone in src/server/auth/login.ts. */
export function toE164(localPhone: string): string {
  return `+234${localPhone.slice(1)}`;
}

/**
 * Sets a staff account's password and mustResetPassword flag, so a journey that
 * needs the forced-change screen and one that needs to walk straight into the
 * dashboard can both start from a known state.
 */
export async function armStaffAccount(
  email: string,
  password: string,
  mustResetPassword: boolean,
): Promise<void> {
  await prisma.user.update({
    where: { email },
    data: { passwordHash: await hash(password, ARGON2_OPTIONS), mustResetPassword },
  });
  await clearLoginThrottle(email);
}

/** A patient is never forced to reset, so only the password is restored. */
export async function armPatientAccount(localPhone: string, password: string): Promise<void> {
  await prisma.user.update({
    where: { phone: toE164(localPhone) },
    data: { passwordHash: await hash(password, ARGON2_OPTIONS), mustResetPassword: false },
  });
  await clearLoginThrottle(localPhone);
}

/**
 * The rate limiter counts failed attempts per identifier over a 15-minute
 * window, so without this the deliberate wrong-password test would accumulate
 * across projects and runs until a later genuine login was throttled.
 */
export async function clearLoginThrottle(identifier: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { identifier: identifier.toLowerCase() } });
}

/** Removes an account created by the registration journey, and its patient row. */
export async function deletePatientAccount(localPhone: string): Promise<void> {
  const phone = toE164(localPhone);
  // patients.user_id is ON DELETE SET NULL, so the patient row would otherwise
  // survive and be claimed as a walk-in lead by the next registration.
  await prisma.patient.deleteMany({ where: { phone } });
  await prisma.user.deleteMany({ where: { phone } });
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
