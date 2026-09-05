"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/rbac";
import { requireLinkedPatientId } from "@/server/services/portal";
import { updateProfile } from "@/server/services/profile";
import { profileSchema } from "@/lib/zod/profile";
import {
  actionFailed,
  actionOk,
  toFieldErrors,
  type ActionState,
} from "@/server/action-state";

export async function portalUpdateProfile(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void prev;
  const user = await requireRole("patient");
  const patientId = await requireLinkedPatientId(user.id);
  if (!patientId) return actionFailed("Your account is not linked yet.");

  // Field-level errors for the form; updateProfile parses again as the
  // enforcement boundary (a blank email must fail here, server-side, not
  // just via HTML `required`).
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  try {
    await updateProfile(patientId, parsed.data);
  } catch {
    return actionFailed("Could not save your profile. Try again or contact the clinic.");
  }

  revalidatePath("/portal/profile");
  return actionOk("Profile saved.");
}
