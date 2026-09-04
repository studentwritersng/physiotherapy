import { z } from "zod";
import { isValidTime } from "@/lib/time";

const timeString = z.string().refine(isValidTime, "Use HH:MM, 24-hour");

const dateKeyString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine(
    (v) => {
      const y = Number(v.split("-")[0]);
      return y >= 2020 && y <= 2100;
    },
    { message: "Enter a real calendar date" },
  );

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable();

/** Nigerian mobile formats; normalisation to E.164 happens server-side. */
const phoneString = z
  .string()
  .trim()
  .regex(/^(\+?234|0)[789][01]\d{8}$/, "Enter a valid Nigerian phone number");

const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .refine((v) => v === null || z.string().email().safeParse(v).success, "Enter a valid email");

const checkbox = z
  .union([z.literal("true"), z.literal("on"), z.literal("false")])
  .optional()
  .transform((v) => v === "true" || v === "on");

export const publicBookingSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name"),
  phone: phoneString,
  email: optionalEmail,
  isNewPatient: checkbox,
  reasonForVisit: optionalText,
  serviceId: z.string().uuid("Choose a service"),
  therapistId: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .refine((v) => v === null || z.string().uuid().safeParse(v).success, "Choose a valid option"),
  dateKey: dateKeyString,
  startTime: timeString,
});

export type PublicBookingInput = z.infer<typeof publicBookingSchema>;
