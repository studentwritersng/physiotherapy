import "server-only";
import type { Service } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { slugify } from "@/lib/slug";
import type { ServiceInput } from "@/lib/zod/clinic";

/**
 * Soft-delete filter (spec §4.4). Prisma has no global filter, so it lives here
 * and every read in this module composes it. Never inline `deletedAt` in an
 * action or a page.
 */
const notDeleted = { deletedAt: null } as const;

const byOrder = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

export async function listServices(): Promise<Service[]> {
  return prisma.service.findMany({ where: notDeleted, orderBy: byOrder });
}

/** What the public site and the booking form show (spec §3.3). */
export async function listActiveServices(): Promise<Service[]> {
  return prisma.service.findMany({ where: { ...notDeleted, active: true }, orderBy: byOrder });
}

export async function getService(id: string): Promise<Service | null> {
  return prisma.service.findFirst({ where: { id, ...notDeleted } });
}

export async function getServiceBySlug(slug: string): Promise<Service | null> {
  return prisma.service.findFirst({ where: { slug, ...notDeleted } });
}

/**
 * `slug` is @unique at the database level, so a soft-deleted row still owns its
 * slug. The collision check therefore ignores `deletedAt` deliberately —
 * otherwise this would generate a slug that then fails to insert.
 */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "service";

  for (let suffix = 1; ; suffix++) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const taken = await prisma.service.findUnique({ where: { slug: candidate } });
    if (!taken) return candidate;
  }
}

export async function createService(input: ServiceInput): Promise<Service> {
  const count = await prisma.service.count();
  return prisma.service.create({
    data: { ...input, slug: await uniqueSlug(input.name), sortOrder: count },
  });
}

/**
 * Deliberately does not regenerate the slug. It is a public URL (sub-project 4),
 * so renaming a service must not break an existing link.
 */
export async function updateService(id: string, input: ServiceInput): Promise<void> {
  await prisma.service.update({ where: { id }, data: input });
}

/** PRD-06 FR2 prefers deactivation over deletion; the UI exposes only this (spec §3.3). */
export async function setServiceActive(id: string, active: boolean): Promise<void> {
  await prisma.service.update({ where: { id }, data: { active } });
}

export async function reorderServices(ids: string[]): Promise<void> {
  await prisma.$transaction(
    ids.map((id, index) => prisma.service.update({ where: { id }, data: { sortOrder: index } })),
  );
}
