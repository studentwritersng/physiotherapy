/**
 * Every value here is a decision recorded in the design spec (§3.11), not a magic number.
 * Values the clinic may change at runtime live in clinic_settings instead.
 */

/** WAT, UTC+1, no DST. Every "today" and date-range calculation derives from this (spec §3.8). */
export const TIMEZONE = "Africa/Lagos";

/** OWASP argon2id baseline. */
export const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN_LENGTH = 8;

/** 7 days. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Slide expiry only after 24h of use, to avoid a write on every request (spec §5.2). */
export const SESSION_SLIDE_AFTER_SECONDS = 24 * 60 * 60;
export const SESSION_TOKEN_BYTES = 32;

export const RATE_LIMIT_MAX_ATTEMPTS = 5;
export const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Booking defaults, consumed by sub-project 3. Seeded into clinic_settings. */
export const DEFAULT_SERVICE_DURATION_MINUTES = 45;
export const RESCHEDULE_CUTOFF_HOURS = 2;
export const CANCELLATION_CUTOFF_HOURS = 2;
export const REMINDER_LEAD_HOURS = [24, 2] as const;

export const CURRENCY = "NGN";
