import type { ZodError } from "zod";

/**
 * The value every Server Action returns and every form reads via useActionState.
 *
 * `ok: null` is the idle state. useActionState needs an initial value, and
 * without an explicit idle variant the first render would show a spurious
 * success or error banner.
 */
export type ActionState =
  | { ok: true; message: string }
  | { ok: false; message?: string; fieldErrors: Record<string, string> }
  | { ok: null };

export const IDLE_STATE: ActionState = { ok: null };

export function actionOk(message: string): ActionState {
  return { ok: true, message };
}

export function actionFailed(message: string): ActionState {
  return { ok: false, message, fieldErrors: {} };
}

/**
 * Flattens a ZodError into one message per field, so each renders next to the
 * input that caused it (spec §6.2 — inline validation, not a submit-only wall of
 * text). A nested path becomes dot-joined, e.g. "monday.open".
 */
export function toFieldErrors(error: ZodError, message?: string): ActionState {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    // First error per field wins; showing three at once on one input is noise.
    if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
  }

  return { ok: false, message, fieldErrors };
}
