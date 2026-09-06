"use server";

import { revalidatePath } from "next/cache";
import { ForbiddenError, requireRole } from "@/server/auth/rbac";
import { invoiceSchema, manualPaymentSchema } from "@/lib/zod/billing";
import { createInvoice, recordManualPayment } from "@/server/services/billing";
import { actionFailed, actionOk, toFieldErrors, type ActionState } from "@/server/action-state";

function recordPath(patientId: string): string {
  return `/staff/patients/${patientId}`;
}

function revalidateRecordAndPayments(patientId: string): void {
  revalidatePath(recordPath(patientId));
  revalidatePath("/staff/payments");
}

/**
 * Creates an invoice for the hub patient (patient preselected via hidden
 * field). Item rows arrive as repeated `descriptions` / `quantities` /
 * `unitPrices` fields posted by one client-side form; they are zipped back
 * into the items array the invoiceSchema validates.
 */
export async function createPatientInvoice(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("admin", "receptionist");

  const raw = Object.fromEntries(formData);
  const patientId = typeof raw.patientId === "string" ? raw.patientId : "";
  if (!patientId) return actionFailed("Missing patient. Reload and try again.");

  const descriptions = formData.getAll("descriptions");
  const quantities = formData.getAll("quantities");
  const unitPrices = formData.getAll("unitPrices");
  const items = descriptions.map((_, i) => ({
    description: String(descriptions[i] ?? ""),
    quantity: String(quantities[i] ?? ""),
    unitPrice: String(unitPrices[i] ?? ""),
  }));
  const notes = typeof raw.notes === "string" && raw.notes.trim() ? raw.notes : undefined;

  try {
    const parsed = invoiceSchema.safeParse({ patientId, notes, items });
    if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

    await createInvoice(actor, parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return actionFailed("You do not have access to this patient.");
    }
    if (error instanceof Error && /Patient not found/.test(error.message)) {
      return actionFailed("That patient no longer exists. Reload and try again.");
    }
    return actionFailed("Could not create the invoice. Try again.");
  }

  revalidateRecordAndPayments(patientId);
  return actionOk("Invoice created");
}

/**
 * Per-invoice inline payment under #billing. The amount arrives prefilled with
 * the remainder; the service rejects anything above it, and that message is
 * safe to surface because it names no internals.
 */
export async function recordPatientPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("admin", "receptionist");

  const raw = Object.fromEntries(formData);
  const patientId = typeof raw.patientId === "string" ? raw.patientId : "";
  if (!patientId) return actionFailed("Missing patient. Reload and try again.");

  try {
    const parsed = manualPaymentSchema.safeParse(raw);
    if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

    await recordManualPayment(actor, parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return actionFailed("You do not have access to this patient.");
    }
    if (error instanceof Error && /exceeds the outstanding/.test(error.message)) {
      return actionFailed("That amount is more than the invoice still owes.");
    }
    if (error instanceof Error && /Invoice not found/.test(error.message)) {
      return actionFailed("That invoice no longer exists. Reload and try again.");
    }
    if (error instanceof Error && /recorded automatically/.test(error.message)) {
      return actionFailed("Online payments are recorded automatically, not here.");
    }
    return actionFailed("Could not record the payment. Try again.");
  }

  revalidateRecordAndPayments(patientId);
  return actionOk("Payment recorded");
}
