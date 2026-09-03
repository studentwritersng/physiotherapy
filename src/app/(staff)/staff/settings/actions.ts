"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/rbac";
import {
  updateClinicSettings,
  updateOpeningHours,
} from "@/server/services/clinic-settings";
import { clinicSettingsSchema, DAY_KEYS, openingHoursSchema } from "@/lib/zod/clinic";
import {
  actionFailed,
  actionOk,
  toFieldErrors,
  type ActionState,
} from "@/server/action-state";

export async function saveSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // Authorize BEFORE parsing. A "use server" export is a public endpoint whether
  // or not a form points at it; requireRole throws, so this fails closed.
  await requireRole("admin");

  const parsed = clinicSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  try {
    await updateClinicSettings(parsed.data);
  } catch {
    return actionFailed("Could not save. Check your connection and try again.");
  }

  revalidatePath("/staff/settings");
  return actionOk("Clinic details saved");
}

export async function saveOpeningHours(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("admin");

  // Seven checkboxes plus fourteen time inputs collapse into the nested shape
  // openingHoursSchema expects. An unchecked "open" box means closed that day.
  const shape = Object.fromEntries(
    DAY_KEYS.map((day) => {
      const isOpen = formData.get(`${day}-enabled`) !== null;
      if (!isOpen) return [day, null];
      return [
        day,
        {
          open: String(formData.get(`${day}-open`) ?? ""),
          close: String(formData.get(`${day}-close`) ?? ""),
        },
      ];
    }),
  );

  const parsed = openingHoursSchema.safeParse(shape);
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted times");

  try {
    await updateOpeningHours(parsed.data);
  } catch {
    return actionFailed("Could not save. Check your connection and try again.");
  }

  revalidatePath("/staff/settings");
  return actionOk("Opening hours saved");
}