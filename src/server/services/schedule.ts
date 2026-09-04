import "server-only";
import type { Appointment } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { lagosDayRange } from "@/lib/slots";

const notDeleted = { deletedAt: null } as const;

export type ScheduleEntry = Appointment & {
  patient: { id: string; fullName: string; phone: string; patientCode: string };
  service: { id: string; name: string; defaultDurationMinutes: number };
  therapist: { id: string; name: string } | null;
};

const include = {
  patient: { select: { id: true, fullName: true, phone: true, patientCode: true } },
  service: { select: { id: true, name: true, defaultDurationMinutes: true } },
  therapist: { select: { id: true, name: true } },
} as const;

export async function getDaySchedule(
  dateKey: string,
  therapistId?: string | null,
): Promise<ScheduleEntry[]> {
  const { from, to } = lagosDayRange(dateKey);
  return prisma.appointment.findMany({
    where: {
      ...notDeleted,
      // Day membership is by start time: an appointment belongs to the Lagos
      // day its start falls in. Cancelled and no-show rows are INCLUDED — a day
      // view that hides them lies about what happened.
      scheduledStart: { gte: from, lt: to },
      ...(therapistId ? { therapistId } : {}),
    },
    include,
    orderBy: { scheduledStart: "asc" },
  });
}

function addDays(dateKey: string, n: number): string {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, mo! - 1, d! + n));
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export async function getWeekSchedule(
  weekStartKey: string,
  therapistId?: string | null,
): Promise<{ dateKey: string; entries: ScheduleEntry[] }[]> {
  const keys = Array.from({ length: 7 }, (_, i) => addDays(weekStartKey, i));
  const days = await Promise.all(keys.map((dateKey) => getDaySchedule(dateKey, therapistId)));
  return keys.map((dateKey, i) => ({ dateKey, entries: days[i]! }));
}
