/**
 * Pure site helpers for the public surface. No database, no clock — everything
 * takes its inputs as arguments so each function is a unit test, not an
 * integration test.
 */

/**
 * Booking reference printed on the public confirmation screen (spec §6 step 5).
 * Derived deterministically from the appointment id: strip dashes, take the
 * first six characters, uppercase. Stable for the same id, no sequence to
 * manage, no extra column.
 */
export function bookingReference(appointmentId: string): string {
  return `APT-${appointmentId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/**
 * wa.me link with a pre-filled message (PRD-02 FR6). wa.me wants the number in
 * international format WITHOUT the leading plus — +234... becomes 234....
 * Returns null when the clinic has no WhatsApp number, so callers hide the
 * button instead of rendering a dead link.
 */
export function buildWhatsAppLink(phone: string | null, message: string): string | null {
  const digits = (phone ?? "").trim().replace(/^\+/, "").replace(/[\s-]/g, "");
  if (digits.length === 0) return null;
  // encodeURIComponent leaves ' unencoded; wa.me accepts it raw, but the
  // canonical form percent-encodes it, so normalise for stable output.
  return `https://wa.me/${digits}?text=${encodeURIComponent(message).replace(/'/g, "%27")}`;
}

export type SitemapEntry = { url: string; lastModified?: Date };

const STATIC_ROUTES = ["/", "/services", "/about", "/contact", "/book", "/privacy"];

/**
 * Sitemap entries from static routes plus one per live service slug. Takes the
 * slugs as input so the function stays pure — the route handler loads them.
 * Login, staff, portal and api/* routes are never listed: nothing unlisted is
 * necessarily hidden, but nothing listed should require a session.
 */
export function sitemapEntries(serviceSlugs: string[], baseUrl: string): SitemapEntry[] {
  const base = baseUrl.replace(/\/$/, "");
  // Homepage keeps its trailing slash: `${base}/` renders https://…ng/.
  return [
    ...STATIC_ROUTES.map((route) => ({ url: `${base}${route === "/" ? "/" : route}` })),
    ...serviceSlugs.map((slug) => ({ url: `${base}/services/${slug}` })),
  ];
}
