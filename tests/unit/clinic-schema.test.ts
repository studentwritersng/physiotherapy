import { describe, it, expect } from "vitest";
import {
  DAY_KEYS,
  EMPTY_OPENING_HOURS,
  clinicSettingsSchema,
  openingHoursSchema,
  parseOpeningHours,
  serviceSchema,
  availabilitySchema,
  testimonialSchema,
} from "@/lib/zod/clinic";

const fullWeek = {
  monday: { open: "08:00", close: "17:00" },
  tuesday: { open: "08:00", close: "17:00" },
  wednesday: { open: "08:00", close: "17:00" },
  thursday: { open: "08:00", close: "17:00" },
  friday: { open: "08:00", close: "17:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: null,
};

describe("openingHoursSchema", () => {
  it("accepts a full week with a closed day", () => {
    const parsed = openingHoursSchema.parse(fullWeek);
    expect(parsed.sunday).toBeNull();
    expect(parsed.monday).toEqual({ open: "08:00", close: "17:00" });
  });

  it("lists all seven days in DAY_KEYS, Monday first", () => {
    expect(DAY_KEYS).toEqual([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]);
  });

  it("rejects a closing time before the opening time", () => {
    const bad = { ...fullWeek, monday: { open: "17:00", close: "08:00" } };
    expect(() => openingHoursSchema.parse(bad)).toThrow(/after/i);
  });

  it("rejects a closing time equal to the opening time", () => {
    const bad = { ...fullWeek, monday: { open: "09:00", close: "09:00" } };
    expect(() => openingHoursSchema.parse(bad)).toThrow(/after/i);
  });

  it("rejects times that are not zero-padded 24-hour", () => {
    for (const value of ["9:00", "24:00", "12:60", "morning"]) {
      const bad = { ...fullWeek, monday: { open: value, close: "17:00" } };
      expect(() => openingHoursSchema.parse(bad)).toThrow();
    }
  });

  it("rejects a week with a missing day", () => {
    const { sunday: _omitted, ...missing } = fullWeek;
    expect(() => openingHoursSchema.parse(missing)).toThrow();
  });
});

describe("parseOpeningHours", () => {
  it("parses a valid stored value", () => {
    expect(parseOpeningHours(fullWeek).saturday).toEqual({ open: "09:00", close: "14:00" });
  });

  it("falls back to all-closed for an empty object, so a fresh row renders", () => {
    expect(parseOpeningHours({})).toEqual(EMPTY_OPENING_HOURS);
    expect(parseOpeningHours(null)).toEqual(EMPTY_OPENING_HOURS);
  });

  it("throws on a value that is present but malformed", () => {
    // A hand-edited row must fail at this boundary, not deep inside the
    // booking engine (spec §3.1).
    expect(() => parseOpeningHours({ ...fullWeek, monday: { open: "08:00" } })).toThrow();
  });
});

describe("clinicSettingsSchema", () => {
  const valid = {
    clinicName: "TetaPhysio",
    tagline: "Movement is medicine",
    logoUrl: "",
    aboutContent: "",
    contactPhone: "08031234567",
    contactWhatsapp: "08031234567",
    contactEmail: "hello@tetaphysio.ng",
    address: "Lagos",
    bookingLeadTimeHours: "0",
    rescheduleCutoffHours: "2",
    cancellationCutoffHours: "2",
  };

  it("accepts valid input and coerces the numeric strings a FormData carries", () => {
    const parsed = clinicSettingsSchema.parse(valid);
    expect(parsed.rescheduleCutoffHours).toBe(2);
    expect(typeof parsed.rescheduleCutoffHours).toBe("number");
  });

  it("requires a clinic name", () => {
    expect(() => clinicSettingsSchema.parse({ ...valid, clinicName: "" })).toThrow();
  });

  it("rejects a negative cutoff", () => {
    expect(() => clinicSettingsSchema.parse({ ...valid, rescheduleCutoffHours: "-1" })).toThrow();
  });

  it("treats an empty optional string as absent rather than invalid", () => {
    const parsed = clinicSettingsSchema.parse({ ...valid, logoUrl: "", contactEmail: "" });
    expect(parsed.logoUrl).toBeNull();
    expect(parsed.contactEmail).toBeNull();
  });

  it("rejects a malformed logo URL when one is given", () => {
    expect(() => clinicSettingsSchema.parse({ ...valid, logoUrl: "not-a-url" })).toThrow();
  });
});

describe("serviceSchema", () => {
  const valid = {
    name: "Sports Injury Rehabilitation",
    description: "Recovery from sports injury",
    defaultDurationMinutes: "60",
    defaultPrice: "20000.00",
    imageUrl: "",
  };

  it("accepts valid input", () => {
    const parsed = serviceSchema.parse(valid);
    expect(parsed.defaultDurationMinutes).toBe(60);
    expect(parsed.defaultPrice).toBe("20000.00");
  });

  it("requires a name", () => {
    expect(() => serviceSchema.parse({ ...valid, name: "" })).toThrow();
  });

  it("rejects a duration of zero or less", () => {
    expect(() => serviceSchema.parse({ ...valid, defaultDurationMinutes: "0" })).toThrow();
  });

  it("rejects a duration that is not a whole number of minutes", () => {
    expect(() => serviceSchema.parse({ ...valid, defaultDurationMinutes: "45.5" })).toThrow();
  });

  it("rejects a negative price but allows zero", () => {
    expect(() => serviceSchema.parse({ ...valid, defaultPrice: "-1" })).toThrow();
    expect(serviceSchema.parse({ ...valid, defaultPrice: "0" }).defaultPrice).toBe("0");
  });

  it("rejects a price with more than two decimal places", () => {
    // The column is Decimal(12,2); a third decimal would be silently rounded.
    expect(() => serviceSchema.parse({ ...valid, defaultPrice: "100.123" })).toThrow();
  });
});

describe("availabilitySchema", () => {
  // Zod v4's uuid check is RFC 9562-strict (version and variant nibbles), so
  // the fixture must be a well-formed v4 UUID, unlike under Zod v3.
  const recurring = {
    therapistId: "11111111-1111-4111-8111-111111111111",
    kind: "recurring",
    dayOfWeek: "1",
    startTime: "08:00",
    endTime: "17:00",
    isBlocked: "false",
  };

  const dated = {
    therapistId: "11111111-1111-4111-8111-111111111111",
    kind: "dated",
    specificDate: "2026-09-15",
    startTime: "09:00",
    endTime: "13:00",
    isBlocked: "true",
    reason: "Public holiday",
  };

  it("accepts a recurring window", () => {
    const parsed = availabilitySchema.parse(recurring);
    expect(parsed.dayOfWeek).toBe(1);
    expect(parsed.specificDate).toBeNull();
    expect(parsed.isBlocked).toBe(false);
  });

  it("accepts a dated block", () => {
    const parsed = availabilitySchema.parse(dated);
    expect(parsed.specificDate).toBe("2026-09-15");
    expect(parsed.dayOfWeek).toBeNull();
    expect(parsed.isBlocked).toBe(true);
  });

  it("rejects an end time at or before the start time", () => {
    expect(() => availabilitySchema.parse({ ...recurring, endTime: "08:00" })).toThrow(/after/i);
    expect(() => availabilitySchema.parse({ ...recurring, endTime: "07:00" })).toThrow(/after/i);
  });

  it("rejects a day of week outside 0-6", () => {
    expect(() => availabilitySchema.parse({ ...recurring, dayOfWeek: "7" })).toThrow();
    expect(() => availabilitySchema.parse({ ...recurring, dayOfWeek: "-1" })).toThrow();
  });

  it("requires a date when the kind is dated", () => {
    const { specificDate: _omitted, ...noDate } = dated;
    expect(() => availabilitySchema.parse(noDate)).toThrow();
  });

  it("requires a day of week when the kind is recurring", () => {
    const { dayOfWeek: _omitted, ...noDay } = recurring;
    expect(() => availabilitySchema.parse(noDay)).toThrow();
  });

  it("rejects a therapistId that is not a uuid", () => {
    expect(() => availabilitySchema.parse({ ...recurring, therapistId: "nope" })).toThrow();
  });
});

describe("testimonialSchema", () => {
  it("accepts valid input", () => {
    const parsed = testimonialSchema.parse({
      patientName: "Ada O.",
      content: "The team got me walking again.",
      published: "true",
    });
    expect(parsed.published).toBe(true);
  });

  it("requires a name and content", () => {
    expect(() =>
      testimonialSchema.parse({ patientName: "", content: "x", published: "false" }),
    ).toThrow();
    expect(() =>
      testimonialSchema.parse({ patientName: "Ada", content: "", published: "false" }),
    ).toThrow();
  });

  it("defaults published to false when the checkbox is absent", () => {
    expect(testimonialSchema.parse({ patientName: "Ada", content: "Great" }).published).toBe(false);
  });
});
