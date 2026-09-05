import "server-only";
import { prisma } from "@/server/db";
import {
  bookAppointment,
  cancelAppointment,
  getSlotsForDate,
  rescheduleAppointment,
} from "./booking";
import { lagosWallToUtc } from "@/lib/slots";

export async function requireLinkedPatientId(userId: string): Promise<string | null> {
  const patient = await prisma.patient.findFirst({
    where: { userId, deletedAt: null },
    select: { id: true },
  });
  return patient?.id ?? null;
}

export type PortalAppointment = {
  id: string;
  start: Date;
  end: Date;
  status: string;
  serviceName: string;
  therapistName: string | null;
  therapistId: string | null;
  serviceId: string;
  reason: string | null;
};

/** Single batched read for the dashboard. Empty states are the caller's job. */
export async function getPortalDashboard(patientId: string, now: Date = new Date()) {
  const [upcoming, recent, planRow, openInvoices] = await Promise.all([
    prisma.appointment.findMany({
      where: { patientId, scheduledStart: { gte: now }, status: "scheduled", deletedAt: null },
      include: {
        service: { select: { id: true, name: true } },
        therapist: { select: { id: true, name: true } },
      },
      orderBy: { scheduledStart: "asc" },
    }),
    prisma.appointment.findMany({
      where: { patientId, scheduledStart: { lt: now }, deletedAt: null },
      include: {
        service: { select: { id: true, name: true } },
        therapist: { select: { id: true, name: true } },
      },
      orderBy: { scheduledStart: "desc" },
      take: 3,
    }),
    // Sub-project 6 owns plans; read the flag-gated row so the card lights up alone.
    // NOTE: treatment_plans has no `summary`/`deletedAt` columns — `goals ??
    // planDetails` is exposed as `summary` so this function's shape matches the brief.
    prisma.treatmentPlan.findFirst({
      where: { patientId, patientVisible: true },
      select: { id: true, goals: true, planDetails: true },
      orderBy: { createdAt: "desc" },
    }),
    // Sub-project 7 owns billing; sum the remainder on open invoices so the card
    // lights up alone. NOTE: invoices has no `balanceDue`/`deletedAt` columns —
    // the remainder is totalAmount minus recorded payments.
    prisma.invoice.findMany({
      where: { patientId, status: { in: ["unpaid", "partially_paid"] } },
      select: { totalAmount: true, payments: { select: { amount: true } } },
    }),
  ]);
  const treatmentPlan = planRow
    ? { id: planRow.id, summary: planRow.goals ?? planRow.planDetails ?? null }
    : null;
  const balanceDue = openInvoices.reduce(
    (sum, inv) =>
      sum +
      Number(inv.totalAmount) -
      inv.payments.reduce((paid, p) => paid + Number(p.amount), 0),
    0,
  );
  return { upcoming, recent, treatmentPlan, balanceDue };
}

export async function hasSubmittedIntake(patientId: string): Promise<boolean> {
  const row = await prisma.intakeForm.findFirst({
    where: { patientId, submittedAt: { not: null } },
    select: { id: true },
  });
  return row !== null;
}

// ─────────────────── Portal appointment mutations ───────────────────
// Every mutation checks ownership FIRST, before touching the booking engine:
// a forged id belonging to another patient reads as "not found", never чужой
// data, and never reaches the engine call.

async function ownedAppointment(patientId: string, appointmentId: string) {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, patientId, deletedAt: null },
  });
  if (!appt) throw new Error("Appointment not found");
  return appt;
}

export async function portalCancelAppointment(
  patientId: string,
  appointmentId: string,
  reason: string,
  actorId: string,
) {
  await ownedAppointment(patientId, appointmentId);
  return cancelAppointment(appointmentId, reason, actorId);
}

export async function portalRescheduleAppointment(
  patientId: string,
  appointmentId: string,
  start: Date,
  actorId: string,
) {
  const appt = await ownedAppointment(patientId, appointmentId);
  if (!appt.therapistId)
    throw new Error("This booking has no fixed therapist — contact the clinic to move it.");
  return rescheduleAppointment(appointmentId, start, actorId);
}

export async function portalBookAppointment(args: {
  patientId: string;
  serviceId: string;
  therapistId: string | null;
  start: Date;
  reason?: string;
  actorId: string;
}) {
  // BookInput needs a pinned therapist; a null choice resolves to the first
  // free therapist for that slot (the staff/public no-preference pattern), so
  // the insert always pins one. NOTE: BookInput.therapistId is `string`, not
  // `string | null` — the null is resolved here, never passed through.
  let therapistId = args.therapistId;
  if (!therapistId) {
    // getSlotsForDate throws when the service id is unknown.
    const dateKey = toDateKey(args.start);
    const hhmm = toHHMM(args.start);
    const slots = await getSlotsForDate(dateKey, args.serviceId, null);
    const match = slots.find((s) => s.start.getTime() === lagosWallToUtc(dateKey, hhmm).getTime());
    if (!match) throw new Error("No therapist is free at that time — pick another slot.");
    therapistId = match.therapistId;
  }
  return bookAppointment({
    patientId: args.patientId,
    serviceId: args.serviceId,
    therapistId,
    start: args.start,
    bookedVia: "portal",
    reasonForVisit: args.reason ?? null,
    actorId: args.actorId,
  });
}

/** UTC instant → Lagos calendar day (WAT is UTC+1 year-round, no DST). */
function toDateKey(start: Date): string {
  const lagos = new Date(start.getTime() + 60 * 60_000);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${lagos.getUTCFullYear()}-${pad(lagos.getUTCMonth() + 1)}-${pad(lagos.getUTCDate())}`;
}

/** UTC instant → Lagos HH:MM (pairs with lagosWallToUtc in @/lib/slots). */
function toHHMM(start: Date): string {
  const lagos = new Date(start.getTime() + 60 * 60_000);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(lagos.getUTCHours())}:${pad(lagos.getUTCMinutes())}`;
}
