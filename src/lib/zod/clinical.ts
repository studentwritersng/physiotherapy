import { z } from "zod";

/**
 * Initial assessment (PRD-05). Every clinical field is optional free text so
 * an in-progress assessment saves partial — only the UI's episode picker and
 * the explicit-start reason carry requiredness.
 *
 * FormData gives every value as a string, so optional text normalizes
 * ""/absent to null, and episodeId normalizes "" to undefined before the
 * UUID check runs.
 */
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v.length === 0 ? null : v))
  .nullable();

const episodeIdField = z.preprocess(
  (v) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? undefined : v),
  z.string().uuid("Select a valid episode").optional(),
);

export const assessmentSchema = z.object({
  chiefComplaint: optionalText,
  history: optionalText,
  examination: optionalText,
  assessment: optionalText,
  treatmentGoals: optionalText,
  treatmentPlan: optionalText,
  episodeId: episodeIdField,
});

export type AssessmentInput = z.input<typeof assessmentSchema>;
export type AssessmentOutput = z.output<typeof assessmentSchema>;

/**
 * SOAP session note (PRD-05): one row per appointment, all six fields optional
 * free text so an in-progress note saves partial. Same ""/absent → null
 * normalization as the assessment schema — FormData gives every value as a
 * string.
 */
export const noteSchema = z.object({
  subjective: optionalText,
  objective: optionalText,
  treatmentProvided: optionalText,
  patientResponse: optionalText,
  exercisesInstructions: optionalText,
  nextPlan: optionalText,
});

export type NoteInput = z.input<typeof noteSchema>;
export type NoteOutput = z.output<typeof noteSchema>;

/**
 * Checkbox coercion for FormData: checked posts "on", unchecked posts nothing.
 * Service callers pass real booleans; both arrive here as true/false.
 */
const checkbox = z.preprocess(
  (v) => v === true || v === "true" || v === "on" || v === "1",
  z.boolean(),
);

const planStatus = z.enum(["active", "completed", "on_hold"]);

/**
 * Treatment plan (PRD-05): goals/details/frequency/duration/focusAreas are
 * optional free text so an in-progress plan saves partial. Status defaults to
 * active; patientVisible defaults to hidden (portal exposure needs the flag
 * AND the clinic master switch). episodeId normalizes "" to undefined.
 */
export const planSchema = z.object({
  goals: optionalText,
  planDetails: optionalText,
  frequency: optionalText,
  duration: optionalText,
  focusAreas: optionalText,
  status: planStatus.default("active"),
  patientVisible: checkbox.default(false),
  episodeId: episodeIdField,
});

export type PlanInput = z.input<typeof planSchema>;
export type PlanOutput = z.output<typeof planSchema>;

/** Partial update: status change and visibility toggles are plain updates. */
export const planUpdateSchema = z.object({
  goals: optionalText.optional(),
  planDetails: optionalText.optional(),
  frequency: optionalText.optional(),
  duration: optionalText.optional(),
  focusAreas: optionalText.optional(),
  status: planStatus.optional(),
  patientVisible: checkbox.optional(),
});

export type PlanUpdateInput = z.input<typeof planUpdateSchema>;

/**
 * Exercise: name is the only required field. sortOrder pins display order
 * (ascending); patientVisible defaults to hidden so a new row never leaks to
 * the portal before the therapist flips it.
 */
export const exerciseSchema = z.object({
  name: z.string().trim().min(1, "Give the exercise a name").max(200),
  description: optionalText,
  imageUrl: optionalText,
  sortOrder: z.coerce.number().int().min(0).default(0),
  patientVisible: checkbox.default(false),
});

export type ExerciseInput = z.input<typeof exerciseSchema>;
export type ExerciseOutput = z.output<typeof exerciseSchema>;

/** Partial update for exercise edits and visibility toggles. */
export const exerciseUpdateSchema = z.object({
  name: z.string().trim().min(1, "Give the exercise a name").max(200).optional(),
  description: optionalText.optional(),
  imageUrl: optionalText.optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  patientVisible: checkbox.optional(),
});

export type ExerciseUpdateInput = z.input<typeof exerciseUpdateSchema>;

/**
 * Patient document row (PRD-05 §5). documentType mirrors the Prisma
 * DocumentType enum; key is the R2 object key stored as fileUrl. The size
 * ceiling lives in the service's assertValidDocumentFile re-check (which
 * shares one message with the presigner), so this schema only requires a
 * positive integer — never a competing limit.
 */
export const documentTypeEnum = z.enum(["referral", "medical_report", "xray", "mri", "other"]);

export const documentSchema = z.object({
  key: z.string().trim().min(1, "Missing file reference. Try the upload again.").max(500),
  fileName: z.string().trim().min(1, "Give the file a name").max(255),
  mimeType: z.string().trim().min(1, "Missing file type. Try the upload again."),
  fileSize: z.coerce.number().int().min(1, "Empty files cannot be uploaded"),
  documentType: documentTypeEnum,
  episodeId: episodeIdField,
});

export type DocumentInput = z.input<typeof documentSchema>;
export type DocumentOutput = z.output<typeof documentSchema>;
