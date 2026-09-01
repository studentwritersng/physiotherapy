/**
 * Shared by prisma/seed.ts and the service catalog. It lives here rather than in
 * either caller so the two cannot drift into producing different slugs for the
 * same service name, which would break the public service URLs in sub-project 4.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
