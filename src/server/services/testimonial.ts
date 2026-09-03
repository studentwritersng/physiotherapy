import "server-only";
import type { Testimonial } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { TestimonialInput } from "@/lib/zod/clinic";

/** Newest last, so a freshly created testimonial appends rather than jumping the queue. */
const byOrder = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];

export async function listTestimonials(): Promise<Testimonial[]> {
  return prisma.testimonial.findMany({ orderBy: byOrder });
}

/** What the public site (sub-project 4) renders. */
export async function listPublishedTestimonials(): Promise<Testimonial[]> {
  return prisma.testimonial.findMany({ where: { published: true }, orderBy: byOrder });
}

export async function createTestimonial(input: TestimonialInput): Promise<void> {
  const count = await prisma.testimonial.count();
  await prisma.testimonial.create({ data: { ...input, sortOrder: count } });
}

export async function updateTestimonial(id: string, input: TestimonialInput): Promise<void> {
  await prisma.testimonial.update({ where: { id }, data: input });
}

export async function setTestimonialPublished(id: string, published: boolean): Promise<void> {
  await prisma.testimonial.update({ where: { id }, data: { published } });
}

export async function deleteTestimonial(id: string): Promise<void> {
  // A testimonial carries no clinical or financial history, so a hard delete is
  // correct here — unlike patients, services and appointments (PRD-06 FR2).
  await prisma.testimonial.delete({ where: { id } });
}

/** Persists the given order as sortOrder 0..n-1, in one transaction. */
export async function reorderTestimonials(ids: string[]): Promise<void> {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.testimonial.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
}
