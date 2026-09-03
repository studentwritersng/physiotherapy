import { describe, it, expect } from "vitest";
import { z } from "zod";
import { actionFailed, actionOk, IDLE_STATE, toFieldErrors } from "@/server/action-state";

describe("action state", () => {
  it("has an idle state that is neither success nor failure", () => {
    expect(IDLE_STATE.ok).toBeNull();
  });

  it("builds a success state", () => {
    const state = actionOk("Settings saved");
    expect(state).toEqual({ ok: true, message: "Settings saved" });
  });

  it("builds a failure state with no field errors", () => {
    const state = actionFailed("Could not reach the database");
    expect(state.ok).toBe(false);
    if (state.ok === false) {
      expect(state.message).toBe("Could not reach the database");
      expect(state.fieldErrors).toEqual({});
    }
  });

  it("maps a ZodError onto field errors keyed by field name", () => {
    const schema = z.object({
      clinicName: z.string().min(1, "Clinic name is required"),
      rescheduleCutoffHours: z.number().min(0, "Must be zero or more"),
    });
    const result = schema.safeParse({ clinicName: "", rescheduleCutoffHours: -1 });
    expect(result.success).toBe(false);
    if (result.success) return;

    const state = toFieldErrors(result.error);
    expect(state.ok).toBe(false);
    if (state.ok === false) {
      expect(state.fieldErrors.clinicName).toBe("Clinic name is required");
      expect(state.fieldErrors.rescheduleCutoffHours).toBe("Must be zero or more");
    }
  });

  it("keeps the first error when a field has several", () => {
    const schema = z.object({
      name: z.string().min(5, "Too short").regex(/^[A-Z]/, "Must start with a capital"),
    });
    const result = schema.safeParse({ name: "ab" });
    if (result.success) return;

    const state = toFieldErrors(result.error);
    if (state.ok === false) {
      expect(state.fieldErrors.name).toBe("Too short");
    }
  });

  it("keys a nested path with dots so an editor can find it", () => {
    const schema = z.object({
      monday: z.object({ open: z.string().min(5, "Use HH:MM") }),
    });
    const result = schema.safeParse({ monday: { open: "9" } });
    if (result.success) return;

    const state = toFieldErrors(result.error);
    if (state.ok === false) {
      expect(state.fieldErrors["monday.open"]).toBe("Use HH:MM");
    }
  });

  it("carries a summary message alongside field errors", () => {
    const schema = z.object({ name: z.string().min(1, "Required") });
    const result = schema.safeParse({ name: "" });
    if (result.success) return;

    const state = toFieldErrors(result.error, "Check the highlighted fields");
    if (state.ok === false) {
      expect(state.message).toBe("Check the highlighted fields");
    }
  });
});
