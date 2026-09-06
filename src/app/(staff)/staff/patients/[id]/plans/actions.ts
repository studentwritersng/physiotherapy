"use server";

import { revalidatePath } from "next/cache";
import { ForbiddenError, requireRole } from "@/server/auth/rbac";
import { exerciseSchema, planSchema, planUpdateSchema } from "@/lib/zod/clinical";
import {
  addExercise,
  createTreatmentPlan,
  updateExercise,
  updateTreatmentPlan,
} from "@/server/services/clinical";
import { actionFailed, actionOk, toFieldErrors, type ActionState } from "@/server/action-state";

function recordPath(patientId: string): string {
  return `/staff/patients/${patientId}`;
}

function revalidateRecordAndPortal(patientId: string): void {
  revalidatePath(recordPath(patientId));
  revalidatePath("/portal");
}

/**
 * Creates a treatment plan under #plans. The plan joins the patient's open
 * episode automatically, or stands outside episodes when there is none.
 */
export async function savePlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin", "therapist");

  const raw = Object.fromEntries(formData);
  const patientId = typeof raw.patientId === "string" ? raw.patientId : "";

  try {
    const parsed = planSchema.safeParse(raw);
    if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

    await createTreatmentPlan(actor, patientId, parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return actionFailed("You do not have access to this patient.");
    }
    return actionFailed("Could not save the plan. Try again.");
  }

  revalidateRecordAndPortal(patientId);
  return actionOk("Treatment plan saved");
}

/**
 * Status buttons under each plan (active / on_hold / completed). A status
 * change is a plain update — no per-exercise done flag exists.
 */
export async function setPlanStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin", "therapist");

  const planId = String(formData.get("planId") ?? "");
  const patientId = String(formData.get("patientId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!planId || !patientId) return actionFailed("Missing plan. Reload and try again.");

  try {
    const parsed = planUpdateSchema.safeParse({ status });
    if (!parsed.success) return actionFailed("Unknown status. Reload and try again.");

    await updateTreatmentPlan(actor, planId, parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return actionFailed("You do not have access to this patient.");
    }
    if (error instanceof Error && /not found/i.test(error.message)) {
      return actionFailed("That plan no longer exists. Reload and try again.");
    }
    return actionFailed("Could not update the plan. Try again.");
  }

  revalidateRecordAndPortal(patientId);
  return actionOk("Plan status updated");
}

/**
 * Per-plan portal visibility toggle. Exposure still needs the clinic master
 * switch — flipping this alone never leaks when the master is off.
 */
export async function setPlanVisibility(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("admin", "therapist");

  const planId = String(formData.get("planId") ?? "");
  const patientId = String(formData.get("patientId") ?? "");
  const patientVisible = String(formData.get("patientVisible") ?? "");
  if (!planId || !patientId) return actionFailed("Missing plan. Reload and try again.");

  try {
    await updateTreatmentPlan(actor, planId, {
      patientVisible: patientVisible === "true",
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return actionFailed("You do not have access to this patient.");
    }
    if (error instanceof Error && /not found/i.test(error.message)) {
      return actionFailed("That plan no longer exists. Reload and try again.");
    }
    return actionFailed("Could not update visibility. Try again.");
  }

  revalidateRecordAndPortal(patientId);
  return actionOk(patientVisible === "true" ? "Plan shared with patient" : "Plan hidden from patient");
}

/**
 * Inline exercise row creator. sortOrder arrives from the form as the current
 * row count, so new rows append at the end unless the therapist edits it.
 */
export async function saveExercise(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin", "therapist");

  const raw = Object.fromEntries(formData);
  const planId = typeof raw.planId === "string" ? raw.planId : "";
  const patientId = typeof raw.patientId === "string" ? raw.patientId : "";
  if (!planId || !patientId) return actionFailed("Missing plan. Reload and try again.");

  try {
    const parsed = exerciseSchema.safeParse(raw);
    if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

    await addExercise(actor, planId, parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return actionFailed("You do not have access to this patient.");
    }
    if (error instanceof Error && /not found/i.test(error.message)) {
      return actionFailed("That plan no longer exists. Reload and try again.");
    }
    return actionFailed("Could not add the exercise. Try again.");
  }

  revalidateRecordAndPortal(patientId);
  return actionOk("Exercise added");
}

/** Per-exercise portal visibility toggle (the plan gate applies first). */
export async function setExerciseVisibility(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("admin", "therapist");

  const exerciseId = String(formData.get("exerciseId") ?? "");
  const patientId = String(formData.get("patientId") ?? "");
  const patientVisible = String(formData.get("patientVisible") ?? "");
  if (!exerciseId || !patientId) return actionFailed("Missing exercise. Reload and try again.");

  try {
    await updateExercise(actor, exerciseId, {
      patientVisible: patientVisible === "true",
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return actionFailed("You do not have access to this patient.");
    }
    if (error instanceof Error && /not found/i.test(error.message)) {
      return actionFailed("That exercise no longer exists. Reload and try again.");
    }
    return actionFailed("Could not update visibility. Try again.");
  }

  revalidateRecordAndPortal(patientId);
  return actionOk(
    patientVisible === "true" ? "Exercise shared with patient" : "Exercise hidden from patient",
  );
}
