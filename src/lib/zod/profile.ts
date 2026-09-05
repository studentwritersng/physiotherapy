import { z } from "zod";
import { phoneSchema } from "./auth";

/**
 * Portal profile (spec §5: exactly PRD-04 §4 fields plus the required email
 * from §6). Blank email fails here, server-side — HTML `required` is UX only.
 *
 * FormData gives every value as a string, so ""/absent normalises to null
 * (optional text) or undefined (optional phone/dob) before the shared rules
 * run. Email uses the same rule as registration.
 */
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v.length === 0 ? null : v))
  .nullable();

const optionalPhone = z.preprocess(
  (v) => (v === "" || v === undefined ? undefined : v),
  phoneSchema.optional(),
);

const optionalDob = z.preprocess(
  (v) => (v === "" || v === undefined ? undefined : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date of birth (YYYY-MM-DD)")
    .optional(),
);

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name"),
  phone: phoneSchema,
  email: z.string().trim().email("Enter a valid email address"),
  dateOfBirth: optionalDob,
  address: optionalText,
  emergencyContactName: optionalText,
  emergencyContactPhone: optionalPhone,
  basicMedicalInfo: optionalText,
});

export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileOutput = z.output<typeof profileSchema>;
