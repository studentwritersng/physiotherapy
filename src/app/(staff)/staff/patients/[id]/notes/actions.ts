"use server";

import { revalidatePath } from "next/cache";
import { ForbiddenError, requireRole } from "@/server/auth/rbac";
import { noteSchema } from "@/lib/zod/clinical";
import { submitSessionNote } from "@/server/services/clinical";
import { actionFailed, actionOk, toFieldErrors, type ActionState } from "@/server/action-state";

function recordPath(patientId: string): string {
  return `/staff/patients/${patientId}`;
}

/**
 * Saves the session note for one appointment under #notes. The appointment
 * picker posts appointmentId; the six SOAP fields validate through
 * noteSchema. Authorship is enforced in the service: only the appointed
 * therapist writes, so an admin (or another therapist) submitting here gets
 * a friendly refusal, not a silent write.
 */
export async function saveSessionNote(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("admin", "therapist");

  const raw = Object.fromEntries(formData);
  const patientId = typeof raw.patientId === "string" ? raw.patientId : "";
  const appointmentId = typeof raw.appointmentId === "string" ? raw.appointmentId : "";
  if (!appointmentId) return actionFailed("Choose an appointment for this note.");

  try {
    const parsed = noteSchema.safeParse(raw);
    if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

    await submitSessionNote(actor, appointmentId, parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return actionFailed("You do not have access to this patient.");
    }
    if (error instanceof Error && /appointed therapist/.test(error.message)) {
      return actionFailed("Only the appointed therapist writes session notes.");
    }
    if (error instanceof Error && /Appointment not found/.test(error.message)) {
      return actionFailed("That appointment no longer exists. Reload and try again.");
    }
    return actionFailed("Could not save the note. Try again.");
  }

  revalidatePath(recordPath(patientId));
  return actionOk("Session note saved");
}
