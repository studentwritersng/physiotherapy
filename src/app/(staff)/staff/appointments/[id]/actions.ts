"use server";

import { revalidatePath } from "next/cache";
import { requireRole, getCurrentUser } from "@/server/auth/rbac";
import { transitionStatus, InvalidTransitionError } from "@/server/services/appointment-status";
import {
  cancelAppointment,
  rescheduleAppointment,
  SlotTakenError,
  CutoffError,
} from "@/server/services/booking";
import { lagosWallToUtc } from "@/lib/slots";
import { cancelSchema, rescheduleSchema, statusSchema } from "@/lib/zod/booking";
import { actionFailed, actionOk, toFieldErrors, type ActionState } from "@/server/action-state";

function pathFor(id: string): string {
  return `/staff/appointments/${id}`;
}

export async function changeStatus(formData: FormData): Promise<void> {
  const user = await requireRole("admin", "therapist", "receptionist");

  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  try {
    await transitionStatus(parsed.data.id, parsed.data.to, user.id);
  } catch (error) {
    // Illegal edges are unclickable in the UI, so reaching here means a forged
    // request or a race (someone else moved it first). Either way: no crash,
    // just re-render. The error is deliberately not surfaced — there is no
    // form to attach it to.
    if (!(error instanceof InvalidTransitionError)) throw error;
  }
  revalidatePath(pathFor(parsed.data.id));
}

export async function saveReschedule(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("admin", "receptionist");

  const parsed = rescheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  const actor = await getCurrentUser();
  if (!actor) return actionFailed("Signed out — log in again and retry.");

  try {
    await rescheduleAppointment(
      parsed.data.id,
      lagosWallToUtc(parsed.data.dateKey, parsed.data.startTime),
      actor.id,
    );
  } catch (error) {
    if (error instanceof SlotTakenError) {
      return actionFailed("That slot was just taken. Pick another time.");
    }
    if (error instanceof CutoffError) {
      return actionFailed(
        `Too close to reschedule — only ${error.hoursLeft.toFixed(1)} hours left, and the cutoff is in force.`,
      );
    }
    return actionFailed("Could not move the appointment. Try again.");
  }

  revalidatePath(pathFor(parsed.data.id));
  return actionOk("Appointment moved");
}

export async function saveCancel(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("admin", "receptionist", "therapist");

  const parsed = cancelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  const actor = await getCurrentUser();
  if (!actor) return actionFailed("Signed out — log in again and retry.");

  try {
    await cancelAppointment(parsed.data.id, parsed.data.reason, actor.id);
  } catch (error) {
    if (error instanceof CutoffError) {
      return actionFailed(
        `Too close to cancel — only ${error.hoursLeft.toFixed(1)} hours left, and the cutoff is in force.`,
      );
    }
    if (error instanceof InvalidTransitionError) {
      return actionFailed("That appointment can no longer be cancelled from its current state.");
    }
    return actionFailed("Could not cancel. Try again.");
  }

  revalidatePath(pathFor(parsed.data.id));
  return actionOk("Appointment cancelled");
}
