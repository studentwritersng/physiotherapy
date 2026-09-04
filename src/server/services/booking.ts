import "server-only";
import { Prisma, type Appointment, type AppointmentStatus, type BookedVia, type Patient } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { getClinicSettings } from "@/server/services/clinic-settings";
import { getService } from "@/server/services/service-catalog";
import { listTherapists, resolveAvailability } from "@/server/services/availability";
import { normalisePhone } from "@/server/auth/login";
import { transitionStatus } from "@/server/services/appointment-status";
import { getBookableSlots, lagosDayRange, type BookableSlot } from "@/lib/slots";

/** Soft-delete filter. Overlap checks additionally exclude cancelled/no_show,
 * mirroring the exclusion-constraint predicate (Task 1). */
const notDeleted = { deletedAt: null } as const;
const notBlocking = {
  ...notDeleted,
  status: { notIn: ["cancelled", "no_show"] as AppointmentStatus[] },
  wasForceBooked: false,
};

export class SlotTakenError extends Error {
  readonly status = 409;
  readonly conflicts: { start: Date; end: Date }[];

  constructor(conflicts: { start: Date; end: Date }[]) {
    super(
      conflicts.length === 1
        ? `That slot overlaps an existing appointment at ${conflicts[0]!.start.toISOString()}`
        : `That slot overlaps ${conflicts.length} existing appointments`,
    );
    this.name = "SlotTakenError";
    this.conflicts = conflicts;
  }
}

export class CutoffError extends Error {
  readonly status = 422;
  readonly hoursLeft: number;

  constructor(hoursLeft: number, action: "rescheduled" | "cancelled") {
    super(
      `Too close to the appointment — it can only be ${action} ${hoursLeft.toFixed(1)} hours from now`,
    );
    this.name = "CutoffError";
    this.hoursLeft = hoursLeft;
  }
}

type Overlap = { start: Date; end: Date };

async function findOverlaps(
  tx: { appointment: { findMany: typeof prisma.appointment.findMany } },
  therapistId: string,
  start: Date,
  end: Date,
  exceptId?: string,
): Promise<Overlap[]> {
  const rows = await tx.appointment.findMany({
    where: {
      ...notBlocking,
      therapistId,
      ...(exceptId ? { id: { not: exceptId } } : {}),
      scheduledStart: { lt: end },
      scheduledEnd: { gt: start },
    },
    select: { scheduledStart: true, scheduledEnd: true },
    orderBy: { scheduledStart: "asc" },
  });
  return rows.map((r) => ({ start: r.scheduledStart, end: r.scheduledEnd }));
}

export type BookInput = {
  patientId: string;
  therapistId: string;
  serviceId: string;
  start: Date;
  bookedVia: BookedVia;
  reasonForVisit?: string | null;
  actorId: string;
};

/**
 * Books a scheduled appointment. The overlap query gives the friendly error;
 * the exclusion constraint (Task 1) is the backstop — a lost race surfaces as
 * P2002 and is translated to the same SlotTakenError, so callers handle one
 * error either way.
 */
export async function bookAppointment(input: BookInput): Promise<Appointment> {
  const service = await getService(input.serviceId);
  if (!service) throw new Error(`Service not found: ${input.serviceId}`);
  const end = new Date(input.start.getTime() + service.defaultDurationMinutes * 60_000);

  const conflicts = await findOverlaps(prisma, input.therapistId, input.start, end);
  if (conflicts.length > 0) throw new SlotTakenError(conflicts);

  try {
    return await prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.create({
        data: {
          patientId: input.patientId,
          therapistId: input.therapistId,
          serviceId: input.serviceId,
          scheduledStart: input.start,
          scheduledEnd: end,
          status: "scheduled",
          bookedVia: input.bookedVia,
          reasonForVisit: input.reasonForVisit ?? null,
          wasForceBooked: false,
        },
      });
      await tx.appointmentStatusHistory.create({
        data: { appointmentId: appointment.id, status: "scheduled", changedById: input.actorId },
      });
      return appointment;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Lost the race after the friendly check — re-read the winner for the message.
      const conflicts = await findOverlaps(prisma, input.therapistId, input.start, end);
      throw new SlotTakenError(conflicts);
    }
    throw error;
  }
}

function hoursUntil(date: Date, now: Date): number {
  return (date.getTime() - now.getTime()) / 3_600_000;
}

export async function rescheduleAppointment(
  id: string,
  start: Date,
  actorId: string,
  now: Date = new Date(),
): Promise<Appointment> {
  const current = await prisma.appointment.findFirst({ where: { id, ...notDeleted } });
  if (!current) throw new Error(`Appointment not found: ${id}`);
  if (!current.therapistId) throw new Error(`Appointment ${id} has no therapist pinned`);

  const settings = await getClinicSettings();
  const left = hoursUntil(current.scheduledStart, now);
  if (left < settings.rescheduleCutoffHours) {
    throw new CutoffError(Math.max(0, left), "rescheduled");
  }

  const service = await getService(current.serviceId);
  if (!service) throw new Error(`Service not found: ${current.serviceId}`);
  const end = new Date(start.getTime() + service.defaultDurationMinutes * 60_000);

  const conflicts = await findOverlaps(prisma, current.therapistId, start, end, id);
  if (conflicts.length > 0) throw new SlotTakenError(conflicts);
  void actorId;

  try {
    return await prisma.appointment.update({
      where: { id },
      data: { scheduledStart: start, scheduledEnd: end },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const conflicts = await findOverlaps(prisma, current.therapistId, start, end, id);
      throw new SlotTakenError(conflicts);
    }
    throw error;
  }
}

export async function cancelAppointment(
  id: string,
  reason: string,
  actorId: string,
  now: Date = new Date(),
): Promise<Appointment> {
  const current = await prisma.appointment.findFirst({ where: { id, ...notDeleted } });
  if (!current) throw new Error(`Appointment not found: ${id}`);

  const settings = await getClinicSettings();
  const left = hoursUntil(current.scheduledStart, now);
  if (left < settings.cancellationCutoffHours) {
    throw new CutoffError(Math.max(0, left), "cancelled");
  }

  await transitionStatus(id, "cancelled", actorId);
  return prisma.appointment.update({
    where: { id },
    data: { cancellationReason: reason, cancelledById: actorId },
  });
}

/** Phone match for the walk-in flow (spec §4.5). Normalisation matches login. */
export async function findWalkInMatch(phone: string): Promise<Patient | null> {
  const digits = normalisePhone(phone);
  return prisma.patient.findFirst({
    where: { phone: digits, ...notDeleted },
    orderBy: { createdAt: "asc" },
  });
}

async function nextPatientCode(tx: { patient: { count: () => Promise<number> } }): Promise<string> {
  const count = await tx.patient.count();
  return `TP-${String(count + 1).padStart(5, "0")}`;
}

export type WalkInInput = {
  phone: string;
  fullName: string;
  patientId?: string | null;
  serviceId: string;
  therapistId: string;
  reasonForVisit?: string | null;
  actorId: string;
};

/**
 * Walk-in quick booking (spec §4.5). Links the confirmed patient or creates a
 * registered lead, then creates the appointment at arrived — all in one
 * transaction, so a crash never leaves a visit pointing at nobody.
 */
export async function walkInAppointment(input: WalkInInput): Promise<Appointment> {
  const digits = normalisePhone(input.phone);

  return prisma.$transaction(async (tx) => {
    let patientId = input.patientId ?? null;
    if (!patientId) {
      const created = await tx.patient.create({
        data: {
          patientCode: await nextPatientCode(tx),
          fullName: input.fullName.trim(),
          phone: digits,
          status: "registered",
        },
      });
      patientId = created.id;
    }

    const service = await tx.service.findFirst({
      where: { id: input.serviceId, deletedAt: null },
    });
    if (!service) throw new Error(`Service not found: ${input.serviceId}`);
    const now = new Date();
    const end = new Date(now.getTime() + service.defaultDurationMinutes * 60_000);

    const appointment = await tx.appointment.create({
      data: {
        patientId,
        therapistId: input.therapistId,
        serviceId: input.serviceId,
        scheduledStart: now,
        scheduledEnd: end,
        status: "arrived",
        bookedVia: "staff",
        reasonForVisit: input.reasonForVisit ?? null,
        wasForceBooked: false,
      },
    });
    await tx.appointmentStatusHistory.create({
      data: { appointmentId: appointment.id, status: "arrived", changedById: input.actorId },
    });
    return appointment;
  });
}

export async function forceBookAppointment(
  input: BookInput,
): Promise<{ appointment: Appointment; conflicts: Overlap[] }> {
  const service = await getService(input.serviceId);
  if (!service) throw new Error(`Service not found: ${input.serviceId}`);
  const end = new Date(input.start.getTime() + service.defaultDurationMinutes * 60_000);

  // Same query as bookAppointment, but the conflicts are returned as the
  // warning the UI names — not thrown. was_force_booked exempts the row from
  // the exclusion constraint, so the insert always succeeds.
  const conflicts = await findOverlaps(prisma, input.therapistId, input.start, end);

  const appointment = await prisma.$transaction(async (tx) => {
    const created = await tx.appointment.create({
      data: {
        patientId: input.patientId,
        therapistId: input.therapistId,
        serviceId: input.serviceId,
        scheduledStart: input.start,
        scheduledEnd: end,
        status: "scheduled",
        bookedVia: input.bookedVia,
        reasonForVisit: input.reasonForVisit ?? null,
        wasForceBooked: true,
      },
    });
    await tx.appointmentStatusHistory.create({
      data: { appointmentId: created.id, status: "scheduled", changedById: input.actorId },
    });
    return created;
  });

  return { appointment, conflicts };
}

export type TherapistSlot = BookableSlot & { therapistId: string; therapistName: string };

/**
 * The database-backed wrapper sub-projects 4 and 5 call. Loads duration,
 * therapists (one, or all active when none is chosen), rows plus opening
 * hours, and existing bookings — then delegates each therapist to the pure
 * getBookableSlots and merges, tagging every slot with its therapist.
 */
export async function getSlotsForDate(
  dateKey: string,
  serviceId: string,
  therapistId: string | null,
  now: Date = new Date(),
): Promise<TherapistSlot[]> {
  const [service, settings] = await Promise.all([getService(serviceId), getClinicSettings()]);
  if (!service) throw new Error(`Service not found: ${serviceId}`);

  const therapists = therapistId
    ? await prisma.user.findMany({
        where: { id: therapistId, role: "therapist", status: "active", deletedAt: null },
        select: { id: true, name: true },
      })
    : await listTherapists();

  const { from, to } = lagosDayRange(dateKey);

  const perTherapist = await Promise.all(
    therapists.map(async (t) => {
      const [rows, bookings] = await Promise.all([
        prisma.therapistAvailability.findMany({
          where: { therapistId: t.id },
          select: { dayOfWeek: true, specificDate: true, startTime: true, endTime: true, isBlocked: true },
        }),
        prisma.appointment.findMany({
          where: {
            ...notBlocking,
            therapistId: t.id,
            scheduledStart: { lt: to },
            scheduledEnd: { gt: from },
          },
          select: { scheduledStart: true, scheduledEnd: true },
        }),
      ]);
      const windows = resolveAvailability(dateKey, rows, settings.openingHours);
      const slots = getBookableSlots({
        dateKey,
        availabilityWindows: windows,
        existingAppointments: bookings.map((b) => ({ start: b.scheduledStart, end: b.scheduledEnd })),
        serviceDurationMinutes: service.defaultDurationMinutes,
        leadTimeHours: settings.bookingLeadTimeHours,
        now,
      });
      return slots.map((s) => ({ ...s, therapistId: t.id, therapistName: t.name }));
    }),
  );

  return perTherapist
    .flat()
    .sort((a, b) => a.start.getTime() - b.start.getTime() || (a.therapistId < b.therapistId ? -1 : 1));
}
