import { z } from "zod";

/**
 * Portal digital intake form (PRD-04 §5). Every clinical field is optional
 * free text; only the consent checkbox is load-bearing.
 *
 * FormData gives every value as a string and omits an unchecked checkbox
 * entirely, so: optional text normalizes ""/absent to null, and consent
 * normalizes the checked checkbox values ("on"/"true") to boolean true
 * before the required-true literal rejects everything else server-side.
 */
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v.length === 0 ? null : v))
  .nullable();

const consentField = z.preprocess(
  (v) => (v === "on" || v === "true" ? true : v),
  z.literal(true, { message: "Please accept the consent statement" }),
);

export const intakeSchema = z.object({
  reasonForVisit: optionalText,
  medicalHistory: optionalText,
  previousInjuries: optionalText,
  previousSurgeries: optionalText,
  currentMedications: optionalText,
  allergies: optionalText,
  referringDoctor: optionalText,
  consent: consentField,
});

/**
 * Input (pre-transform) type, not the output: consent is unknown before the
 * preprocess/literal runs, so a caller passing `consent: false` typechecks
 * and Zod rejects it at runtime — the server-side failure the portal test
 * proves, instead of a compile error hiding it.
 */
export type IntakeInput = z.input<typeof intakeSchema>;
export type IntakeOutput = z.output<typeof intakeSchema>;
