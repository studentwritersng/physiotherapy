import "server-only";
import { prisma } from "@/server/db";

/**
 * Full clinical record for the patient shell at /staff/patients/[id].
 *
 * No authorization here by design: every caller gates first with
 * getPatientForActor(actor, id) (null → notFound, so a forged id never leaks
 * another patient's rows) and wraps the clinical sections in
 * assertCanReadClinical(actor). Receptionists receive the profile + intake
 * only — callers filter these arrays to empty for them rather than hiding
 * the page.
 */
export async function getRecordTimeline(patientId: string) {
  const [assessments, notes, plans, documents, episodes] = await Promise.all([
    prisma.assessment.findMany({ where: { patientId }, orderBy: { createdAt: "desc" } }),
    prisma.sessionNote.findMany({ where: { patientId }, orderBy: { createdAt: "desc" } }),
    prisma.treatmentPlan.findMany({ where: { patientId }, orderBy: { createdAt: "desc" } }),
    prisma.patientDocument.findMany({ where: { patientId }, orderBy: { uploadedAt: "desc" } }),
    prisma.episodeOfCare.findMany({ where: { patientId }, orderBy: { startedAt: "desc" } }),
  ]);
  return { assessments, notes, plans, documents, episodes };
}
