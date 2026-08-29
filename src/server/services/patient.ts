import "server-only";
import type { Patient } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { ForbiddenError } from "@/server/auth/rbac";
import type { SessionUser } from "@/server/auth/session";

/**
 * Soft-delete filter (spec §4.4). Prisma has no global filter, so this lives
 * here and every read in this module composes it. Never inline `deletedAt` in a
 * route handler.
 */
const notDeleted = { deletedAt: null } as const;

async function therapistCanViewAll(therapistId: string): Promise<boolean> {
  const profile = await prisma.staffProfile.findUnique({
    where: { userId: therapistId },
    select: { canViewAllPatients: true },
  });
  return profile?.canViewAllPatients ?? false;
}

/**
 * PRD-01 FR3: a therapist reaches only patients they share an appointment with,
 * unless admin granted canViewAllPatients (spec §3.6).
 */
export async function canViewPatient(actor: SessionUser, patientId: string): Promise<boolean> {
  switch (actor.role) {
    case "admin":
    case "receptionist":
      return true;

    case "therapist": {
      if (await therapistCanViewAll(actor.id)) return true;
      const shared = await prisma.appointment.count({
        where: { patientId, therapistId: actor.id, deletedAt: null },
      });
      return shared > 0;
    }

    case "patient": {
      const own = await prisma.patient.findFirst({
        where: { id: patientId, userId: actor.id, ...notDeleted },
        select: { id: true },
      });
      return own !== null;
    }
  }
}

export async function getPatientForActor(
  actor: SessionUser,
  patientId: string,
): Promise<Patient | null> {
  if (!(await canViewPatient(actor, patientId))) return null;
  return prisma.patient.findFirst({ where: { id: patientId, ...notDeleted } });
}

export async function listPatientsForActor(
  actor: SessionUser,
  opts: { search?: string; skip?: number; take?: number } = {},
): Promise<Patient[]> {
  const { search, skip = 0, take = 25 } = opts;

  const searchFilter = search
    ? {
        OR: [
          { fullName: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search } },
          { patientCode: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const scope =
    actor.role === "patient"
      ? { userId: actor.id }
      : actor.role === "therapist"
        ? (await therapistCanViewAll(actor.id))
          ? {}
          : { appointments: { some: { therapistId: actor.id, deletedAt: null } } }
        : {};

  return prisma.patient.findMany({
    where: { ...notDeleted, ...scope, ...searchFilter },
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });
}

/**
 * PRD-01 and PRD-06 both make the receptionist block on clinical notes explicit,
 * not an omission. Patients never read raw clinical records either; they see
 * only patient-visible treatment plans (spec §3.3).
 */
export function assertCanReadClinical(actor: SessionUser): void {
  if (actor.role !== "therapist" && actor.role !== "admin") {
    throw new ForbiddenError("Clinical records are restricted to therapists and admins");
  }
}
