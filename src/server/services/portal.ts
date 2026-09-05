import "server-only";
import { prisma } from "@/server/db";

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
