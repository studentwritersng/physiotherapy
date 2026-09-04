import { describe, it, expect } from "vitest";
import { bookingReference, buildWhatsAppLink, sitemapEntries } from "@/lib/site";

describe("bookingReference", () => {
  it("derives a stable APT-XXXXXX code from the appointment id", () => {
    expect(bookingReference("7k2q9m-aaaa-bbbb-cccc-dddddddddddd")).toBe("APT-7K2Q9M");
    expect(bookingReference("7k2q9m-aaaa-bbbb-cccc-dddddddddddd")).toBe(
      bookingReference("7k2q9m-aaaa-bbbb-cccc-dddddddddddd"),
    );
  });

  it("strips dashes and uppercases", () => {
    expect(bookingReference("abcdef12-3456-7890-abcd-ef1234567890")).toBe("APT-ABCDEF");
  });
});

describe("buildWhatsAppLink", () => {
  it("builds a wa.me link with a pre-filled message", () => {
    expect(buildWhatsAppLink("+2348000000000", "Hello, I'd like to book")).toBe(
      "https://wa.me/2348000000000?text=Hello%2C%20I%27d%20like%20to%20book",
    );
  });

  it("drops the leading plus from the phone", () => {
    expect(buildWhatsAppLink("2348000000000", "Hi")).toBe("https://wa.me/2348000000000?text=Hi");
  });

  it("returns null when the clinic has no WhatsApp number configured", () => {
    expect(buildWhatsAppLink(null, "Hi")).toBeNull();
    expect(buildWhatsAppLink("", "Hi")).toBeNull();
  });
});

describe("sitemapEntries", () => {
  it("lists static routes plus one entry per service slug", () => {
    const entries = sitemapEntries(["sports-injury", "pain"], "https://tetaphysio.ng");
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://tetaphysio.ng/");
    expect(urls).toContain("https://tetaphysio.ng/services");
    expect(urls).toContain("https://tetaphysio.ng/about");
    expect(urls).toContain("https://tetaphysio.ng/contact");
    expect(urls).toContain("https://tetaphysio.ng/book");
    expect(urls).toContain("https://tetaphysio.ng/privacy");
    expect(urls).toContain("https://tetaphysio.ng/services/sports-injury");
    expect(urls).toContain("https://tetaphysio.ng/services/pain");
  });

  it("never emits a login, staff or portal URL", () => {
    const urls = sitemapEntries([], "https://tetaphysio.ng").map((e) => e.url);
    expect(urls.some((u) => /login|staff|portal|api\//.test(u))).toBe(false);
  });
});
