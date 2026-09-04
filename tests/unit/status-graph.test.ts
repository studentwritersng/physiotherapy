import { describe, it, expect } from "vitest";
import { NEXT_STATUS, assertLegalTransition, InvalidTransitionError } from "@/server/services/appointment-status";
import type { AppointmentStatus } from "@/generated/prisma/client";

const ALL: AppointmentStatus[] = [
  "scheduled",
  "confirmed",
  "arrived",
  "in_session",
  "completed",
  "cancelled",
  "no_show",
];

describe("NEXT_STATUS", () => {
  it("covers every status exactly once", () => {
    expect(Object.keys(NEXT_STATUS).sort()).toEqual([...ALL].sort());
  });

  it("lets a booking flow to completion", () => {
    expect(NEXT_STATUS.scheduled).toContain("confirmed");
    expect(NEXT_STATUS.confirmed).toContain("arrived");
    expect(NEXT_STATUS.arrived).toContain("in_session");
    expect(NEXT_STATUS.in_session).toEqual(["completed"]);
  });

  it("lets arrivals skip confirmation", () => {
    expect(NEXT_STATUS.scheduled).toContain("arrived");
  });

  it("lets scheduled, confirmed and arrived cancel or no-show", () => {
    for (const from of ["scheduled", "confirmed", "arrived"] as const) {
      expect(NEXT_STATUS[from]).toContain("cancelled");
      expect(NEXT_STATUS[from]).toContain("no_show");
    }
  });

  it("makes completed, cancelled and no_show terminal", () => {
    expect(NEXT_STATUS.completed).toEqual([]);
    expect(NEXT_STATUS.cancelled).toEqual([]);
    expect(NEXT_STATUS.no_show).toEqual([]);
  });
});

describe("assertLegalTransition", () => {
  it("passes on a legal edge", () => {
    expect(() => assertLegalTransition("arrived", "in_session")).not.toThrow();
  });

  it("throws InvalidTransitionError with a 422 status on an illegal edge", () => {
    try {
      assertLegalTransition("completed", "scheduled");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTransitionError);
      expect((error as InvalidTransitionError).status).toBe(422);
      expect((error as InvalidTransitionError).message).toMatch(/completed.*scheduled/);
    }
  });

  it("throws on a self-transition", () => {
    expect(() => assertLegalTransition("scheduled", "scheduled")).toThrow(InvalidTransitionError);
  });
});
