"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/rbac";
import { getClinicSettings, updateClinicSettings } from "@/server/services/clinic-settings";
import {
  createTestimonial,
  deleteTestimonial,
  setTestimonialPublished,
} from "@/server/services/testimonial";
import { testimonialSchema } from "@/lib/zod/clinic";
import { actionFailed, actionOk, toFieldErrors, type ActionState } from "@/server/action-state";

const CONTENT_PATH = "/staff/settings/content";

export async function saveAbout(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("admin");

  const raw = String(formData.get("aboutContent") ?? "").trim();

  try {
    // aboutContent is one field on the settings singleton, so read the current
    // row and write it back with only that value changed. Sending a partial
    // object would blank the other columns.
    const current = await getClinicSettings();
    await updateClinicSettings({
      clinicName: current.clinicName,
      tagline: current.tagline,
      logoUrl: current.logoUrl,
      aboutContent: raw.length === 0 ? null : raw,
      contactPhone: current.contactPhone,
      contactWhatsapp: current.contactWhatsapp,
      contactEmail: current.contactEmail,
      address: current.address,
      bookingLeadTimeHours: current.bookingLeadTimeHours,
      rescheduleCutoffHours: current.rescheduleCutoffHours,
      cancellationCutoffHours: current.cancellationCutoffHours,
    });
  } catch {
    return actionFailed("Could not save. Try again.");
  }

  revalidatePath(CONTENT_PATH);
  return actionOk("About content saved");
}

export async function addTestimonial(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("admin");

  const parsed = testimonialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  try {
    await createTestimonial(parsed.data);
  } catch {
    return actionFailed("Could not save the testimonial. Try again.");
  }

  revalidatePath(CONTENT_PATH);
  return actionOk("Testimonial added");
}

export async function toggleTestimonialPublished(formData: FormData): Promise<void> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const nextPublished = formData.get("nextPublished") === "true";
  if (id.length === 0) return;

  await setTestimonialPublished(id, nextPublished);
  revalidatePath(CONTENT_PATH);
}

export async function removeTestimonial(formData: FormData): Promise<void> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  if (id.length === 0) return;

  await deleteTestimonial(id);
  revalidatePath(CONTENT_PATH);
}