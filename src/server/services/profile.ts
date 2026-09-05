import "server-only";
import { prisma } from "@/server/db";
import { normalisePhone } from "@/server/auth/login";
import { profileSchema } from "@/lib/zod/profile";

/** The patient's own row for the profile page; null when missing/deleted. */
export async function getProfile(patientId: string) {
  return prisma.patient.findFirst({ where: { id: patientId, deletedAt: null } });
}

/**
 * Updates exactly the PRD-04 §4 fields plus email (spec §5). The data object
 * is built field by field — input is never spread onto the row, so
 * patientCode, status and the staff-verified userId link are untouchable.
 *
 * Input is `unknown` on purpose: the Zod parse inside is the validation
 * boundary, so a blank email fails at runtime server-side. Phone (and the
 * optional emergency phone) go through the shared normaliser from login.ts —
 * the same E.164 format registration stores — never a hand-rolled variant.
 *
 * A phone change keeps the link: userId is not touched, and the `updatedAt`
 * bump from the write itself signals staff to re-confirm identity at the
 * next visit (spec §5) — no new column, no silent unlink.
 */
export async function updateProfile(patientId: string, input: unknown): Promise<void> {
  const parsed = profileSchema.parse(input);
  await prisma.patient.update({
    where: { id: patientId },
    data: {
      fullName: parsed.fullName.trim(),
      phone: normalisePhone(parsed.phone),
      email: parsed.email.trim().toLowerCase(),
      dateOfBirth: parsed.dateOfBirth ? new Date(`${parsed.dateOfBirth}T00:00:00Z`) : null,
      address: parsed.address,
      emergencyContactName: parsed.emergencyContactName,
      emergencyContactPhone: parsed.emergencyContactPhone
        ? normalisePhone(parsed.emergencyContactPhone)
        : null,
      basicMedicalInfo: parsed.basicMedicalInfo,
    },
  });
}
