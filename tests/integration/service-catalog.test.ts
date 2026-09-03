import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import {
  createService,
  getService,
  getServiceBySlug,
  listActiveServices,
  listServices,
  reorderServices,
  setServiceActive,
  updateService,
} from "@/server/services/service-catalog";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

const input = {
  name: "Sports Injury Rehabilitation",
  description: "Recovery from sports injury",
  defaultDurationMinutes: 60,
  defaultPrice: "20000.00",
  imageUrl: null,
};

describe("service catalog", () => {
  it("creates a service and derives its slug", async () => {
    const created = await createService(input);
    expect(created.slug).toBe("sports-injury-rehabilitation");
    expect(created.active).toBe(true);
    // Prisma normalizes Decimal to its canonical form (trailing zeros stripped),
    // so compare the value rather than the string.
    expect(Number(created.defaultPrice)).toBe(20000);
  });

  it("appends -2 when a slug already exists", async () => {
    await createService(input);
    const second = await createService(input);
    expect(second.slug).toBe("sports-injury-rehabilitation-2");

    const third = await createService(input);
    expect(third.slug).toBe("sports-injury-rehabilitation-3");
  });

  it("avoids a slug held by a soft-deleted row", async () => {
    const first = await createService(input);
    // slug is @unique at the database level, so a soft-deleted row still owns it.
    await testPrisma.service.update({ where: { id: first.id }, data: { deletedAt: new Date() } });

    const second = await createService(input);
    expect(second.slug).toBe("sports-injury-rehabilitation-2");
  });

  it("orders by sortOrder then name", async () => {
    await createService({ ...input, name: "Pain Management" });
    await createService({ ...input, name: "Neurological Rehabilitation" });

    expect((await listServices()).map((s) => s.name)).toEqual([
      "Pain Management",
      "Neurological Rehabilitation",
    ]);
  });

  it("persists a new order", async () => {
    const a = await createService({ ...input, name: "Alpha" });
    const b = await createService({ ...input, name: "Bravo" });
    const c = await createService({ ...input, name: "Charlie" });

    await reorderServices([c.id, a.id, b.id]);

    expect((await listServices()).map((s) => s.name)).toEqual(["Charlie", "Alpha", "Bravo"]);
  });

  it("excludes deactivated services from the active list but keeps them findable by id", async () => {
    const created = await createService(input);

    await setServiceActive(created.id, false);

    expect(await listActiveServices()).toHaveLength(0);
    expect(await listServices()).toHaveLength(1);
    // Historical appointments and invoices must still resolve the name (spec §3.3).
    expect((await getService(created.id))?.name).toBe("Sports Injury Rehabilitation");
  });

  it("reactivates a deactivated service", async () => {
    const created = await createService(input);
    await setServiceActive(created.id, false);
    await setServiceActive(created.id, true);
    expect(await listActiveServices()).toHaveLength(1);
  });

  it("excludes soft-deleted services from every read", async () => {
    const created = await createService(input);
    await testPrisma.service.update({ where: { id: created.id }, data: { deletedAt: new Date() } });

    expect(await listServices()).toHaveLength(0);
    expect(await listActiveServices()).toHaveLength(0);
    expect(await getService(created.id)).toBeNull();
    expect(await getServiceBySlug("sports-injury-rehabilitation")).toBeNull();
  });

  it("finds an active service by slug, for the public site", async () => {
    await createService(input);
    const found = await getServiceBySlug("sports-injury-rehabilitation");
    expect(found?.name).toBe("Sports Injury Rehabilitation");
  });

  it("updates a service without changing its slug", async () => {
    const created = await createService(input);

    await updateService(created.id, { ...input, name: "Sports Rehab", defaultPrice: "25000.00" });

    const updated = await getService(created.id);
    expect(updated?.name).toBe("Sports Rehab");
    expect(Number(updated!.defaultPrice)).toBe(25000);
    // The slug is a public URL (sub-project 4). Renaming must not break an
    // existing link.
    expect(updated?.slug).toBe("sports-injury-rehabilitation");
  });
});