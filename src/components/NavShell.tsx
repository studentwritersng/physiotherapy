import Link from "next/link";
import type { NavLink } from "@/lib/nav";
import type { SessionUser } from "@/server/auth/session";
import { LogoutButton } from "./LogoutButton";
import { ThemeToggle } from "./ThemeToggle";

const ROLE_LABELS: Record<SessionUser["role"], string> = {
  admin: "Administrator",
  therapist: "Therapist",
  receptionist: "Front desk",
  patient: "Patient",
};

export function NavShell({
  user,
  links,
  children,
}: {
  user: SessionUser;
  links: NavLink[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-line bg-gradient-to-b from-ink-2 to-ink md:w-64 md:border-b-0 md:border-r">
        <div className="p-4">
          <p className="font-display text-lg font-semibold text-ivory">TetaPhysio</p>
          <p className="mt-1 truncate text-sm text-ivory-dim">{user.name}</p>
          <p className="text-xs uppercase tracking-[0.14em] text-ivory-faint">
            {ROLE_LABELS[user.role]}
          </p>
        </div>

        <nav aria-label="Main navigation" className="px-2 pb-4">
          <ul className="flex flex-col gap-1">
            {links.map((link) =>
              link.available ? (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="block cursor-pointer rounded-md px-3 py-2.5 text-sm font-medium text-ivory-dim transition-colors duration-150 hover:bg-surface hover:text-ivory"
                  >
                    {link.label}
                  </Link>
                </li>
              ) : (
                <li key={link.href}>
                  {/* Rendered but disabled, so the shape of the finished app is
                      visible without pretending the page exists. */}
                  <span
                    aria-disabled="true"
                    title={`Coming in ${link.note}`}
                    className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium text-ivory-faint"
                  >
                    {link.label}
                    <span className="ml-2 rounded bg-track px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                      soon
                    </span>
                  </span>
                </li>
              ),
            )}
          </ul>
        </nav>

        <div className="flex items-center justify-between border-t border-line p-4">
          <LogoutButton />
          <ThemeToggle />
        </div>
      </aside>

      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
