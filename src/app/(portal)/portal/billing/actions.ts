"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/server/auth/rbac";
import { prepareOnlinePayment, requireLinkedPatientId } from "@/server/services/portal";

/**
 * Portal Pay Now: patient-owned invoice with a positive remainder → Paystack
 * checkout. Every failure inside the try fails closed with a thrown error
 * (forged invoice ids read as "not found", never another patient's data);
 * `redirect()` runs OUTSIDE try/catch because it throws NEXT_REDIRECT, which
 * must never be swallowed by an error handler.
 */
export async function startOnlinePayment(formData: FormData): Promise<never> {
  const user = await requireRole("patient");
  const patientId = await requireLinkedPatientId(user.id);
  if (!patientId) throw new Error("Your account is not linked yet.");
  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  if (!invoiceId) throw new Error("Invoice not found");

  let authorizationUrl: string;
  try {
    ({ authorizationUrl } = await prepareOnlinePayment({ patientId, invoiceId }));
  } catch (error) {
    if (error instanceof Error) throw new Error(error.message);
    throw new Error("Could not start the online payment. Try again.");
  }
  redirect(authorizationUrl);
}
