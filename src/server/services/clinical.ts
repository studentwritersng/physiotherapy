import "server-only";
import { prisma } from "@/server/db";
import { ForbiddenError } from "@/server/auth/rbac";
import type { SessionUser } from "@/server/auth/session";
import { assessmentSchema, exerciseSchema, exerciseUpdateSchema, noteSchema, planSchema, planUpdateSchema, type AssessmentInput, type ExerciseInput, type ExerciseUpdateInput, type NoteInput, type PlanInput, type PlanUpdateInput } from "@/lib/zod/clinical";
import { assertCanReadClinical, canViewPatient } from "@/server/services/patient";
import { todayKey } from "@/lib/slots";

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

/** The six SOAP note fields, in display order. Keys double as the soapLabels JSON keys. */
export const SOAP_KEYS = [
  "subjective",
  "objective",
  "treatmentProvided",
  "patientResponse",
  "exercisesInstructions",
  "nextPlan",
] as const;

export type SoapKey = (typeof SOAP_KEYS)[number];

/** Display labels when the clinic has not set a relabel for a key. */
export const DEFAULT_SOAP_LABELS: Record<SoapKey, string> = {
  subjective: "Subjective",
  objective: "Objective",
  treatmentProvided: "Treatment provided",
  patientResponse: "Patient response",
  exercisesInstructions: "Exercises & instructions",
  nextPlan: "Next plan",
};

/**
 * Display label per SOAP key. Blank or missing relabels fall back to the SOAP
 * defaults, so the clinic can rename one field without touching the rest.
 */
export async function getSoapLabels(): Promise<Record<SoapKey, string>> {
  const s = await prisma.clinicSettings.findUnique({ where: { id: 1 } });
  const raw = (s?.soapLabels ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    SOAP_KEYS.map((k) => [
      k,
      typeof raw[k] === "string" && raw[k].trim() ? raw[k].trim() : DEFAULT_SOAP_LABELS[k],
    ]),
  ) as Record<SoapKey, string>;
}

/**
 * Lagos calendar day for an instant, via todayKey (TIMEZONE-derived, never a
 * hardcoded offset). todayKey takes the instant as its `now` argument.
 */
function lagosDayKey(d: Date): string {
  return todayKey(d);
}

/**
 * Creates or updates the single session note for an appointment
 * (upsert-by-appointment, so resubmission never duplicates). Only the
 * appointed therapist writes — admins are read-only here, and a therapist
 * cannot write for another therapist's appointment. The note joins the
 * patient's open episode when one exists.
 *
 * Midnight rule: a same-Lagos-day edit is silent; an edit on a later Lagos
 * day stamps editedAt/editedBy so late corrections are auditable.
 */
export async function submitSessionNote(actor: SessionUser, appointmentId: string, input: NoteInput) {
  assertCanReadClinical(actor);
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, deletedAt: null },
  });
  if (!appt) throw new Error("Appointment not found");
  if (!(await canViewPatient(actor, appt.patientId))) throw new Error("Appointment not found");
  if (actor.role !== "therapist" || appt.therapistId !== actor.id) {
    throw new Error("Only the appointed therapist writes session notes");
  }
  const parsed = noteSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.sessionNote.findUnique({ where: { appointmentId } });
    const sameDay = existing && lagosDayKey(existing.createdAt) === lagosDayKey(new Date());
    // Same lookup as getOpenEpisode, but on the transaction client so the
    // join and the write stay atomic.
    const episode = await tx.episodeOfCare.findFirst({
      where: { patientId: appt.patientId, status: "active" },
      orderBy: { startedAt: "desc" },
    });
    const data = {
      ...parsed,
      patientId: appt.patientId,
      therapistId: actor.id,
      episodeId: episode?.id ?? null,
    };
    if (!existing) return tx.sessionNote.create({ data: { ...data, appointmentId } });
    if (sameDay) return tx.sessionNote.update({ where: { id: existing.id }, data });
    return tx.sessionNote.update({
      where: { id: existing.id },
      data: { ...data, editedAt: new Date(), editedById: actor.id },
    });
  });
}

/**
 * Appointments for the note form's appointment picker, newest first.
 * Soft-deleted rows excluded; callers gate with getPatientForActor first.
 */
export async function listPatientAppointments(patientId: string) {
  return prisma.appointment.findMany({
    where: { patientId, deletedAt: null },
    orderBy: { scheduledStart: "desc" },
    include: { sessionNote: { select: { id: true } } },
  });
}

// ─────────────────── Treatment plans + exercises ───────────────────

/**
 * Creates a treatment plan for a patient. An explicit episodeId must belong to
 * the patient; otherwise the plan joins the open episode when one exists, or
 * stands outside episodes (null) like a pre-episode plan.
 */
export async function createTreatmentPlan(actor: SessionUser, patientId: string, input: PlanInput) {
  await assertCanWriteClinical(actor, patientId);
  const parsed = planSchema.parse(input);
  const { episodeId: choice, ...fields } = parsed;
  let episodeId: string | null = null;
  if (choice) {
    const episode = await prisma.episodeOfCare.findFirst({
      where: { id: choice, patientId },
    });
    if (!episode) throw new Error("Episode not found");
    episodeId = episode.id;
  } else {
    episodeId = (await getOpenEpisode(patientId))?.id ?? null;
  }
  return prisma.treatmentPlan.create({
    data: { ...fields, patientId, therapistId: actor.id, episodeId },
  });
}

/**
 * Plain update for plan edits, status changes (active/completed/on_hold), and
 * the patientVisible toggle. Scoped through the plan's patient so a forged
 * plan id fails closed.
 */
export async function updateTreatmentPlan(actor: SessionUser, planId: string, input: PlanUpdateInput) {
  const plan = await prisma.treatmentPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error("Treatment plan not found");
  await assertCanWriteClinical(actor, plan.patientId);
  const parsed = planUpdateSchema.parse(input);
  return prisma.treatmentPlan.update({ where: { id: planId }, data: parsed });
}

/** Adds one exercise row to a plan; display order is sortOrder ascending. */
export async function addExercise(actor: SessionUser, planId: string, input: ExerciseInput) {
  const plan = await prisma.treatmentPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error("Treatment plan not found");
  await assertCanWriteClinical(actor, plan.patientId);
  const parsed = exerciseSchema.parse(input);
  return prisma.exercise.create({ data: { ...parsed, treatmentPlanId: planId } });
}

/**
 * Plain update for exercise edits, reorder, and the patientVisible toggle.
 * Scoped through the plan's patient so a forged exercise id fails closed.
 */
export async function updateExercise(actor: SessionUser, exerciseId: string, input: ExerciseUpdateInput) {
  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    include: { treatmentPlan: { select: { patientId: true } } },
  });
  if (!exercise) throw new Error("Exercise not found");
  await assertCanWriteClinical(actor, exercise.treatmentPlan.patientId);
  const parsed = exerciseUpdateSchema.parse(input);
  return prisma.exercise.update({ where: { id: exerciseId }, data: parsed });
}

/**
 * Plans with their exercises (sortOrder ascending) for the #plans section.
 * Unauthenticated by design: callers gate with getPatientForActor first
 * (null → notFound), like the record shell does.
 */
export async function getPlansWithExercises(patientId: string) {
  return prisma.treatmentPlan.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
    include: { exercises: { orderBy: { sortOrder: "asc" } } },
  });
}
