import Link from "next/link";
import type { NavLink } from "@/lib/nav";
import type { SessionUser } from "@/server/auth/session";
import { LogoutButton } from "./LogoutButton";

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
      <aside className="border-b border-gray-200 bg-white md:w-64 md:border-b-0 md:border-r">
        <div className="p-4">
          <p className="text-lg font-semibold text-gray-900">TetaPhysio</p>
          <p className="mt-1 truncate text-sm text-gray-700">{user.name}</p>
          <p className="text-xs text-gray-500">{ROLE_LABELS[user.role]}</p>
        </div>

        <nav aria-label="Main navigation" className="px-2 pb-4">
          <ul className="flex flex-col gap-1">
            {links.map((link) =>
              link.available ? (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="block rounded-md px-3 py-2 text-sm text-gray-800 hover:bg-gray-100"
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
                    className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-gray-400"
                  >
                    {link.label}
                    <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase">
                      soon
                    </span>
                  </span>
                </li>
              ),
            )}
          </ul>
        </nav>

        <div className="border-t border-gray-200 p-4">
          <LogoutButton />
        </div>
      </aside>

      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
