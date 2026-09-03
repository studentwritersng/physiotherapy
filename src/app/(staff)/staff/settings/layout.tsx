import Link from "next/link";
import { requireRole } from "@/server/auth/rbac";

const TABS = [
  { href: "/staff/settings", label: "Clinic" },
  { href: "/staff/settings/services", label: "Services" },
  { href: "/staff/settings/availability", label: "Availability" },
  { href: "/staff/settings/content", label: "Content" },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  // Layout guard AND a guard in every page. A page must not depend on its layout
  // for authorization — the same belt-and-braces rule Foundation applies.
  await requireRole("admin");

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
          {TABS.map((tab) => (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-t-md px-4 py-2 text-sm font-medium text-ivory transition-colors duration-150 hover:bg-surface-2 focus:outline-none focus:ring-3 focus:ring-jade"
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {children}
    </div>
  );
}
