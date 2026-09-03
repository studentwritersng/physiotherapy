import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import {
  createAvailability,
  deleteAvailability,
  getAvailabilityForDate,
  listAvailability,
  listTherapists,
} from "@/server/services/availability";
import { updateOpeningHours } from "@/server/services/clinic-settings";
import type { OpeningHours } from "@/lib/zod/clinic";

const openWeek: OpeningHours = {
  monday: { open: "08:00", close: "17:00" },
  tuesday: { open: "08:00", close: "17:00" },
  wednesday: { open: "08:00", close: "17:00" },
  thursday: { open: "08:00", close: "17:00" },
  friday: { open: "08:00", close: "17:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: null,
};

/** 2026-09-15 is a Tuesday. */
const TUESDAY = "2026-09-15";

beforeEach(async () => {
  await truncateAll();
  await updateOpeningHours(openWeek);
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function makeTherapist(name: string, phone: string) {
  const user = await testPrisma.user.create({
    data: { name, phone, passwordHash: "x", role: "therapist" },
  });
  await testPrisma.staffProfile.create({ data: { userId: user.id } });
  return user;
}

describe("listTherapists", () => {
  it("returns active therapists only, by name", async () => {
    await makeTherapist("Dr. Zainab Yusuf", "+2348010000002");
    await makeTherapist("Dr. Adaeze Eze", "+2348010000001");
    await testPrisma.user.create({
      data: { name: "Front Desk", phone: "+2348010000003", passwordHash: "x", role: "receptionist" },
    });

    const therapists = await listTherapists();
    expect(therapists.map((t) => t.name)).toEqual(["Dr. Adaeze Eze", "Dr. Zainab Yusuf"]);
  });

  it("excludes a deactivated therapist", async () => {
    const t = await makeTherapist("Dr. Gone", "+2348010000004");
    await testPrisma.user.update({ where: { id: t.id }, data: { status: "inactive" } });
    expect(await listTherapists()).toHaveLength(0);
  });

  it("excludes a soft-deleted therapist", async () => {
    const t = await makeTherapist("Dr. Deleted", "+2348010000005");
    await testPrisma.user.update({ where: { id: t.id }, data: { deletedAt: new Date() } });
    expect(await listTherapists()).toHaveLength(0);
  });
});

describe("availability CRUD", () => {
  it("creates a recurring window", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");

    await createAvailability({
      therapistId: t.id,
      kind: "recurring",
      dayOfWeek: 2,
      specificDate: null,
      startTime: "09:00",
      endTime: "13:00",
      isBlocked: false,
      reason: null,
    });

    const rows = await listAvailability(t.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dayOfWeek).toBe(2);
    expect(rows[0]!.specificDate).toBeNull();
  });

  it("creates a dated block with a reason", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");

    await createAvailability({
      therapistId: t.id,
      kind: "dated",
      dayOfWeek: null,
      specificDate: TUESDAY,
      startTime: "00:00",
      endTime: "23:59",
      isBlocked: true,
      reason: "Annual leave",
    });

    const rows = await listAvailability(t.id);
    expect(rows[0]!.isBlocked).toBe(true);
    expect(rows[0]!.reason).toBe("Annual leave");
    expect(rows[0]!.specificDate).not.toBeNull();
  });

  it("scopes the list to one therapist", async () => {
    const a = await makeTherapist("Dr. A", "+2348010000001");
    const b = await makeTherapist("Dr. B", "+2348010000002");

    const base = {
      kind: "recurring" as const,
      dayOfWeek: 2,
      specificDate: null,
      startTime: "09:00",
      endTime: "13:00",
      isBlocked: false,
      reason: null,
    };
    await createAvailability({ ...base, therapistId: a.id });
    await createAvailability({ ...base, therapistId: b.id });

    expect(await listAvailability(a.id)).toHaveLength(1);
    expect(await listAvailability(b.id)).toHaveLength(1);
  });

  it("deletes a row", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    await createAvailability({
      therapistId: t.id,
      kind: "recurring",
      dayOfWeek: 2,
      specificDate: null,
      startTime: "09:00",
      endTime: "13:00",
      isBlocked: false,
      reason: null,
    });
    const [row] = await listAvailability(t.id);

    await deleteAvailability(row!.id);

    expect(await listAvailability(t.id)).toHaveLength(0);
  });
});

describe("getAvailabilityForDate", () => {
  it("intersects the recurring window with clinic hours", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    await createAvailability({
      therapistId: t.id,
      kind: "recurring",
      dayOfWeek: 2,
      specificDate: null,
      startTime: "06:00",
      endTime: "20:00",
      isBlocked: false,
      reason: null,
    });

    expect(await getAvailabilityForDate(t.id, TUESDAY)).toEqual([
      { start: "08:00", end: "17:00" },
    ]);
  });

  it("lets a dated row override the recurring pattern, end to end", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    await createAvailability({
      therapistId: t.id,
      kind: "recurring",
      dayOfWeek: 2,
      specificDate: null,
      startTime: "09:00",
      endTime: "13:00",
      isBlocked: false,
      reason: null,
    });
    await createAvailability({
      therapistId: t.id,
      kind: "dated",
      dayOfWeek: null,
      specificDate: TUESDAY,
      startTime: "14:00",
      endTime: "16:00",
      isBlocked: false,
      reason: "Clinic day",
    });

    expect(await getAvailabilityForDate(t.id, TUESDAY)).toEqual([
      { start: "14:00", end: "16:00" },
    ]);
  });

  it("returns nothing on a day the clinic is closed", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    await createAvailability({
      therapistId: t.id,
      kind: "recurring",
      dayOfWeek: 0,
      specificDate: null,
      startTime: "09:00",
      endTime: "17:00",
      isBlocked: false,
      reason: null,
    });

    expect(await getAvailabilityForDate(t.id, "2026-09-20")).toEqual([]);
  });

  it("returns nothing for a therapist with no rows", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    expect(await getAvailabilityForDate(t.id, TUESDAY)).toEqual([]);
  });
});