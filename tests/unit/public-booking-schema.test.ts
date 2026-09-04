import { describe, it, expect } from "vitest";
import { publicBookingSchema } from "@/lib/zod/public-booking";

const SERVICE_ID = "123e4567-e89b-12d3-a456-426614174000";
const THERAPIST_ID = "123e4567-e89b-12d3-a456-426614174001";

const base = {
  fullName: "Ada Obi",
  phone: "08031234567",
  email: "ada@example.com",
  isNewPatient: "true",
  reasonForVisit: "Back pain",
  serviceId: SERVICE_ID,
  therapistId: THERAPIST_ID,
  dateKey: "2026-12-15",
  startTime: "09:00",
};

describe("publicBookingSchema", () => {
  it("accepts a valid full input", () => {
    const parsed = publicBookingSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.isNewPatient).toBe(true);
      expect(parsed.data.therapistId).toBe(THERAPIST_ID);
    }
  });

  it("accepts no-preference as an empty therapist value", () => {
    const parsed = publicBookingSchema.safeParse({ ...base, therapistId: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.therapistId).toBeNull();
  });

  it("rejects a bad phone number", () => {
    const parsed = publicBookingSchema.safeParse({ ...base, phone: "123" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.join(".") === "phone")).toBe(true);
    }
  });

  it("treats a blank email as absent", () => {
    const parsed = publicBookingSchema.safeParse({ ...base, email: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBeNull();
  });

  it("rejects a missing name", () => {
    const parsed = publicBookingSchema.safeParse({ ...base, fullName: " " });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.join(".") === "fullName")).toBe(true);
    }
  });

  it("rejects a bad start time", () => {
    const parsed = publicBookingSchema.safeParse({ ...base, startTime: "9am" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.join(".") === "startTime")).toBe(true);
    }
  });
});
