import { describe, it, expect } from "vitest";
import {
  intersectWindows,
  isValidTime,
  mergeWindows,
  subtractWindows,
  type TimeWindow,
} from "@/lib/time";

const w = (start: string, end: string): TimeWindow => ({ start, end });

describe("isValidTime", () => {
  it("accepts zero-padded 24-hour times", () => {
    expect(isValidTime("00:00")).toBe(true);
    expect(isValidTime("09:30")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidTime("9:30")).toBe(false);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("12:60")).toBe(false);
    expect(isValidTime("noon")).toBe(false);
    expect(isValidTime("")).toBe(false);
  });
});

describe("mergeWindows", () => {
  it("sorts by start", () => {
    expect(mergeWindows([w("13:00", "17:00"), w("08:00", "12:00")])).toEqual([
      w("08:00", "12:00"),
      w("13:00", "17:00"),
    ]);
  });

  it("merges overlapping windows", () => {
    expect(mergeWindows([w("08:00", "12:00"), w("11:00", "15:00")])).toEqual([w("08:00", "15:00")]);
  });

  it("merges windows that merely touch", () => {
    expect(mergeWindows([w("08:00", "12:00"), w("12:00", "17:00")])).toEqual([w("08:00", "17:00")]);
  });

  it("leaves a real gap alone", () => {
    expect(mergeWindows([w("08:00", "12:00"), w("13:00", "17:00")])).toHaveLength(2);
  });

  it("drops zero-length windows", () => {
    expect(mergeWindows([w("09:00", "09:00")])).toEqual([]);
  });

  it("returns an empty array unchanged", () => {
    expect(mergeWindows([])).toEqual([]);
  });
});

describe("subtractWindows", () => {
  it("returns the original when nothing is blocked", () => {
    expect(subtractWindows([w("08:00", "17:00")], [])).toEqual([w("08:00", "17:00")]);
  });

  it("splits a window when a block falls inside it", () => {
    expect(subtractWindows([w("08:00", "17:00")], [w("12:00", "13:00")])).toEqual([
      w("08:00", "12:00"),
      w("13:00", "17:00"),
    ]);
  });

  it("trims the front when a block overlaps the start", () => {
    expect(subtractWindows([w("08:00", "17:00")], [w("07:00", "10:00")])).toEqual([
      w("10:00", "17:00"),
    ]);
  });

  it("trims the back when a block overlaps the end", () => {
    expect(subtractWindows([w("08:00", "17:00")], [w("16:00", "20:00")])).toEqual([
      w("08:00", "16:00"),
    ]);
  });

  it("removes the window entirely when fully blocked", () => {
    expect(subtractWindows([w("08:00", "17:00")], [w("08:00", "17:00")])).toEqual([]);
    expect(subtractWindows([w("08:00", "17:00")], [w("06:00", "20:00")])).toEqual([]);
  });

  it("ignores a block that does not touch the window", () => {
    expect(subtractWindows([w("08:00", "12:00")], [w("13:00", "14:00")])).toEqual([
      w("08:00", "12:00"),
    ]);
  });

  it("applies several blocks", () => {
    expect(
      subtractWindows([w("08:00", "18:00")], [w("10:00", "11:00"), w("14:00", "15:00")]),
    ).toEqual([w("08:00", "10:00"), w("11:00", "14:00"), w("15:00", "18:00")]);
  });
});

describe("intersectWindows", () => {
  it("returns the overlap", () => {
    expect(intersectWindows([w("08:00", "17:00")], [w("09:00", "13:00")])).toEqual([
      w("09:00", "13:00"),
    ]);
  });

  it("truncates a window that runs past the other's end", () => {
    expect(intersectWindows([w("08:00", "20:00")], [w("08:00", "17:00")])).toEqual([
      w("08:00", "17:00"),
    ]);
  });

  it("returns empty when there is no overlap", () => {
    expect(intersectWindows([w("08:00", "12:00")], [w("13:00", "17:00")])).toEqual([]);
  });

  it("returns empty when either side is empty", () => {
    expect(intersectWindows([], [w("08:00", "17:00")])).toEqual([]);
    expect(intersectWindows([w("08:00", "17:00")], [])).toEqual([]);
  });

  it("intersects many against many", () => {
    expect(
      intersectWindows([w("08:00", "12:00"), w("13:00", "18:00")], [w("11:00", "15:00")]),
    ).toEqual([w("11:00", "12:00"), w("13:00", "15:00")]);
  });
});
