/**
 * Pure HH:MM window arithmetic, Africa/Lagos wall-clock (spec §4.2).
 *
 * Times are zero-padded 24-hour strings, so lexicographic comparison IS
 * chronological comparison: "09:00" < "17:00". That is why nothing here needs a
 * Date, and therefore why none of it can have a timezone bug. Converting a
 * window into real timestamptz instants belongs to sub-project 3.
 */

export type TimeWindow = { start: string; end: string };

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** Sorts, merges overlapping or touching windows, and drops zero-length ones. */
export function mergeWindows(windows: TimeWindow[]): TimeWindow[] {
  const sorted = windows
    .filter((wnd) => wnd.start < wnd.end)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  const merged: TimeWindow[] = [];
  for (const wnd of sorted) {
    const last = merged[merged.length - 1];
    // `<=` not `<`: 08:00-12:00 and 12:00-17:00 are one continuous window.
    if (last && wnd.start <= last.end) {
      if (wnd.end > last.end) last.end = wnd.end;
    } else {
      merged.push({ ...wnd });
    }
  }
  return merged;
}

/** Removes every blocked span from the given windows, splitting where needed. */
export function subtractWindows(from: TimeWindow[], blocks: TimeWindow[]): TimeWindow[] {
  const cleanBlocks = mergeWindows(blocks);

  let result = mergeWindows(from);
  for (const block of cleanBlocks) {
    const next: TimeWindow[] = [];
    for (const wnd of result) {
      // No overlap at all.
      if (block.end <= wnd.start || block.start >= wnd.end) {
        next.push(wnd);
        continue;
      }
      // Surviving piece before the block.
      if (wnd.start < block.start) next.push({ start: wnd.start, end: block.start });
      // Surviving piece after the block.
      if (block.end < wnd.end) next.push({ start: block.end, end: wnd.end });
    }
    result = next;
  }
  return mergeWindows(result);
}

/** Every overlapping span between the two sets. */
export function intersectWindows(a: TimeWindow[], b: TimeWindow[]): TimeWindow[] {
  const left = mergeWindows(a);
  const right = mergeWindows(b);

  const out: TimeWindow[] = [];
  for (const x of left) {
    for (const y of right) {
      const start = x.start > y.start ? x.start : y.start;
      const end = x.end < y.end ? x.end : y.end;
      if (start < end) out.push({ start, end });
    }
  }
  return mergeWindows(out);
}
