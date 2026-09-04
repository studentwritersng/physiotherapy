"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  bookPublicAppointment,
  getSlotsForDate,
  SlotTakenError,
} from "@/server/services/booking";
import { checkRateLimit, recordFailedAttempt } from "@/server/auth/rate-limit";
import { normalisePhone } from "@/server/auth/login";
import { lagosWallToUtc } from "@/lib/slots";
import { publicBookingSchema } from "@/lib/zod/public-booking";
import { actionFailed, toFieldErrors, type ActionState } from "@/server/action-state";

/**
 * No requireRole here — this is the unauthenticated surface (spec §6). The
 * abuse guard is the existing throttle, keyed on phone + IP so one device
 * cannot enumerate patients or spam bookings (spec §4.5).
 */
export async function submitPublicBooking(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const rawPhone = String(formData.get("phone") ?? "");
  const heads = await headers();
  const forwarded = heads.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  // normalisePhone never throws (pure string ops), so the key is computable
  // even for malformed input. Every failure outcome below records against
  // this key — including validation failures, so a prober hammering bad
  // phones burns budget instead of getting free guesses.
  const gateKey = `public-book:${normalisePhone(rawPhone)}:${ip}`;

  const gate = await checkRateLimit(gateKey);
  if (!gate.allowed) {
    return actionFailed(
      `Too many booking attempts. Please wait ${Math.ceil(gate.retryAfterSeconds / 60)} minutes and try again.`,
    );
  }

  const parsed = publicBookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    await recordFailedAttempt(gateKey);
    return toFieldErrors(parsed.error, "Check the highlighted fields");
  }

  // No-preference resolves exactly like the staff flow: first free therapist
  // for the chosen slot, so every booking pins a therapist before insert.
  let therapistId = parsed.data.therapistId;
  if (!therapistId) {
    const slots = await getSlotsForDate(parsed.data.dateKey, parsed.data.serviceId, null);
    const match = slots.find(
      (s) => s.start.getTime() === lagosWallToUtc(parsed.data.dateKey, parsed.data.startTime).getTime(),
    );
    if (!match) {
      await recordFailedAttempt(gateKey);
      return actionFailed("No therapist is free at that time. Pick another slot.");
    }
    therapistId = match.therapistId;
  }

  try {
    const { appointment, reference } = await bookPublicAppointment({
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      email: parsed.data.email,
      isNewPatient: parsed.data.isNewPatient,
      reasonForVisit: parsed.data.reasonForVisit,
      serviceId: parsed.data.serviceId,
      therapistId,
      start: lagosWallToUtc(parsed.data.dateKey, parsed.data.startTime),
    });
    revalidatePath("/book");
    redirect(`/book/confirm/${appointment.id}?ref=${reference}`);
  } catch (error) {
    if (error instanceof SlotTakenError) {
      await recordFailedAttempt(gateKey);
      return actionFailed("Someone just took that slot. Please pick another time.");
    }
    throw error;
  }
}
