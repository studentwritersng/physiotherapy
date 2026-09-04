"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, getCurrentUser } from "@/server/auth/rbac";
import { walkInAppointment } from "@/server/services/booking";
import { walkInSchema } from "@/lib/zod/booking";
import { actionFailed, toFieldErrors, type ActionState } from "@/server/action-state";

export async function confirmWalkIn(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("admin", "receptionist");

  const parsed = walkInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  const actor = await getCurrentUser();
  if (!actor) return actionFailed("Signed out — log in again and retry.");

  // The schema refine already rejects a null therapist, but the refine does
  // not narrow the output type — guard explicitly rather than passing "".
  const therapistId = parsed.data.therapistId;
  if (!therapistId) {
    return actionFailed("A walk-in needs a therapist now — there is no later assignment");
  }

  // redirect() throws, so it stays outside the try: a bare catch would swallow
  // the NEXT_REDIRECT and return a failure banner instead of navigating.
  let appointmentId: string;
  try {
    const appointment = await walkInAppointment({
      phone: parsed.data.phone,
      fullName: parsed.data.fullName,
      patientId: parsed.data.patientId,
      serviceId: parsed.data.serviceId,
      therapistId,
      actorId: actor.id,
    });
    appointmentId = appointment.id;
  } catch {
    return actionFailed("Could not save the walk-in. Try again.");
  }

  revalidatePath("/staff/appointments");
  redirect(`/staff/appointments/${appointmentId}`);
}
