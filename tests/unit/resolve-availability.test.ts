import { describe, it, expect } from "vitest";
import { resolveAvailability, type AvailabilityRow } from "@/server/services/availability";
import type { OpeningHours } from "@/lib/zod/clinic";

/** 2026-09-15 is a Tuesday; getUTCDay() returns 2. */
const TUESDAY = "2026-09-15";
const WEDNESDAY = "2026-09-16";

const openWeek: OpeningHours = {
  monday: { open: "08:00", close: "17:00" },
  tuesday: { open: "08:00", close: "17:00" },
  wednesday: { open: "08:00", close: "17:00" },
  thursday: { open: "08:00", close: "17:00" },
  friday: { open: "08:00", close: "17:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: null,
};

function recurring(
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  isBlocked = false,
): AvailabilityRow {
  return { dayOfWeek, specificDate: null, startTime, endTime, isBlocked };
}

function dated(date: string, startTime: string, endTime: string, isBlocked = false): AvailabilityRow {
  return {
    dayOfWeek: null,
    specificDate: new Date(`${date}T00:00:00.000Z`),
    startTime,
    endTime,
    isBlocked,
  };
}

describe("resolveAvailability", () => {
  it("returns the recurring window on a matching weekday", () => {
    const rows = [recurring(2, "09:00", "13:00")];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([{ start: "09:00", end: "13:00" }]);
  });

  it("returns nothing on a weekday with no recurring row", () => {
    const rows = [recurring(2, "09:00", "13:00")];
    expect(resolveAvailability(WEDNESDAY, rows, openWeek)).toEqual([]);
  });

  it("returns nothing when the therapist has no rows at all", () => {
    expect(resolveAvailability(TUESDAY, [], openWeek)).toEqual([]);
  });

  it("lets a dated row override the recurring pattern entirely", () => {
    // Spec §3.2: the recurring 09:00-13:00 is discarded, not merged.
    const rows = [recurring(2, "09:00", "13:00"), dated(TUESDAY, "14:00", "16:00")];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([{ start: "14:00", end: "16:00" }]);
  });

  it("yields nothing when a dated blocked row covers a normally-working day", () => {
    const rows = [recurring(2, "09:00", "13:00"), dated(TUESDAY, "00:00", "23:59", true)];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([]);
  });

  it("leaves other dates untouched when a dated row exists", () => {
    const rows = [
      recurring(2, "09:00", "13:00"),
      recurring(3, "09:00", "13:00"),
      dated(TUESDAY, "14:00", "16:00"),
    ];
    expect(resolveAvailability(WEDNESDAY, rows, openWeek)).toEqual([
      { start: "09:00", end: "13:00" },
    ]);
  });

  it("splits a window when a recurring block falls inside it", () => {
    const rows = [recurring(2, "08:00", "17:00"), recurring(2, "12:00", "13:00", true)];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([
      { start: "08:00", end: "12:00" },
      { start: "13:00", end: "17:00" },
    ]);
  });

  it("truncates a window that runs past closing time", () => {
    const rows = [recurring(2, "08:00", "20:00")];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([{ start: "08:00", end: "17:00" }]);
  });

  it("truncates a window that starts before opening time", () => {
    const rows = [recurring(2, "06:00", "12:00")];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([{ start: "08:00", end: "12:00" }]);
  });

  it("returns nothing when the clinic is closed, however available the therapist", () => {
    const rows = [recurring(0, "09:00", "17:00")]; // Sunday
    expect(resolveAvailability("2026-09-20", rows, openWeek)).toEqual([]);
  });

  it("merges two adjacent recurring windows", () => {
    const rows = [recurring(2, "08:00", "12:00"), recurring(2, "12:00", "16:00")];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([{ start: "08:00", end: "16:00" }]);
  });

  it("keeps a genuine gap between two windows", () => {
    const rows = [recurring(2, "08:00", "11:00"), recurring(2, "14:00", "17:00")];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([
      { start: "08:00", end: "11:00" },
      { start: "14:00", end: "17:00" },
    ]);
  });

  it("applies a dated block only against dated open windows", () => {
    const rows = [dated(TUESDAY, "08:00", "17:00"), dated(TUESDAY, "12:00", "13:00", true)];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([
      { start: "08:00", end: "12:00" },
      { start: "13:00", end: "17:00" },
    ]);
  });

  it("returns nothing when a dated row is blocked-only, with no open window", () => {
    const rows = [dated(TUESDAY, "12:00", "13:00", true)];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([]);
  });

  it("respects the shorter Saturday opening hours", () => {
    const rows = [recurring(6, "08:00", "18:00")];
    expect(resolveAvailability("2026-09-19", rows, openWeek)).toEqual([
      { start: "09:00", end: "14:00" },
    ]);
  });
});
