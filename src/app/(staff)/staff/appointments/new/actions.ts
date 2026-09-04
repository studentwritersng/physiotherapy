"use server";

import { revalidatePath } from "next/cache";
import { requireRole, getCurrentUser } from "@/server/auth/rbac";
import {
  bookAppointment,
  getSlotsForDate,
  SlotTakenError,
} from "@/server/services/booking";
import { bookingSchema } from "@/lib/zod/booking";
import { lagosWallToUtc } from "@/lib/slots";
import { actionFailed, actionOk, toFieldErrors, type ActionState } from "@/server/action-state";
import type { BookedVia } from "@/generated/prisma/client";

export async function createBooking(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("admin", "receptionist");

  const parsed = bookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  const actor = await getCurrentUser();
  if (!actor) return actionFailed("Signed out — log in again and retry.");

  // No-preference resolves to the first free therapist for that slot, so the
  // booking always pins a therapist before insert (Task 1's null finding).
  let therapistId = parsed.data.therapistId;
  if (!therapistId) {
    const slots = await getSlotsForDate(parsed.data.dateKey, parsed.data.serviceId, null);
    const match = slots.find(
      (s) => s.start.getTime() === lagosWallToUtc(parsed.data.dateKey, parsed.data.startTime).getTime(),
    );
    if (!match) return actionFailed("No therapist is free at that time. Pick another slot.");
    therapistId = match.therapistId;
  }

  try {
    await bookAppointment({
      patientId: parsed.data.patientId,
      therapistId,
      serviceId: parsed.data.serviceId,
      // Wall-clock HH:MM to a real instant — never new Date("...T09:00:00"),
      // which parses as UTC and silently shifts the booking by an hour.
      start: lagosWallToUtc(parsed.data.dateKey, parsed.data.startTime),
      bookedVia: "staff" as BookedVia,
      reasonForVisit: parsed.data.reasonForVisit,
      actorId: actor.id,
    });
  } catch (error) {
    if (error instanceof SlotTakenError) {
      return actionFailed("That slot was just taken. Pick another time.");
    }
    return actionFailed("Could not save the booking. Try again.");
  }

  revalidatePath("/staff/appointments");
  return actionOk("Booking saved");
}
