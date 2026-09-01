import { z } from "zod";
import { isValidTime } from "@/lib/time";

/** Monday first — the clinic week starts Monday, and the editor renders in this order. */
export const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type DayKey = (typeof DAY_KEYS)[number];

const timeString = z.string().refine(isValidTime, "Use HH:MM, 24-hour");

/** null means the clinic is closed that day (spec §3.1). */
export const dayHoursSchema = z
  .object({ open: timeString, close: timeString })
  .refine((d) => d.close > d.open, { message: "Closing time must be after opening time" })
  .nullable();

export const openingHoursSchema = z.object({
  monday: dayHoursSchema,
  tuesday: dayHoursSchema,
  wednesday: dayHoursSchema,
  thursday: dayHoursSchema,
  friday: dayHoursSchema,
  saturday: dayHoursSchema,
  sunday: dayHoursSchema,
});

export type DayHours = z.infer<typeof dayHoursSchema>;
export type OpeningHours = z.infer<typeof openingHoursSchema>;

export const EMPTY_OPENING_HOURS: OpeningHours = {
  monday: null,
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
};

/**
 * The only way to read the openingHours JSON column (spec §3.1). Parsing on read
 * as well as write means a hand-edited row fails here, at the boundary, rather
 * than deep inside sub-project 3's slot generation.
 *
 * An empty object or null is the Prisma column default, so it degrades to
 * all-closed and the settings form renders instead of throwing.
 */
export function parseOpeningHours(value: unknown): OpeningHours {
  if (value === null || value === undefined) return EMPTY_OPENING_HOURS;
  if (typeof value === "object" && Object.keys(value as object).length === 0) {
    return EMPTY_OPENING_HOURS;
  }
  return openingHoursSchema.parse(value);
}

/** A FormData value is always a string; "" means the user left an optional field blank. */
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable();

const optionalUrl = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .refine((v) => v === null || z.string().url().safeParse(v).success, "Enter a valid URL");

const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .refine((v) => v === null || z.string().email().safeParse(v).success, "Enter a valid email");

/**
 * An unchecked HTML checkbox is absent from FormData, not "false".
 * The absent-key case needs `.optional()` at the top level: in Zod v4 a
 * `z.undefined()` union member accepts an explicit undefined value but does
 * not mark the object key itself as omittable.
 */
const checkbox = z
  .union([z.literal("true"), z.literal("on"), z.literal("false")])
  .optional()
  .transform((v) => v === "true" || v === "on");

const wholeNumber = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => /^-?\d+$/.test(v), `${label} must be a whole number`)
    .transform(Number)
    .refine((n) => n >= min && n <= max, `${label} must be between ${min} and ${max}`);

export const clinicSettingsSchema = z.object({
  clinicName: z.string().trim().min(1, "Clinic name is required"),
  tagline: optionalText,
  logoUrl: optionalUrl,
  aboutContent: optionalText,
  contactPhone: optionalText,
  contactWhatsapp: optionalText,
  contactEmail: optionalEmail,
  address: optionalText,
  bookingLeadTimeHours: wholeNumber("Booking lead time", 0, 168),
  rescheduleCutoffHours: wholeNumber("Reschedule cutoff", 0, 168),
  cancellationCutoffHours: wholeNumber("Cancellation cutoff", 0, 168),
});

export const serviceSchema = z.object({
  name: z.string().trim().min(1, "Service name is required"),
  description: optionalText,
  defaultDurationMinutes: wholeNumber("Duration", 5, 480),
  /**
   * Kept as a string all the way to Prisma, which accepts a decimal string for a
   * Decimal(12,2) column. Going through a JS number would risk a float artefact
   * on a money value.
   */
  defaultPrice: z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Enter an amount like 15000 or 15000.00"),
  imageUrl: optionalUrl,
});

export const availabilitySchema = z
  .object({
    therapistId: z.string().uuid("Choose a therapist"),
    kind: z.enum(["recurring", "dated"]),
    dayOfWeek: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v === undefined || v === "" ? null : Number(v))),
    specificDate: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v === undefined || v === "" ? null : v)),
    startTime: timeString,
    endTime: timeString,
    isBlocked: checkbox,
    reason: optionalText.optional().transform((v) => v ?? null),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "End time must be after the start time",
    path: ["endTime"],
  })
  .refine((v) => v.kind !== "recurring" || (v.dayOfWeek !== null && v.dayOfWeek >= 0 && v.dayOfWeek <= 6), {
    message: "Choose a day of the week",
    path: ["dayOfWeek"],
  })
  .refine((v) => v.kind !== "dated" || (v.specificDate !== null && /^\d{4}-\d{2}-\d{2}$/.test(v.specificDate)), {
    message: "Choose a date",
    path: ["specificDate"],
  })
  // A row is either recurring or dated, never both — the resolver's precedence
  // rule depends on being able to tell them apart (spec §3.2).
  .transform((v) => ({
    ...v,
    dayOfWeek: v.kind === "recurring" ? v.dayOfWeek : null,
    specificDate: v.kind === "dated" ? v.specificDate : null,
  }));

export const testimonialSchema = z.object({
  patientName: z.string().trim().min(1, "Name is required"),
  content: z.string().trim().min(1, "Testimonial text is required"),
  published: checkbox,
});

export type ClinicSettingsInput = z.infer<typeof clinicSettingsSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
export type AvailabilityInput = z.infer<typeof availabilitySchema>;
export type TestimonialInput = z.infer<typeof testimonialSchema>;
