/**
 * Pure slot computation, Africa/Lagos wall-clock in, timestamptz instants out
 * (spec §5.1). No database handle, no clock — `now` is injected so every case
 * is deterministic.
 *
 * WAT is UTC+1 year-round with no DST. Lagos 09:00 is therefore 08:00Z on every
 * date, and the conversion below hardcodes that +1 with a comment rather than
 * a timezone library. TIMEZONE in src/lib/constants.ts remains the single
 * source of the zone name; this file is the single place that converts it.
 */

import type { TimeWindow } from "@/lib/time";
import { TIMEZONE } from "@/lib/constants";

export type BookableSlot = { start: Date; end: Date };

export type SlotInput = {
  dateKey: string;
  availabilityWindows: TimeWindow[];
  existingAppointments: { start: Date; end: Date }[];
  serviceDurationMinutes: number;
  leadTimeHours: number;
  now: Date;
};

/** Slots start every 15 minutes (spec §4.1). */
export const GRID_MINUTES = 15;

function checkZone(): void {
  // If TIMEZONE ever stops being a fixed-offset zone, this conversion is wrong
  // and must be replaced with a real tz library. Fail loudly, not subtly.
  if (TIMEZONE !== "Africa/Lagos") {
    throw new Error(`slots.ts hardcodes the WAT +1 offset but TIMEZONE is ${TIMEZONE}`);
  }
}

function splitDateKey(dateKey: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) throw new Error(`Bad dateKey (want YYYY-MM-DD): ${dateKey}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function splitTime(hhmm: string): [number, number] {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new Error(`Bad HH:MM: ${hhmm}`);
  return [Number(m[1]), Number(m[2])];
}

export function lagosWallToUtc(dateKey: string, hhmm: string): Date {
  checkZone();
  const [y, mo, d] = splitDateKey(dateKey);
  const [h, mi] = splitTime(hhmm);
  return new Date(Date.UTC(y, mo - 1, d, h - 1, mi));
}

/** The UTC instants spanning one Lagos calendar day: [prev 23:00Z, 23:00Z). */
export function lagosDayRange(dateKey: string): { from: Date; to: Date } {
  checkZone();
  const [y, mo, d] = splitDateKey(dateKey);
  return {
    from: new Date(Date.UTC(y, mo - 1, d, -1, 0)),
    to: new Date(Date.UTC(y, mo - 1, d + 1, -1, 0)),
  };
}

/**
 * Lagos "today" as YYYY-MM-DD, derived from TIMEZONE — never a hardcoded
 * offset. One home for all pages that default a date filter to today.
 */
export function todayKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toMinutes(hhmm: string): number {
  const [h, mi] = splitTime(hhmm);
  return h * 60 + mi;
}

function toHHMM(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function getBookableSlots(input: SlotInput): BookableSlot[] {
  const {
    dateKey,
    availabilityWindows,
    existingAppointments,
    serviceDurationMinutes,
    leadTimeHours,
    now,
  } = input;

  const cutoff = new Date(now.getTime() + leadTimeHours * 3_600_000);
  const busy = [...existingAppointments].sort((a, b) => a.start.getTime() - b.start.getTime());

  const out: BookableSlot[] = [];
  for (const window of availabilityWindows) {
    const windowStart = toMinutes(window.start);
    const windowEnd = toMinutes(window.end);
    for (let t = windowStart; t + serviceDurationMinutes <= windowEnd; t += GRID_MINUTES) {
      const start = lagosWallToUtc(dateKey, toHHMM(t));
      const end = new Date(start.getTime() + serviceDurationMinutes * 60_000);
      if (start < cutoff) continue;
      // Half-open overlap: touching at an endpoint is not a clash (matches the
      // exclusion constraint's && on tstzrange, which is false on touch).
      if (busy.some((b) => start < b.end && b.start < end)) continue;
      out.push({ start, end });
    }
  }

  out.sort((a, b) => a.start.getTime() - b.start.getTime());
  // Overlapping availability windows can emit the same start twice.
  return out.filter((s, i) => i === 0 || s.start.getTime() !== out[i - 1]!.start.getTime());
}
