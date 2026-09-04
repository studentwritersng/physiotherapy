import Link from "next/link";
import { headers } from "next/headers";
import { requirePageRole } from "@/server/auth/page-guard";

const TABS = [
  { href: "/staff/settings", label: "Clinic" },
  { href: "/staff/settings/services", label: "Services" },
  { href: "/staff/settings/availability", label: "Availability" },
  { href: "/staff/settings/content", label: "Content" },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  // Layout guard AND a guard in every page. A page must not depend on its layout
  // for authorization — the same belt-and-braces rule Foundation applies.
  await requirePageRole("admin");

  // The active tab is the longest matching href, so /staff/settings/services
  // highlights "Services" rather than "Clinic".
  const pathname = (await headers()).get("x-tp-pathname") ?? "";
  const activeHref =
    TABS.map((t) => t.href)
      .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
      .sort((a, b) => b.length - a.length)[0] ?? "/staff/settings";

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ivory">Clinic settings</h1>
        <p className="mt-1 max-w-prose text-sm text-ivory-dim">
          Configuration that feeds the public website and the booking engine.
        </p>
      </header>

      <nav aria-label="Settings sections" className="border-b border-line">
        <ul className="flex flex-wrap gap-1">
          {TABS.map((tab) => {
            const isActive = tab.href === activeHref;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex min-h-11 cursor-pointer items-center rounded-t-md px-4 py-2 text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-3 focus:ring-jade ${
                    isActive
                      ? "border-b-2 border-jade text-jade-text"
                      : "text-ivory-dim hover:bg-surface-2 hover:text-ivory"
                  }`}
                  style={isActive ? { background: "var(--color-jade-dim)" } : undefined}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {children}
    </div>
  );
}
