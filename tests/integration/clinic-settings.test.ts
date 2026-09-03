import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import {
  getClinicSettings,
  updateClinicSettings,
  updateOpeningHours,
} from "@/server/services/clinic-settings";
import { EMPTY_OPENING_HOURS, type OpeningHours } from "@/lib/zod/clinic";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

const hours: OpeningHours = {
  monday: { open: "08:00", close: "17:00" },
  tuesday: { open: "08:00", close: "17:00" },
  wednesday: { open: "08:00", close: "17:00" },
  thursday: { open: "08:00", close: "17:00" },
  friday: { open: "08:00", close: "17:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: null,
};

const settingsInput = {
  clinicName: "TetaPhysio Lagos",
  tagline: "Movement is medicine",
  logoUrl: null,
  aboutContent: "We have served Lagos since 2019.",
  contactPhone: "08031234567",
  contactWhatsapp: "08031234567",
  contactEmail: "hello@tetaphysio.ng",
  address: "12 Awolowo Road, Ikoyi",
  bookingLeadTimeHours: 0,
  rescheduleCutoffHours: 2,
  cancellationCutoffHours: 2,
};

describe("clinic settings", () => {
  it("creates the singleton on first read rather than throwing", async () => {
    expect(await testPrisma.clinicSettings.count()).toBe(0);

    const settings = await getClinicSettings();

    expect(settings.id).toBe(1);
    expect(settings.openingHours).toEqual(EMPTY_OPENING_HOURS);
    expect(await testPrisma.clinicSettings.count()).toBe(1);
  });

  it("is idempotent on repeated reads — never a second row", async () => {
    await getClinicSettings();
    await getClinicSettings();
    expect(await testPrisma.clinicSettings.count()).toBe(1);
  });

  it("persists an update and reads it back", async () => {
    await updateClinicSettings(settingsInput);

    const settings = await getClinicSettings();
    expect(settings.clinicName).toBe("TetaPhysio Lagos");
    expect(settings.rescheduleCutoffHours).toBe(2);
    expect(settings.contactEmail).toBe("hello@tetaphysio.ng");
  });

  it("does not clobber opening hours when other settings change", async () => {
    await updateOpeningHours(hours);
    await updateClinicSettings(settingsInput);

    expect((await getClinicSettings()).openingHours).toEqual(hours);
  });

  it("round-trips opening hours through the JSON column", async () => {
    await updateOpeningHours(hours);

    const settings = await getClinicSettings();
    expect(settings.openingHours.monday).toEqual({ open: "08:00", close: "17:00" });
    expect(settings.openingHours.saturday).toEqual({ open: "09:00", close: "14:00" });
    expect(settings.openingHours.sunday).toBeNull();
  });

  it("rejects opening hours whose close precedes open", async () => {
    const bad = { ...hours, monday: { open: "17:00", close: "08:00" } } as OpeningHours;
    await expect(updateOpeningHours(bad)).rejects.toThrow();
  });

  it("throws on read when the stored JSON is malformed", async () => {
    await updateOpeningHours(hours);
    // Simulate a hand-edited row. Spec §3.1 requires this to fail at the
    // boundary, not silently inside the booking engine.
    await testPrisma.$executeRaw`
      UPDATE clinic_settings SET opening_hours = '{"monday":{"open":"08:00"}}'::jsonb WHERE id = 1
    `;

    await expect(getClinicSettings()).rejects.toThrow();
  });
});
