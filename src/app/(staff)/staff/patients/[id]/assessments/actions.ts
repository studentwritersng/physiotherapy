"use server";

import { revalidatePath } from "next/cache";
import { ForbiddenError, requireRole } from "@/server/auth/rbac";
import { assessmentSchema } from "@/lib/zod/clinical";
import { dischargeEpisode, startEpisode, submitAssessment } from "@/server/services/clinical";
import { actionFailed, actionOk, toFieldErrors, type ActionState } from "@/server/action-state";

function recordPath(patientId: string): string {
  return `/staff/patients/${patientId}`;
}

/**
 * Saves the assessment under #assessments. The episode picker posts
 * episodeId "" (automatic: join the open episode or auto-create), an explicit
 * open-episode id, or "new" (startEpisode with newEpisodeReason first).
 */
export async function saveAssessment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("admin", "therapist");

  const raw = Object.fromEntries(formData);
  const patientId = typeof raw.patientId === "string" ? raw.patientId : "";
  const choice = typeof raw.episodeId === "string" ? raw.episodeId : "";

  try {
    let episodeId: string | undefined;
    if (choice === "new") {
      const reason = typeof raw.newEpisodeReason === "string" ? raw.newEpisodeReason.trim() : "";
      if (!reason) return actionFailed("Give the new episode a reason.");
      episodeId = (await startEpisode(actor, patientId, reason)).id;
    } else if (choice !== "") {
      episodeId = choice;
    }

    const parsed = assessmentSchema.safeParse({ ...raw, episodeId });
    if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

    await submitAssessment(actor, patientId, parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return actionFailed("You do not have access to this patient.");
    }
    if (error instanceof Error && /discharged or missing/.test(error.message)) {
      return actionFailed("That episode was discharged — start a new one.");
    }
    if (error instanceof Error && /reason is required/i.test(error.message)) {
      return actionFailed("Give the new episode a reason.");
    }
    return actionFailed("Could not save the assessment. Try again.");
  }

  revalidatePath(recordPath(patientId));
  return actionOk("Assessment saved");
}

export async function dischargeOpenEpisode(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("admin", "therapist");

  const episodeId = String(formData.get("episodeId") ?? "");
  const patientId = String(formData.get("patientId") ?? "");
  if (!episodeId || !patientId) return actionFailed("Missing episode. Reload and try again.");

  try {
    await dischargeEpisode(actor, episodeId);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return actionFailed("You do not have access to this patient.");
    }
    return actionFailed("Could not discharge the episode. Try again.");
  }

  revalidatePath(recordPath(patientId));
  return actionOk("Episode discharged");
}
