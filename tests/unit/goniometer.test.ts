import { describe, it, expect } from "vitest";
import { goniometerArc } from "@/components/Goniometer";

describe("goniometerArc", () => {
  it("draws a left-to-top quarter arc", () => {
    // Centre (70, 76), radius 56: -90deg is left (9 o'clock), 0deg is top.
    const d = goniometerArc(70, 76, 56, -90, 0);
    expect(d).toMatch(/^M -?\d+\.\d+ -?\d+\.\d+ A 56 56 0 0 1 -?\d+\.\d+ -?\d+\.\d+$/);
  });

  it("sets the large-arc flag past 180 degrees", () => {
    // A full semicircle is exactly 180 — flag 0; anything more flips to 1.
    expect(goniometerArc(70, 76, 56, -90, 90)).toContain(" A 56 56 0 0 1 ");
    expect(goniometerArc(70, 76, 56, -90, 91)).toContain(" A 56 56 0 1 1 ");
  });

  it("clamps out-of-range fractions in the component, not here — arc takes raw angles", () => {
    const full = goniometerArc(70, 76, 56, -90, 90);
    const empty = goniometerArc(70, 76, 56, -90, -90);
    expect(full).not.toBe(empty);
  });
});
