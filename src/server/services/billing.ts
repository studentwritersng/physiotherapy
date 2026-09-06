import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Invoice, InvoiceItem, Payment } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { SessionUser } from "@/server/auth/session";
import { ForbiddenError } from "@/server/auth/rbac";
import { canViewPatient } from "./patient";
import {
  invoiceSchema,
  manualPaymentSchema,
  type InvoiceInput,
  type ManualPaymentInput,
} from "@/lib/zod/billing";

function assertCanBill(actor: SessionUser): void {
  if (actor.role !== "admin" && actor.role !== "receptionist") {
    throw new ForbiddenError("Billing is restricted to admin and reception staff");
  }
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Parse "12345.67" to integer kobo. Input is schema-validated decimal-string. */
function toKobo(amount: string): number {
  const [naira, kobo = ""] = amount.split(".");
  return Number(naira) * 100 + Number((kobo + "00").slice(0, 2));
}

function fromKobo(kobo: number): string {
  return (kobo / 100).toFixed(2);
}

function itemAmountKobo(quantity: number, unitPrice: string): number {
  return quantity * toKobo(unitPrice);
}

async function nextInvoiceNumber(tx: {
  invoice: { count: () => Promise<number> };
}): Promise<string> {
  const count = await tx.invoice.count();
  return `INV-${String(count + 1).padStart(6, "0")}`;
}

export async function createInvoice(
  actor: SessionUser,
  input: InvoiceInput,
): Promise<Invoice> {
  assertCanBill(actor);
  const parsed = invoiceSchema.parse(input);
  if (!(await canViewPatient(actor, parsed.patientId))) throw new Error("Patient not found");
  return prisma.$transaction(async (tx) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const totalKobo = parsed.items.reduce(
          (sum, i) => sum + itemAmountKobo(i.quantity, i.unitPrice),
          0,
        );
        const created = await tx.invoice.create({
          data: {
            invoiceNumber: await nextInvoiceNumber(tx),
            patientId: parsed.patientId,
            appointmentId: parsed.appointmentId ?? null,
            totalAmount: fromKobo(totalKobo),
            notes: parsed.notes ?? null,
            createdById: actor.id,
            items: {
              create: parsed.items.map((i) => ({
                description: i.description,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                amount: fromKobo(itemAmountKobo(i.quantity, i.unitPrice)),
              })),
            },
          },
        });
        return created;
      } catch (e) {
        if (isUniqueViolation(e) && attempt < 4) continue; // invoice_number race: retry
        throw e;
      }
    }
    throw new Error("Could not number the invoice. Try again.");
  });
}

type PaymentReader = {
  payment: {
    findMany: (args: {
      where: { invoiceId: string };
      select?: { amount: true };
    }) => Promise<{ amount: unknown }[]>;
  };
};

async function paidKoboFor(reader: PaymentReader, invoiceId: string): Promise<number> {
  const payments = await reader.payment.findMany({
    where: { invoiceId },
    select: { amount: true },
  });
  return payments.reduce((sum, p) => sum + toKobo(String(p.amount)), 0);
}

export async function recordManualPayment(
  actor: SessionUser,
  input: ManualPaymentInput,
): Promise<Payment> {
  assertCanBill(actor);
  if ((input as { method?: unknown }).method === "online_gateway") {
    throw new Error("Online payments are recorded automatically, not manually");
  }
  const parsed = manualPaymentSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: parsed.invoiceId } });
    if (!invoice) throw new Error("Invoice not found");

    const totalKobo = toKobo(String(invoice.totalAmount));
    const paidKobo = await paidKoboFor(tx, parsed.invoiceId);
    const remainderKobo = totalKobo - paidKobo;
    const amountKobo = toKobo(parsed.amount);
    if (amountKobo > remainderKobo) {
      throw new Error("Payment exceeds the outstanding balance");
    }

    const payment = await tx.payment.create({
      data: {
        invoiceId: parsed.invoiceId,
        amount: fromKobo(amountKobo),
        method: parsed.method,
        reference: parsed.reference ?? null,
        notes: parsed.notes ?? null,
        recordedById: actor.id,
      },
    });

    const newPaidKobo = paidKobo + amountKobo;
    await tx.invoice.update({
      where: { id: parsed.invoiceId },
      data: {
        status: newPaidKobo >= totalKobo ? "paid" : newPaidKobo > 0 ? "partially_paid" : "unpaid",
      },
    });
    return payment;
  });
}

export async function getInvoiceWithBalance(invoiceId: string): Promise<{
  invoice: Invoice;
  paid: string;
  remainder: string;
}> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error("Invoice not found");
  const totalKobo = toKobo(String(invoice.totalAmount));
  const paidKobo = await paidKoboFor(prisma, invoiceId);
  return {
    invoice,
    paid: fromKobo(paidKobo),
    remainder: fromKobo(totalKobo - paidKobo),
  };
}

async function remainderKoboFor(
  invoice: { id: string; totalAmount: unknown },
  reader: PaymentReader,
): Promise<number> {
  const paidKobo = await paidKoboFor(reader, invoice.id);
  return toKobo(String(invoice.totalAmount)) - paidKobo;
}

export async function getPatientBalance(patientId: string): Promise<string> {
  const invoices = await prisma.invoice.findMany({
    where: { patientId, status: { in: ["unpaid", "partially_paid"] } },
    select: { id: true, totalAmount: true },
  });
  let outstanding = 0;
  for (const inv of invoices) {
    outstanding += await remainderKoboFor(inv, prisma);
  }
  return fromKobo(outstanding);
}

export async function getClinicOutstanding(): Promise<string> {
  const invoices = await prisma.invoice.findMany({
    where: { status: { in: ["unpaid", "partially_paid"] } },
    select: { id: true, totalAmount: true },
  });
  let outstanding = 0;
  for (const inv of invoices) {
    outstanding += await remainderKoboFor(inv, prisma);
  }
  return fromKobo(outstanding);
}

export async function getRevenueByMethod(
  from: Date,
  to: Date,
): Promise<{ method: string; total: string }[]> {
  const payments = await prisma.payment.findMany({
    where: { paidAt: { gte: from, lte: to } },
    select: { method: true, amount: true },
  });
  const byMethod = new Map<string, number>();
  for (const p of payments) {
    byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + toKobo(String(p.amount)));
  }
  return [...byMethod.entries()].map(([method, kobo]) => ({ method, total: fromKobo(kobo) }));
}

export type InvoiceWithBalance = {
  invoice: Invoice;
  items: InvoiceItem[];
  paid: string;
  remainder: string;
};

/**
 * Every invoice for one patient, newest first, with string balances attached.
 * Read-only companion to getInvoiceWithBalance for the hub billing section —
 * one query for invoices+items+payments, kobo math in memory, no N+1.
 */
export async function listInvoicesWithBalances(patientId: string): Promise<InvoiceWithBalance[]> {
  const invoices = await prisma.invoice.findMany({
    where: { patientId },
    include: { items: { orderBy: { id: "asc" } }, payments: { select: { amount: true } } },
    orderBy: { createdAt: "desc" },
  });
  return invoices.map((inv) => {
    const totalKobo = toKobo(String(inv.totalAmount));
    const paidKobo = inv.payments.reduce((sum, p) => sum + toKobo(String(p.amount)), 0);
    const { payments: _omit, ...invoice } = inv;
    return {
      invoice,
      items: inv.items,
      paid: fromKobo(paidKobo),
      remainder: fromKobo(totalKobo - paidKobo),
    };
  });
}

export type RecentPayment = Payment & {
  invoice: Pick<Invoice, "id" | "invoiceNumber" | "patientId"> & {
    patient: { fullName: string; patientCode: string };
  };
};

/** Latest payments across the clinic for the /staff/payments history card. */
export async function listRecentPayments(limit = 50): Promise<RecentPayment[]> {
  return prisma.payment.findMany({
    include: {
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          patientId: true,
          patient: { select: { fullName: true, patientCode: true } },
        },
      },
    },
    orderBy: { paidAt: "desc" },
    take: limit,
  });
}
