import "server-only";
import type { Appointment, AppointmentStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

/**
 * The only legal status edges (spec §4.4). Confirmation is optional — arrivals
 * skip it and walk-ins enter at arrived. completed/cancelled/no_show are
 * terminal. in_session has exactly one exit: the spec's graph lists no abort
 * edge, and inventing one is out of scope.
 */
export const NEXT_STATUS: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ["confirmed", "arrived", "cancelled", "no_show"],
  confirmed: ["arrived", "cancelled", "no_show"],
  arrived: ["in_session", "cancelled", "no_show"],
  in_session: ["completed"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export class InvalidTransitionError extends Error {
  readonly status = 422;
  readonly from: AppointmentStatus;
  readonly to: AppointmentStatus;

  constructor(from: AppointmentStatus, to: AppointmentStatus) {
    super(`Cannot move an appointment from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function assertLegalTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!NEXT_STATUS[from].includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/**
 * The ONLY writer of status changes. Loads the row (excluding soft-deleted),
 * asserts the edge, then updates the status and appends the history row in one
 * transaction — a crash can never leave a status without its history entry.
 */
export async function transitionStatus(
  appointmentId: string,
  to: AppointmentStatus,
  actorId: string,
): Promise<Appointment> {
  const current = await prisma.appointment.findFirst({
    where: { id: appointmentId, deletedAt: null },
  });
  if (!current) {
    throw new Error(`Appointment not found: ${appointmentId}`);
  }

  assertLegalTransition(current.status, to);

  const [updated] = await prisma.$transaction([
    prisma.appointment.update({ where: { id: appointmentId }, data: { status: to } }),
    prisma.appointmentStatusHistory.create({
      data: { appointmentId, status: to, changedById: actorId },
    }),
  ]);
  return updated;
}
