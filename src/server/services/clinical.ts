import "server-only";
import { prisma } from "@/server/db";
import { ForbiddenError } from "@/server/auth/rbac";
import type { SessionUser } from "@/server/auth/session";
import { assessmentSchema, type AssessmentInput } from "@/lib/zod/clinical";
import { assertCanReadClinical, canViewPatient } from "@/server/services/patient";

/**
 * Full clinical record for the patient shell at /staff/patients/[id].
 *
 * No authorization here by design: every caller gates first with
 * getPatientForActor(actor, id) (null → notFound, so a forged id never leaks
 * another patient's rows) and wraps the clinical sections in
 * assertCanReadClinical(actor). Receptionists receive the profile + intake
 * only — callers filter these arrays to empty for them rather than hiding
 * the page.
 */
export async function getRecordTimeline(patientId: string) {
  const [assessments, notes, plans, documents, episodes] = await Promise.all([
    prisma.assessment.findMany({ where: { patientId }, orderBy: { createdAt: "desc" } }),
    prisma.sessionNote.findMany({ where: { patientId }, orderBy: { createdAt: "desc" } }),
    prisma.treatmentPlan.findMany({ where: { patientId }, orderBy: { createdAt: "desc" } }),
    prisma.patientDocument.findMany({ where: { patientId }, orderBy: { uploadedAt: "desc" } }),
    prisma.episodeOfCare.findMany({ where: { patientId }, orderBy: { startedAt: "desc" } }),
  ]);
  return { assessments, notes, plans, documents, episodes };
}

/**
 * Newest active episode for the patient, or null. Unauthenticated by design:
 * callers gate with getPatientForActor first (null → notFound), like the
 * record shell does.
 */
export async function getOpenEpisode(patientId: string) {
  return prisma.episodeOfCare.findFirst({
    where: { patientId, status: "active" },
    orderBy: { startedAt: "desc" },
  });
}

async function assertCanWriteClinical(actor: SessionUser, patientId: string): Promise<void> {
  if (!(await canViewPatient(actor, patientId))) {
    throw new ForbiddenError("You do not have access to this patient");
  }
  assertCanReadClinical(actor);
}

/**
 * Creates or updates the single assessment for an episode (upsert-by-episode,
 * so resubmission never duplicates). With no explicit episodeId the open
 * episode is joined, or auto-created with the complaint as reason. An
 * explicit episodeId must be open — writes to a discharged episode are
 * rejected, never silently reopened.
 */
export async function submitAssessment(actor: SessionUser, patientId: string, input: AssessmentInput) {
  await assertCanWriteClinical(actor, patientId);
  const parsed = assessmentSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    let episode = parsed.episodeId
      ? await tx.episodeOfCare.findFirst({
          where: { id: parsed.episodeId, patientId, status: "active" },
        })
      : await tx.episodeOfCare.findFirst({
          where: { patientId, status: "active" },
          orderBy: { startedAt: "desc" },
        });
    if (parsed.episodeId && !episode) throw new Error("Episode is discharged or missing — start a new one");
    if (!episode) {
      episode = await tx.episodeOfCare.create({
        data: {
          patientId,
          primaryTherapistId: actor.role === "therapist" ? actor.id : null,
          reason: parsed.chiefComplaint ?? "Assessment",
          status: "active",
        },
      });
    }
    const existing = await tx.assessment.findFirst({ where: { episodeId: episode.id } });
    const { episodeId: _ignored, ...fields } = parsed;
    const data = { ...fields, patientId, therapistId: actor.id, episodeId: episode.id };
    if (existing) return tx.assessment.update({ where: { id: existing.id }, data });
    return tx.assessment.create({ data });
  });
}

export async function dischargeEpisode(actor: SessionUser, episodeId: string) {
  const episode = await prisma.episodeOfCare.findUnique({ where: { id: episodeId } });
  if (!episode) throw new Error("Episode is discharged or missing — start a new one");
  await assertCanWriteClinical(actor, episode.patientId);
  await prisma.episodeOfCare.update({
    where: { id: episodeId },
    data: { status: "discharged", dischargedAt: new Date() },
  });
}

export async function startEpisode(actor: SessionUser, patientId: string, reason: string) {
  await assertCanWriteClinical(actor, patientId);
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("Episode reason is required");
  return prisma.episodeOfCare.create({
    data: {
      patientId,
      primaryTherapistId: actor.role === "therapist" ? actor.id : null,
      reason: trimmed,
      status: "active",
    },
  });
}
