import { describe, it, expect } from "vitest";
import {
  getBookableSlots,
  lagosDayRange,
  lagosWallToUtc,
  type SlotInput,
} from "@/lib/slots";

const base: Omit<SlotInput, "availabilityWindows" | "existingAppointments" | "now"> = {
  dateKey: "2026-09-15",
  serviceDurationMinutes: 45,
  leadTimeHours: 0,
};

function run(
  over: Partial<SlotInput> & Pick<SlotInput, "availabilityWindows">,
): { start: string; end: string }[] {
  return getBookableSlots({
    existingAppointments: [],
    now: new Date("2026-09-01T00:00:00.000Z"),
    ...base,
    ...over,
  }).map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() }));
}

const W = (start: string, end: string) => ({ start, end });

describe("lagosWallToUtc", () => {
  it("converts Lagos wall-clock to UTC at a fixed +1 offset", () => {
    // WAT has no DST, so Lagos 09:00 is 08:00Z on every date of the year.
    expect(lagosWallToUtc("2026-09-15", "09:00").toISOString()).toBe("2026-09-15T08:00:00.000Z");
    expect(lagosWallToUtc("2026-01-15", "09:00").toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });

  it("throws on malformed input rather than producing a silently wrong instant", () => {
    expect(() => lagosWallToUtc("15-09-2026", "09:00")).toThrow();
    expect(() => lagosWallToUtc("2026-09-15", "9am")).toThrow();
  });
});

describe("lagosDayRange", () => {
  it("covers exactly one Lagos day in UTC", () => {
    const { from, to } = lagosDayRange("2026-09-15");
    expect(from.toISOString()).toBe("2026-09-14T23:00:00.000Z");
    expect(to.toISOString()).toBe("2026-09-15T23:00:00.000Z");
  });
});

describe("getBookableSlots", () => {
  it("lays a 15-minute grid inside one window for a 45-minute service", () => {
    const slots = run({ availabilityWindows: [W("09:00", "11:00")] });
    // Starts 09:00, 09:15, 09:30, 09:45, 10:00, 10:15 — 10:30 would end 11:15.
    expect(slots.map((s) => s.start.slice(11, 16))).toEqual([
      "08:00",
      "08:15",
      "08:30",
      "08:45",
      "09:00",
      "09:15",
    ]);
    expect(slots[0]).toEqual({ start: "2026-09-15T08:00:00.000Z", end: "2026-09-15T08:45:00.000Z" });
  });

  it("returns nothing when the window is shorter than the duration", () => {
    expect(run({ availabilityWindows: [W("09:00", "09:30")] })).toEqual([]);
  });

  it("excludes slots overlapping an existing appointment", () => {
    const slots = run({
      availabilityWindows: [W("09:00", "11:00")],
      existingAppointments: [
        { start: new Date("2026-09-15T08:30:00.000Z"), end: new Date("2026-09-15T09:00:00.000Z") },
      ],
    });
    // Lagos 09:00–10:00 starts overlap the 08:30–09:00Z booking and drop out;
    // 10:00 and 10:15 Lagos (09:00Z, 09:15Z) merely touch or clear it, so both survive.
    expect(slots.map((s) => s.start.slice(11, 16))).toEqual(["09:00", "09:15"]);
  });

  it("keeps a slot that merely touches an appointment", () => {
    const slots = run({
      availabilityWindows: [W("09:00", "10:30")],
      existingAppointments: [
        { start: new Date("2026-09-15T08:00:00.000Z"), end: new Date("2026-09-15T08:45:00.000Z") },
      ],
    });
    // 09:45 Lagos start == 08:45Z end of the booking. Touching is not overlap.
    expect(slots.map((s) => s.start.slice(11, 16))).toEqual(["08:45"]);
  });

  it("applies the lead-time rule against the injected clock", () => {
    const slots = run({
      availabilityWindows: [W("08:00", "12:00")],
      now: new Date("2026-09-15T06:30:00.000Z"), // 07:30 Lagos
      leadTimeHours: 2,
    });
    // Cutoff is 09:30 Lagos (08:30Z): first bookable start is 09:30.
    expect(slots[0]!.start).toBe("2026-09-15T08:30:00.000Z");
  });

  it("disables the lead-time rule at zero", () => {
    const slots = run({
      availabilityWindows: [W("08:30", "10:00")],
      now: new Date("2026-09-15T07:30:00.000Z"),
      leadTimeHours: 0,
    });
    expect(slots).toHaveLength(4);
  });

  it("returns nothing for an empty window list", () => {
    expect(run({ availabilityWindows: [] })).toEqual([]);
  });

  it("dedupes identical starts from overlapping windows", () => {
    const slots = run({ availabilityWindows: [W("09:00", "10:00"), W("09:30", "10:30")] });
    const starts = slots.map((s) => s.start);
    expect(new Set(starts).size).toBe(starts.length);
  });

  it("handles a 60-minute service on the same grid", () => {
    const slots = getBookableSlots({
      ...base,
      serviceDurationMinutes: 60,
      availabilityWindows: [W("09:00", "11:00")],
      existingAppointments: [],
      now: new Date("2026-09-01T00:00:00.000Z"),
    });
    // Last start is 10:00 Lagos (ends 11:00 sharp).
    expect(slots.map((s) => s.start.toISOString().slice(11, 16))).toEqual([
      "08:00",
      "08:15",
      "08:30",
      "08:45",
      "09:00",
    ]);
  });
});
