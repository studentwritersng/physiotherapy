import { describe, it, expect } from "vitest";
import {
  bookingSchema,
  cancelSchema,
  rescheduleSchema,
  statusSchema,
  walkInSchema,
} from "@/lib/zod/booking";

const UUID = "11111111-1111-4111-8111-111111111111";
const OTHER_UUID = "22222222-2222-4222-8222-222222222222";

describe("bookingSchema", () => {
  const valid = {
    patientId: UUID,
    therapistId: OTHER_UUID,
    noPreference: undefined,
    serviceId: UUID,
    dateKey: "2026-09-15",
    startTime: "09:00",
    reasonForVisit: "Lower back pain",
  };

  it("accepts a complete booking", () => {
    const parsed = bookingSchema.parse(valid);
    expect(parsed.patientId).toBe(UUID);
    expect(parsed.therapistId).toBe(OTHER_UUID);
    expect(parsed.noPreference).toBe(false);
  });

  it("accepts a no-preference booking with no therapist", () => {
    const parsed = bookingSchema.parse({ ...valid, therapistId: "", noPreference: "true" });
    expect(parsed.therapistId).toBeNull();
    expect(parsed.noPreference).toBe(true);
  });

  it("rejects a missing therapist when no-preference is off", () => {
    expect(() => bookingSchema.parse({ ...valid, therapistId: "" })).toThrow();
  });

  it("rejects a non-uuid patient", () => {
    expect(() => bookingSchema.parse({ ...valid, patientId: "nope" })).toThrow();
  });

  it("rejects a malformed date", () => {
    expect(() => bookingSchema.parse({ ...valid, dateKey: "15-09-2026" })).toThrow();
    expect(() => bookingSchema.parse({ ...valid, dateKey: "2026-13-40" })).not.toThrow();
  });

  it("rejects a malformed time", () => {
    expect(() => bookingSchema.parse({ ...valid, startTime: "9am" })).toThrow();
  });

  it("treats an empty reason as absent", () => {
    expect(bookingSchema.parse({ ...valid, reasonForVisit: "" }).reasonForVisit).toBeNull();
  });
});

describe("walkInSchema", () => {
  it("accepts phone plus name", () => {
    const parsed = walkInSchema.parse({
      phone: "08031234567",
      fullName: "Ada Obi",
      serviceId: UUID,
      therapistId: OTHER_UUID,
    });
    expect(parsed.phone).toBe("08031234567");
  });

  it("rejects a missing phone", () => {
    expect(() =>
      walkInSchema.parse({ phone: "", fullName: "Ada Obi", serviceId: UUID, therapistId: OTHER_UUID }),
    ).toThrow();
  });

  it("rejects a missing name for a new lead", () => {
    // patientId absent means a lead will be created, which needs a name.
    expect(() =>
      walkInSchema.parse({ phone: "08031234567", fullName: "", serviceId: UUID, therapistId: OTHER_UUID }),
    ).toThrow();
  });

  it("allows an empty name when linking an existing patient", () => {
    const parsed = walkInSchema.parse({
      phone: "08031234567",
      fullName: "",
      patientId: UUID,
      serviceId: UUID,
      therapistId: OTHER_UUID,
    });
    expect(parsed.patientId).toBe(UUID);
  });
});

describe("rescheduleSchema", () => {
  it("accepts id, date and time", () => {
    const parsed = rescheduleSchema.parse({
      id: UUID,
      dateKey: "2026-09-16",
      startTime: "10:00",
    });
    expect(parsed.dateKey).toBe("2026-09-16");
  });

  it("rejects a non-uuid id", () => {
    expect(() => rescheduleSchema.parse({ id: "x", dateKey: "2026-09-16", startTime: "10:00" })).toThrow();
  });
});

describe("cancelSchema", () => {
  it("accepts id and reason", () => {
    const parsed = cancelSchema.parse({ id: UUID, reason: "Patient called in sick" });
    expect(parsed.reason).toBe("Patient called in sick");
  });

  it("requires a reason — PRD-09's cancelled report depends on it", () => {
    expect(() => cancelSchema.parse({ id: UUID, reason: "  " })).toThrow();
  });
});

describe("statusSchema", () => {
  it("accepts every legal status value", () => {
    for (const status of [
      "scheduled",
      "confirmed",
      "arrived",
      "in_session",
      "completed",
      "cancelled",
      "no_show",
    ] as const) {
      expect(statusSchema.parse({ id: UUID, to: status }).to).toBe(status);
    }
  });

  it("rejects an unknown status", () => {
    expect(() => statusSchema.parse({ id: UUID, to: "teleported" })).toThrow();
  });
});
