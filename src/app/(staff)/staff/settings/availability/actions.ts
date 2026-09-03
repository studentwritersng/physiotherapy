"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/rbac";
import { createAvailability, deleteAvailability } from "@/server/services/availability";
import { availabilitySchema } from "@/lib/zod/clinic";
import { actionFailed, actionOk, toFieldErrors, type ActionState } from "@/server/action-state";

const AVAILABILITY_PATH = "/staff/settings/availability";

export async function addAvailability(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("admin");

  const parsed = availabilitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  try {
    await createAvailability(parsed.data);
  } catch {
    return actionFailed("Could not save. Try again.");
  }

  revalidatePath(AVAILABILITY_PATH);
  return actionOk(parsed.data.isBlocked ? "Block added" : "Availability added");
}

export async function removeAvailability(formData: FormData): Promise<void> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  if (id.length === 0) return;

  await deleteAvailability(id);
  revalidatePath(AVAILABILITY_PATH);
}