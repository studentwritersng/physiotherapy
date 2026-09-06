import { z } from "zod";

/**
 * Money stays a trimmed decimal string all the way to Prisma, which accepts
 * a decimal string for a Decimal(12,2) column. Going through a JS number
 * would risk a float artefact on a money value (same pattern as the service
 * catalog price in zod/clinic.ts).
 */
const moneyString = z
  .string()
  .trim()
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Enter an amount like 15000 or 15000.00");

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, "Give the item a description").max(500),
  quantity: z.coerce.number().int().min(1).max(100),
  unitPrice: moneyString,
});

export type InvoiceItemInput = z.input<typeof invoiceItemSchema>;

export const invoiceSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(invoiceItemSchema).min(1, "Add at least one item"),
});

export type InvoiceInput = z.input<typeof invoiceSchema>;

const manualMethod = z.enum(["cash", "bank_transfer", "pos"]);

export const manualPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: moneyString.refine((v) => Number(v) > 0, "Amount must be greater than zero"),
  method: manualMethod,
  reference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type ManualPaymentInput = z.input<typeof manualPaymentSchema>;
