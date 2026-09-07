import "server-only";
import { prisma } from "@/server/db";
import type { SessionUser } from "@/server/auth/session";
import { getClinicSettings } from "./clinic-settings";
import { getDaySchedule } from "./schedule";
import { getClinicOutstanding, getRevenueByMethod } from "./billing";
import { lagosDayRange, todayKey } from "@/lib/slots";

const notDeleted = { deletedAt: null } as const;

/**
 * Staff home numbers (sub-project 7 follow-up; depth arrives with sub-project
 * 9). Counts are aggregates — safe for every staff role. The only
 * identity-bearing payload is today's visit list, scoped to the therapist's
 * own day for therapists, clinic-wide otherwise.
 */
export async function getStaffOverview(actor: SessionUser, now: Date = new Date()) {
  const day = todayKey(now);
  const { from, to } = lagosDayRange(day);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const mine = actor.role === "therapist" ? { therapistId: actor.id } : {};

  const [
    settings,
    totalPatients,
    newPatients,
    todayAll,
    upcoming,
    unpaidInvoices,
    outstanding,
    revenueRows,
    activePlans,
    activePlansMine,
    recentInvoices,
  ] = await Promise.all([
    getClinicSettings(),
    prisma.patient.count({ where: { ...notDeleted, status: { not: "lead" } } }),
    prisma.patient.count({ where: { ...notDeleted, status: { not: "lead" }, createdAt: { gte: weekAgo } } }),
    getDaySchedule(day, actor.role === "therapist" ? actor.id : null),
    prisma.appointment.count({
      where: { ...notDeleted, ...mine, status: "scheduled", scheduledStart: { gte: now, lt: new Date(now.getTime() + 7 * 86_400_000) } },
    }),
    prisma.invoice.count({ where: { status: { in: ["unpaid", "partially_paid"] } } }),
    getClinicOutstanding(),
    getRevenueByMethod(from, to),
    prisma.treatmentPlan.count({ where: { status: "active" } }),
    actor.role === "therapist"
      ? prisma.treatmentPlan.count({ where: { status: "active", therapistId: actor.id } })
      : null,
    prisma.invoice.findMany({
      include: { patient: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const inDay = (status: string) => todayAll.filter((a) => a.status === status).length;
  const revenueTotal = revenueRows.reduce((sum, r) => sum + Number(r.total), 0);
  const showRevenue = actor.role !== "receptionist" || settings.receptionistSeesRevenue;

  return {
    totalPatients,
    newPatients,
    appointmentsToday: todayAll.length,
    upcoming,
    waitingToday: inDay("arrived"),
    inSessionNow: inDay("in_session"),
    completedToday: inDay("completed"),
    unpaidInvoices,
    outstanding,
    revenueToday: showRevenue ? revenueTotal.toFixed(2) : null,
    activePlans: activePlansMine ?? activePlans,
    today: todayAll.slice(0, 8),
    recentInvoices,
  };
}
