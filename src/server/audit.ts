import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

/**
 * The closed set of auditable actions (spec §5.5). PRD-12 §3 requires role
 * changes, data exports and account lifecycle events; PRD-01 FR6 adds logins
 * and password resets.
 */
export type AuditAction =
  | "login_success"
  | "login_failure"
  | "logout"
  | "password_changed"
  | "password_reset_by_admin"
  | "role_changed"
  | "account_created"
  | "account_deactivated"
  // Reserved for later sub-projects; same call site.
  | "data_exported"
  | "patient_anonymised";

export type AuditInput = {
  userId?: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
};

/** Keys stripped from metadata so a caller cannot accidentally persist a secret. */
const REDACTED_KEYS = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "token",
  "tokenhash",
  "token_hash",
  "code",
  "secret",
]);

/**
 * Callers pass `Record<string, unknown>`, which TypeScript cannot prove is
 * JSON-serialisable, so the scrubbed object is asserted into Prisma's JSON input
 * type. The values are serialised by the driver; a non-JSON value would fail at
 * runtime, which is the caller's contract to keep.
 */
function scrub(metadata: Record<string, unknown>): Prisma.InputJsonValue {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!REDACTED_KEYS.has(key.toLowerCase())) out[key] = value;
  }
  return out as Prisma.InputJsonValue;
}

/**
 * Writes one audit row. Failures are swallowed deliberately: an audit write must
 * never turn a successful action into an error for the user. There is no audit
 * UI in v1 (PRD-12 §6) — this table is read directly when needed.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        ipAddress: input.ipAddress ?? null,
        metadata: input.metadata ? scrub(input.metadata) : undefined,
      },
    });
  } catch (error) {
    console.error("[audit] failed to write entry", {
      action: input.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
