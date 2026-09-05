"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/rbac";
import { requireLinkedPatientId } from "@/server/services/portal";
import { submitIntake } from "@/server/services/intake";
import { intakeSchema } from "@/lib/zod/intake";
import {
  actionFailed,
  actionOk,
  toFieldErrors,
  type ActionState,
} from "@/server/action-state";

export async function portalSubmitIntake(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void prev;
  const user = await requireRole("patient");
  const patientId = await requireLinkedPatientId(user.id);
  if (!patientId) return actionFailed("Your account is not linked yet.");

  // Field-level errors for the form; submitIntake parses again as the
  // enforcement boundary (an unchecked checkbox is absent from FormData and
  // must fail here, server-side, not just via HTML `required`).
  const parsed = intakeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  try {
    await submitIntake(patientId, parsed.data);
  } catch {
    return actionFailed("Could not save the intake form. Try again or contact the clinic.");
  }

  // Revalidating /portal flips hasSubmittedIntake, so the dashboard banner
  // disappears on the next visit.
  revalidatePath("/portal");
  revalidatePath("/portal/intake");
  return actionOk("Intake form saved — your therapist will review it before your visit.");
}
