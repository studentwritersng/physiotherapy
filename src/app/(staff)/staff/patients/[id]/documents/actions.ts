"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ForbiddenError, requireRole } from "@/server/auth/rbac";
import { documentSchema, documentTypeEnum } from "@/lib/zod/clinical";
import {
  createPatientDocument,
  getPatientDocument,
} from "@/server/services/clinical";
import { canViewPatient } from "@/server/services/patient";
import { presignedGetUrl, presignedPutUrl } from "@/server/storage/r2";
import { actionFailed, actionOk, toFieldErrors, type ActionState } from "@/server/action-state";

function recordPath(patientId: string): string {
  return `/staff/patients/${patientId}`;
}

/**
 * Success carries the presigned PUT plus the key the row writer stores as
 * fileUrl. The plain ActionState members keep FormStatus rendering unchanged —
 * the upload component narrows on "url" for the happy path.
 */
export type RequestUploadState =
  | ActionState
  | { ok: true; message: string; url: string; key: string };

/**
 * Step 1 of the direct-to-R2 upload: the browser sends metadata only (never
 * the bytes — posting the file here would route it through the server and
 * defeat the presigned PUT), and gets back a URL to PUT to. Type and size are
 * validated inside presignedPutUrl before anything is signed.
 */
export async function requestDocumentUpload(
  _prev: ActionState,
  formData: FormData,
): Promise<RequestUploadState> {
  const actor = await requireRole("admin", "therapist");

  const patientId = String(formData.get("patientId") ?? "");
  const fileName = String(formData.get("fileName") ?? "");
  const contentType = String(formData.get("contentType") ?? "");
  const sizeBytes = Number(formData.get("sizeBytes") ?? 0);
  const documentType = String(formData.get("documentType") ?? "");
  if (!patientId) return actionFailed("Missing patient. Reload and try again.");
  if (!(await canViewPatient(actor, patientId))) {
    return actionFailed("You do not have access to this patient.");
  }
  if (!fileName.trim()) return actionFailed("Choose a file to upload.");
  if (!documentTypeEnum.safeParse(documentType).success) {
    return actionFailed("Unknown document type. Reload and try again.");
  }

  try {
    const { url, key } = await presignedPutUrl({
      patientId,
      fileName: fileName.trim(),
      contentType,
      sizeBytes,
    });
    return { ok: true, message: "Upload approved", url, key };
  } catch (error) {
    if (error instanceof Error && /not configured/i.test(error.message)) {
      return actionFailed("Document storage is not configured");
    }
    if (error instanceof Error) return actionFailed(error.message);
    return actionFailed("Could not start the upload. Try again.");
  }
}

/**
 * Step 2: records the PatientDocument row after the browser's PUT lands.
 * Mime, size and enum are re-validated in the service — the presign-time check
 * proves nothing about the bytes that actually arrived.
 */
export async function saveDocument(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("admin", "therapist");

  const raw = Object.fromEntries(formData);
  const patientId = typeof raw.patientId === "string" ? raw.patientId : "";

  try {
    const parsed = documentSchema.safeParse(raw);
    if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

    await createPatientDocument(actor, patientId, parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return actionFailed("You do not have access to this patient.");
    }
    if (error instanceof Error && /Episode not found/.test(error.message)) {
      return actionFailed("That episode no longer exists. Reload and try again.");
    }
    return actionFailed("Could not save the document. Try again.");
  }

  revalidatePath(recordPath(patientId));
  return actionOk("Document uploaded");
}

/**
 * Download as a plain form action ending in a presigned-GET redirect: the
 * browser leaves the record for the signed R2 URL, and the key never renders
 * into the page. Scoped through the posted patientId, so a forged document id
 * reads as "not found".
 */
export async function downloadDocument(formData: FormData): Promise<never> {
  const actor = await requireRole("admin", "therapist");

  const documentId = String(formData.get("documentId") ?? "");
  const patientId = String(formData.get("patientId") ?? "");
  if (!documentId || !patientId) throw new Error("Missing document. Reload and try again.");

  const doc = await getPatientDocument(actor, patientId, documentId);
  redirect(await presignedGetUrl(doc.fileUrl));
}
