import "server-only";
import { prisma } from "@/server/db";
import { env } from "@/lib/env";
import { initializePayment, nairaToKobo } from "@/server/payments/paystack";
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

/** Single batched read for the dashboard. Empty states are the caller's job. */
export async function getPortalDashboard(patientId: string, now: Date = new Date()) {
  const [upcoming, recent, settings, planRow, openInvoices] = await Promise.all([
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
    prisma.clinicSettings.findUnique({ where: { id: 1 }, select: { showClinicalToPatients: true } }),
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
  // Portal exposure needs BOTH the clinic master switch AND the plan flag
  // (spec §3.3): either off hides the whole card, exercises included.
  const exposed = (settings?.showClinicalToPatients ?? false) ? planRow : null;
  const exercises = exposed
    ? await prisma.exercise.findMany({
        where: { treatmentPlanId: exposed.id, patientVisible: true },
        select: { name: true, description: true },
        orderBy: { sortOrder: "asc" },
      })
    : [];
  const treatmentPlan = exposed
    ? { id: exposed.id, summary: exposed.goals ?? exposed.planDetails ?? null, exercises }
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

// ─────────────────── Portal billing (sub-project 7, task 4) ───────────────────
// Money stays DECIMAL-STRINGS: kobo math below is integer-only (string-split,
// mirroring billing.ts), and every exposed figure renders directly, never via
// Number() for display or arithmetic.

/** Parse "12345.67" to integer kobo. Inputs are Decimal-normalized strings. */
function billingToKobo(amount: string): number {
  const [naira, kobo = ""] = amount.split(".");
  return Number(naira) * 100 + Number((kobo + "00").slice(0, 2));
}

function billingFromKobo(kobo: number): string {
  return `${Math.trunc(kobo / 100)}.${String(Math.abs(kobo % 100)).padStart(2, "0")}`;
}

export type PortalBillingInvoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: string;
  paid: string;
  remainder: string;
  items: { id: string; description: string; quantity: number; unitPrice: string; amount: string }[];
};

export type PortalBillingPayment = {
  id: string;
  amount: string;
  method: string;
  reference: string | null;
  paidAt: Date;
  invoiceNumber: string;
};

export type PortalBilling = {
  invoices: PortalBillingInvoice[];
  payments: PortalBillingPayment[];
  balanceDue: string;
};

/**
 * Everything the portal balance card needs, scoped to ONE linked patient.
 * Open invoices (unpaid/partially_paid) with items + paid/remainder strings;
 * payment history across all of the patient's invoices, newest first. A forged
 * patient id simply matches nothing — reads as empty, never another
 * patient's data.
 */
export async function getPortalBilling(patientId: string): Promise<PortalBilling> {
  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({
      where: { patientId, status: { in: ["unpaid", "partially_paid"] } },
      include: {
        items: { orderBy: { id: "asc" } },
        payments: { select: { amount: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.payment.findMany({
      where: { invoice: { patientId } },
      include: { invoice: { select: { invoiceNumber: true } } },
      orderBy: { paidAt: "desc" },
    }),
  ]);

  let balanceKobo = 0;
  const open = invoices.map((inv) => {
    const totalKobo = billingToKobo(String(inv.totalAmount));
    const paidKobo = inv.payments.reduce((sum, p) => sum + billingToKobo(String(p.amount)), 0);
    const remainderKobo = totalKobo - paidKobo;
    balanceKobo += remainderKobo;
    const { payments: _omit, ...invoice } = inv;
    return {
      ...invoice,
      status: inv.status,
      totalAmount: billingFromKobo(totalKobo),
      paid: billingFromKobo(paidKobo),
      remainder: billingFromKobo(remainderKobo),
      items: inv.items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: billingFromKobo(billingToKobo(String(item.unitPrice))),
        amount: billingFromKobo(billingToKobo(String(item.amount))),
      })),
    };
  });

  return {
    invoices: open,
    payments: payments.map((p) => ({
      id: p.id,
      amount: billingFromKobo(billingToKobo(String(p.amount))),
      method: p.method,
      reference: p.reference,
      paidAt: p.paidAt,
      invoiceNumber: p.invoice.invoiceNumber,
    })),
    balanceDue: billingFromKobo(balanceKobo),
  };
};

/**
 * Testable core of the portal Pay Now action. Every check fails closed BEFORE
 * the gateway is touched: unknown patient or null portal email, an invoice id
 * that is not this patient's open invoice (forged ids read as "not found"),
 * or a zero remainder. Returns the Paystack checkout URL; the action redirects
 * to it OUTSIDE try/catch (redirect throws, and must never be swallowed).
 */
export async function prepareOnlinePayment(args: {
  patientId: string;
  invoiceId: string;
}): Promise<{ authorizationUrl: string; reference: string }> {
  const patient = await prisma.patient.findUnique({
    where: { id: args.patientId },
    select: { email: true },
  });
  const email = patient?.email ?? null;
  if (!email) throw new Error("We do not have an email address for this account — update your profile first.");

  const invoice = await prisma.invoice.findFirst({
    where: { id: args.invoiceId, patientId: args.patientId },
    select: { id: true, totalAmount: true, payments: { select: { amount: true } } },
  });
  if (!invoice) throw new Error("Invoice not found");

  const totalKobo = billingToKobo(String(invoice.totalAmount));
  const paidKobo = invoice.payments.reduce((sum, p) => sum + billingToKobo(String(p.amount)), 0);
  const remainderKobo = totalKobo - paidKobo;
  if (remainderKobo <= 0) throw new Error("This invoice is already paid in full.");

  return initializePayment({
    email,
    amountKobo: nairaToKobo(billingFromKobo(remainderKobo)),
    invoiceId: invoice.id,
    callbackUrl: `${env.APP_URL}/portal/billing/success`,
  });
}

// ─────────────────── Portal appointment mutations ───────────────────
// Every mutation checks ownership FIRST, before touching the booking engine:
// a forged id belonging to another patient reads as "not found", never another patient's data.
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
  const appointment = await bookAppointment({
    patientId: args.patientId,
    serviceId: args.serviceId,
    therapistId,
    start: args.start,
    bookedVia: "portal",
    reasonForVisit: args.reason ?? null,
    actorId: args.actorId,
  });
  const therapist = await prisma.user.findUnique({ where: { id: therapistId }, select: { name: true } });
  return { appointment, therapistName: therapist?.name ?? null };
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
