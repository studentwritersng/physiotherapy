import "server-only";
import { prisma } from "@/server/db";

/** Portal logins with no linked patient row, plus same-phone candidates. */
export async function listUnlinkedPortalUsers() {
  const users = await prisma.user.findMany({
    where: { role: "patient", deletedAt: null, patient: null },
    select: { id: true, name: true, phone: true, email: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return Promise.all(
    users.map(async (u) => ({
      ...u,
      candidates: await prisma.patient.findMany({
        where: { phone: u.phone, userId: null, deletedAt: null },
        select: { id: true, fullName: true, status: true },
        orderBy: { createdAt: "asc" },
      }),
    })),
  );
}

/** Staff-only caller verifies. Links one login to one record, once. */
export async function approvePortalLink(userId: string, patientId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const patient = await tx.patient.findFirst({
      where: { id: patientId, userId: null, deletedAt: null },
    });
    if (!patient) throw new Error("Patient record is already linked or missing");
    const user = await tx.user.findFirst({
      where: { id: userId, role: "patient", deletedAt: null, patient: null },
    });
    if (!user) throw new Error("Login is already linked or missing");
    await tx.patient.update({
      where: { id: patientId },
      data: { userId, status: "registered" },
    });
  });
}
