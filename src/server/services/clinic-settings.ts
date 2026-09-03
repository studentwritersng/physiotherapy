import "server-only";
import type { ClinicSettings } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import {
  EMPTY_OPENING_HOURS,
  openingHoursSchema,
  parseOpeningHours,
  type ClinicSettingsInput,
  type OpeningHours,
} from "@/lib/zod/clinic";

/** The row with openingHours already parsed, so no consumer touches raw JSON. */
export type ClinicSettingsView = Omit<ClinicSettings, "openingHours"> & {
  openingHours: OpeningHours;
};

/** clinic_settings is a singleton pinned to id 1 (spec §4.3). */
const SINGLETON_ID = 1;

function toView(row: ClinicSettings): ClinicSettingsView {
  return { ...row, openingHours: parseOpeningHours(row.openingHours) };
}

/**
 * Upsert rather than findUniqueOrThrow, so a fresh database with no seed renders
 * an empty settings form instead of a 500 (spec §4.3).
 */
export async function getClinicSettings(): Promise<ClinicSettingsView> {
  const row = await prisma.clinicSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
  return toView(row);
}

export async function updateClinicSettings(input: ClinicSettingsInput): Promise<void> {
  // `create` omits openingHours deliberately: the column default applies on
  // insert, and an update must never touch it. Hours have their own writer.
  await prisma.clinicSettings.upsert({
    where: { id: SINGLETON_ID },
    update: input,
    create: { id: SINGLETON_ID, ...input },
  });
}

export async function updateOpeningHours(hours: OpeningHours): Promise<void> {
  // Validate before persisting, even though the action already parsed: this is
  // the service boundary, and a future caller might not have.
  const parsed = openingHoursSchema.parse(hours);

  await prisma.clinicSettings.upsert({
    where: { id: SINGLETON_ID },
    update: { openingHours: parsed },
    create: { id: SINGLETON_ID, openingHours: parsed },
  });
}

export { EMPTY_OPENING_HOURS };
