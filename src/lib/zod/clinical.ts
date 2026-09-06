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
