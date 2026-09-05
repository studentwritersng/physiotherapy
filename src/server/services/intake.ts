import "server-only";
import { prisma } from "@/server/db";
import { intakeSchema } from "@/lib/zod/intake";

/** Latest intake row for prefill; null when the patient never submitted. */
export async function getLatestIntake(patientId: string) {
  return prisma.intakeForm.findFirst({
    where: { patientId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Latest-row upsert plus the patient consent stamp in one transaction, so a
 * resubmission rewrites the newest row (never piles up versions) and the row
 * and the stamp are atomic — `hasSubmittedIntake` (the dashboard banner)
 * reads `submittedAt`, which is always set here.
 *
 * Input is `unknown` on purpose: the Zod parse inside is the validation
 * boundary, so a direct caller passing `consent: false` typechecks and fails
 * at runtime server-side instead of hiding behind a compile error. The action
 * safe-parses first for field-level errors, then this parse enforces it again.
 */
export async function submitIntake(patientId: string, input: unknown): Promise<void> {
  const parsed = intakeSchema.parse(input);
  // No `consent` column on intake_forms — the checkbox stamps the patient
  // record; strip it so Prisma never sees an unknown field.
  const { consent: _accepted, ...fields } = parsed;
  void _accepted;
  await prisma.$transaction(async (tx) => {
    const latest = await tx.intakeForm.findFirst({
      where: { patientId },
      orderBy: { createdAt: "desc" },
    });
    const data = { ...fields, submittedAt: new Date() };
    if (latest) await tx.intakeForm.update({ where: { id: latest.id }, data });
    else await tx.intakeForm.create({ data: { ...data, patientId } });
    await tx.patient.update({
      where: { id: patientId },
      data: { consentGiven: true, consentDate: new Date() },
    });
  });
}
