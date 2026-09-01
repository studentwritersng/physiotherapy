import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Sports Injury Rehabilitation")).toBe("sports-injury-rehabilitation");
  });

  it("collapses non-alphanumeric runs into a single hyphen", () => {
    expect(slugify("Orthopedic/Musculoskeletal Physiotherapy")).toBe(
      "orthopedic-musculoskeletal-physiotherapy",
    );
    expect(slugify("Pain   &   Management")).toBe("pain-management");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  Pain Management")).toBe("pain-management");
    expect(slugify("--Neuro--")).toBe("neuro");
  });

  it("keeps digits", () => {
    expect(slugify("Phase 2 Rehab")).toBe("phase-2-rehab");
  });

  it("returns an empty string when nothing survives", () => {
    expect(slugify("!!!")).toBe("");
  });
});
