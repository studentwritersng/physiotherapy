"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/rbac";
import { createService, setServiceActive, updateService } from "@/server/services/service-catalog";
import { serviceSchema } from "@/lib/zod/clinic";
import { actionFailed, actionOk, toFieldErrors, type ActionState } from "@/server/action-state";

const SERVICES_PATH = "/staff/settings/services";

export async function addService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("admin");

  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  try {
    await createService(parsed.data);
  } catch {
    return actionFailed("Could not save the service. Try again.");
  }

  revalidatePath(SERVICES_PATH);
  // The public catalog pages are prerendered, so a mutation must revalidate
  // them too — otherwise an admin edit never appears publicly without a
  // rebuild (PRD-02 FR3: edits propagate with no deploy).
  revalidatePath("/services");
  revalidatePath("/");
  return actionOk(`${parsed.data.name} added`);
}

export async function editService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  if (id.length === 0) return actionFailed("Missing service id");

  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  try {
    await updateService(id, parsed.data);
  } catch {
    return actionFailed("Could not save the service. Try again.");
  }

  revalidatePath(SERVICES_PATH);
  // Same public-catalog staleness as addService: keep the prerendered pages fresh.
  revalidatePath("/services");
  revalidatePath("/");
  return actionOk(`${parsed.data.name} updated`);
}

/**
 * One-click, nothing to validate, so it returns void and posts from a plain
 * form. revalidatePath re-renders the list.
 */
export async function toggleServiceActive(formData: FormData): Promise<void> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const nextActive = formData.get("nextActive") === "true";
  if (id.length === 0) return;

  await setServiceActive(id, nextActive);
  revalidatePath(SERVICES_PATH);
  // Deactivation must hide the service publicly without a rebuild either.
  revalidatePath("/services");
  revalidatePath("/");
}