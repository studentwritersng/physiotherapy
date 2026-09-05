"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/server/auth/rbac";
import {
  portalBookAppointment,
  portalCancelAppointment,
  portalRescheduleAppointment,
  requireLinkedPatientId,
} from "@/server/services/portal";
import { CutoffError, SlotTakenError } from "@/server/services/booking";
import { lagosWallToUtc } from "@/lib/slots";
import { cancelSchema, rescheduleSchema } from "@/lib/zod/booking";
import { isValidTime } from "@/lib/time";
import {
  actionFailed,
  actionOk,
  toFieldErrors,
  type ActionState,
} from "@/server/action-state";

/**
 * Portal booking form schema. Unlike the staff bookingSchema, the patient is
 * never a form field — it comes from the linked record — and the therapist is
 * optional (empty = no preference, resolved to a free therapist server-side).
 */
const portalBookSchema = z.object({
  serviceId: z.string().uuid("Choose a service"),
  therapistId: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .refine((v) => v === null || z.string().uuid().safeParse(v).success, "Choose a valid option"),
  dateKey: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .refine(
      (v) => {
        const y = Number(v.split("-")[0]);
        return y >= 2020 && y <= 2100;
      },
      { message: "Enter a real calendar date" },
    ),
  startTime: z.string().refine(isValidTime, "Use HH:MM, 24-hour"),
  reasonForVisit: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable(),
});

const PORTAL_PATHS = ["/portal", "/portal/appointments"] as const;

function revalidatePortal(): void {
  for (const path of PORTAL_PATHS) revalidatePath(path);
}

export async function portalBook(prev: ActionState, formData: FormData): Promise<ActionState> {
  void prev;
  const user = await requireRole("patient");
  const patientId = await requireLinkedPatientId(user.id);
  if (!patientId) return actionFailed("Your account is not linked yet.");

  const parsed = portalBookSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  try {
    const { therapistName } = await portalBookAppointment({
      patientId,
      serviceId: parsed.data.serviceId,
      therapistId: parsed.data.therapistId,
      start: lagosWallToUtc(parsed.data.dateKey, parsed.data.startTime),
      reason: parsed.data.reasonForVisit ?? undefined,
      actorId: user.id,
    });
    revalidatePortal();
    return actionOk(
      therapistName ? `Appointment booked with ${therapistName}` : "Appointment booked",
    );
  } catch (error) {
    if (error instanceof SlotTakenError) {
      return actionFailed("That slot was just taken — pick another");
    }
    if (error instanceof Error && /no therapist is free/i.test(error.message)) {
      return actionFailed("No therapist is free at that time — pick another slot.");
    }
    return actionFailed("Could not save the booking. Try again or contact the clinic.");
  }
}

export async function portalReschedule(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void prev;
  const user = await requireRole("patient");
  const patientId = await requireLinkedPatientId(user.id);
  if (!patientId) return actionFailed("Your account is not linked yet.");

  const parsed = rescheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  try {
    await portalRescheduleAppointment(
      patientId,
      parsed.data.id,
      lagosWallToUtc(parsed.data.dateKey, parsed.data.startTime),
      user.id,
    );
  } catch (error) {
    // Cutoff internals (hours left) never reach the patient — the only
    // actionable path this close in is a human at the clinic.
    if (error instanceof CutoffError) {
      return actionFailed("Too close to the appointment — please WhatsApp the clinic");
    }
    if (error instanceof SlotTakenError) {
      return actionFailed("That slot was just taken — pick another");
    }
    if (error instanceof Error && /contact the clinic/i.test(error.message)) {
      return actionFailed("This booking has no fixed therapist — contact the clinic to move it.");
    }
    if (error instanceof Error && /not found/i.test(error.message)) {
      return actionFailed("Appointment not found.");
    }
    return actionFailed("Could not move the appointment. Try again or contact the clinic.");
  }

  revalidatePortal();
  return actionOk("Appointment moved");
}

export async function portalCancel(prev: ActionState, formData: FormData): Promise<ActionState> {
  void prev;
  const user = await requireRole("patient");
  const patientId = await requireLinkedPatientId(user.id);
  if (!patientId) return actionFailed("Your account is not linked yet.");

  const parsed = cancelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  try {
    await portalCancelAppointment(patientId, parsed.data.id, parsed.data.reason, user.id);
  } catch (error) {
    if (error instanceof CutoffError) {
      return actionFailed("Too close to the appointment — please WhatsApp the clinic");
    }
    if (error instanceof Error && /not found/i.test(error.message)) {
      return actionFailed("Appointment not found.");
    }
    return actionFailed("Could not cancel. Try again or contact the clinic.");
  }

  revalidatePortal();
  return actionOk("Appointment cancelled");
}
