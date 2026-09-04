import { z } from "zod";
import { isValidTime } from "@/lib/time";

const timeString = z.string().refine(isValidTime, "Use HH:MM, 24-hour");

const dateKeyString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine(
    (v) => {
      // Shape only: the year guard catches typos at the form level, but month
      // and day ranges are NOT checked here. An impossible date like 2026-13-40
      // passes validation and surfaces as a service error downstream, so the
      // form never shows a misleading field message for it.
      const y = Number(v.split("-")[0]);
      return y >= 2020 && y <= 2100;
    },
    { message: "Enter a real calendar date" },
  );

/** FormData gives every value as a string; "" means the field was left blank. */
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable();

const uuidOrEmpty = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .refine((v) => v === null || z.string().uuid().safeParse(v).success, "Choose a valid option");

/** An unchecked HTML checkbox is absent from FormData, not "false". */
const checkbox = z
  .union([z.literal("true"), z.literal("on"), z.literal("false")])
  .optional()
  .transform((v) => v === "true" || v === "on");

export const bookingSchema = z
  .object({
    patientId: z.string().uuid("Choose a patient"),
    therapistId: uuidOrEmpty,
    noPreference: checkbox,
    serviceId: z.string().uuid("Choose a service"),
    dateKey: dateKeyString,
    startTime: timeString,
    reasonForVisit: optionalText,
  })
  .refine((v) => v.noPreference || v.therapistId !== null, {
    message: "Choose a therapist or tick no preference",
    path: ["therapistId"],
  });

export const walkInSchema = z
  .object({
    phone: z.string().trim().min(7, "Enter the patient's phone number"),
    fullName: z.string().trim(),
    // Absent when the walk-in is a new lead (no patient to link yet); normalize
    // to null so the refine below sees exactly "linked" vs "new". Mirrors the
    // optional().transform(v => v ?? null) pattern in clinic.ts.
    patientId: uuidOrEmpty.optional().transform((v) => v ?? null),
    serviceId: z.string().uuid("Choose a service"),
    therapistId: uuidOrEmpty,
  })
  .refine((v) => v.patientId !== null || v.fullName.length >= 2, {
    message: "Enter the patient's name for a new record",
    path: ["fullName"],
  })
  .refine((v) => v.therapistId !== null, {
    message: "A walk-in needs a therapist now — there is no later assignment",
    path: ["therapistId"],
  });

export const rescheduleSchema = z.object({
  id: z.string().uuid(),
  dateKey: dateKeyString,
  startTime: timeString,
});

export const cancelSchema = z.object({
  id: z.string().uuid(),
  // PRD-09's cancelled-appointments report depends on a reason being captured.
  reason: z.string().trim().min(1, "Give a reason — it feeds the cancelled-appointments report"),
});

export const statusSchema = z.object({
  id: z.string().uuid(),
  to: z.enum([
    "scheduled",
    "confirmed",
    "arrived",
    "in_session",
    "completed",
    "cancelled",
    "no_show",
  ]),
});

export type BookingInput = z.infer<typeof bookingSchema>;
export type WalkInInput = z.infer<typeof walkInSchema>;
export type RescheduleInput = z.infer<typeof rescheduleSchema>;
export type CancelInput = z.infer<typeof cancelSchema>;
export type StatusInput = z.infer<typeof statusSchema>;
