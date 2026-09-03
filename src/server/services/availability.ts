import "server-only";
import type { TherapistAvailability } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { getClinicSettings } from "@/server/services/clinic-settings";
import { DAY_KEYS, type AvailabilityInput, type OpeningHours } from "@/lib/zod/clinic";
import { intersectWindows, mergeWindows, subtractWindows, type TimeWindow } from "@/lib/time";

/** Only the fields the resolver reads, so callers can pass a partial select. */
export type AvailabilityRow = Pick<
  TherapistAvailability,
  "dayOfWeek" | "specificDate" | "startTime" | "endTime" | "isBlocked"
>;

/**
 * `specific_date` is a Postgres DATE, which Prisma hands back as a Date at UTC
 * midnight. Reading it with getUTC* avoids the local-timezone shift that would
 * make `toISOString().slice(0, 10)` wrong for anyone west of UTC.
 */
function toDateKey(value: Date): string {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 0 = Sunday, matching Postgres EXTRACT(DOW) and JavaScript getUTCDay(). */
function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

function dayKeyOf(dateKey: string): (typeof DAY_KEYS)[number] {
  const weekday = weekdayOf(dateKey);
  // DAY_KEYS is Monday-first; getUTCDay is Sunday-first.
  const index = weekday === 0 ? 6 : weekday - 1;
  return DAY_KEYS[index]!;
}

function toWindow(row: AvailabilityRow): TimeWindow {
  return { start: row.startTime, end: row.endTime };
}

/**
 * A therapist's bookable windows on one date, in Africa/Lagos wall-clock.
 *
 * Pure: no database handle, no clock. This is the contract sub-project 3's
 * booking engine consumes, so it must be exhaustively testable (spec §4.1).
 *
 * Precedence, per spec §3.2: if ANY dated row matches the date, the recurring
 * rows are discarded entirely for that date. Within the winning set, blocked
 * windows subtract from open ones. The result is intersected with clinic
 * opening hours last, so a therapist can never be available while the clinic is
 * shut.
 *
 * @param dateKey YYYY-MM-DD
 */
export function resolveAvailability(
  dateKey: string,
  rows: AvailabilityRow[],
  openingHours: OpeningHours,
): TimeWindow[] {
  const clinicDay = openingHours[dayKeyOf(dateKey)];
  if (clinicDay === null) return [];

  const dated = rows.filter((r) => r.specificDate !== null && toDateKey(r.specificDate) === dateKey);

  const weekday = weekdayOf(dateKey);
  const recurring = rows.filter((r) => r.specificDate === null && r.dayOfWeek === weekday);

  const winning = dated.length > 0 ? dated : recurring;

  const open = winning.filter((r) => !r.isBlocked).map(toWindow);
  const blocked = winning.filter((r) => r.isBlocked).map(toWindow);

  const afterBlocks = subtractWindows(open, blocked);

  return mergeWindows(
    intersectWindows(afterBlocks, [{ start: clinicDay.open, end: clinicDay.close }]),
  );
}

// ─────────────────── Database-backed operations ───────────────────
// Everything above this line is pure. Everything below touches the database.

export type TherapistOption = { id: string; name: string };

/** Only therapists who can actually be scheduled: active and not soft-deleted. */
export async function listTherapists(): Promise<TherapistOption[]> {
  return prisma.user.findMany({
    where: { role: "therapist", status: "active", deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listAvailability(therapistId: string): Promise<TherapistAvailability[]> {
  return prisma.therapistAvailability.findMany({
    where: { therapistId },
    orderBy: [
      { specificDate: "asc" },
      { dayOfWeek: "asc" },
      { startTime: "asc" },
    ],
  });
}

export async function createAvailability(input: AvailabilityInput): Promise<void> {
  await prisma.therapistAvailability.create({
    data: {
      therapistId: input.therapistId,
      dayOfWeek: input.dayOfWeek,
      // A DATE column: parse at UTC midnight so no local-timezone shift moves
      // the date by a day.
      specificDate: input.specificDate ? new Date(`${input.specificDate}T00:00:00.000Z`) : null,
      startTime: input.startTime,
      endTime: input.endTime,
      isBlocked: input.isBlocked,
      reason: input.reason,
    },
  });
}

export async function deleteAvailability(id: string): Promise<void> {
  // Availability carries no historical significance — a removed window is not a
  // record of anything — so a hard delete is correct (cf. PRD-06 FR2).
  await prisma.therapistAvailability.delete({ where: { id } });
}

/**
 * The database-backed wrapper sub-project 3's booking engine calls. It loads the
 * rows and the clinic's opening hours, then delegates to the pure resolver.
 */
export async function getAvailabilityForDate(
  therapistId: string,
  dateKey: string,
): Promise<TimeWindow[]> {
  const [rows, settings] = await Promise.all([
    listAvailability(therapistId),
    getClinicSettings(),
  ]);
  return resolveAvailability(dateKey, rows, settings.openingHours);
}
