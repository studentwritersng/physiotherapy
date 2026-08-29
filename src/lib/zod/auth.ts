import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "@/lib/constants";

/** PRD-01 §3.3: minimum 8 characters, at least one number. Nothing more. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .regex(/[0-9]/, "Password must contain at least one number");

/** Nigerian numbers, accepted as 0803..., +234803... or 234803... */
export const phoneSchema = z
  .string()
  .trim()
  .min(10, "Enter a valid phone number")
  .regex(/^(\+?234|0)[789][01]\d{8}$/, "Enter a valid Nigerian phone number");

export const staffLoginSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your email or phone number"),
  password: z.string().min(1, "Enter your password"),
});

export const patientLoginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, "Enter your password"),
});

export const patientRegisterSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name"),
  phone: phoneSchema,
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: passwordSchema,
});

export type StaffLoginInput = z.infer<typeof staffLoginSchema>;
export type PatientLoginInput = z.infer<typeof patientLoginSchema>;
export type PatientRegisterInput = z.infer<typeof patientRegisterSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
