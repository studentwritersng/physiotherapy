import type { MetadataRoute } from "next";
import { listActiveServices } from "@/server/services/service-catalog";
import { sitemapEntries } from "@/lib/site";

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * Built at build time from live data, so a new service appears without a
 * deploy-time code change — only a rebuild, which Vercel does on schedule.
 * If the database is unreachable at build time (preview envs without a DB),
 * fall back to the static routes rather than failing the build.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let slugs: string[] = [];
  try {
    slugs = (await listActiveServices()).map((s) => s.slug);
  } catch {
    slugs = [];
  }
  return sitemapEntries(slugs, BASE_URL).map((entry) => ({ url: entry.url }));
}
