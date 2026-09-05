"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/rbac";
import { approvePortalLink } from "@/server/services/portal-links";
import type { ActionState } from "@/server/action-state";
import { actionOk, actionFailed } from "@/server/action-state";

export async function linkPortalAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("admin", "therapist", "receptionist");
  const userId = String(formData.get("userId") ?? "");
  const patientId = String(formData.get("patientId") ?? "");
  if (!userId || !patientId) return actionFailed("Choose a record to link.");
  try {
    await approvePortalLink(userId, patientId);
  } catch {
    return actionFailed("That record was already linked. Refresh and try again.");
  }
  revalidatePath("/staff/portal-links");
  return actionOk("Account linked.");
}
