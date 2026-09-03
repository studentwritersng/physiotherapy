"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { NavLink } from "@/lib/nav";
import type { SessionUser } from "@/server/auth/session";
import { LogoutButton } from "./LogoutButton";
import { ThemeToggle } from "./ThemeToggle";
import { SidebarIcon } from "./SidebarIcon";

const ROLE_LABELS: Record<SessionUser["role"], string> = {
  admin: "Administrator",
  therapist: "Therapist",
  receptionist: "Front desk",
  patient: "Patient",
};

/**
 * Floating-card layout (glassy command-palette recipe). Three independent
 * cards — topbar, sidebar, content — on a layered ground, with the visible
 * spacing between them defined by the --layout-pad and --layout-gap tokens.
 * `aria-expanded` on the collapse button controls the sidebar width.
 */
export function NavShell({
  user,
  links,
  collapsed: initialCollapsed = false,
  children,
}: {
  user: SessionUser;
  links: NavLink[];
  collapsed?: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  // Restore the persisted choice after mount (reading localStorage during
  // render would break SSR hydration, so the first paint uses the prop).
  useEffect(() => {
    try {
      if (window.localStorage.getItem("tp-sidebar-collapsed") === "1") {
        setCollapsed(true);
      }
    } catch {
      // Private mode etc. — expanded sidebar is the safe default.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("tp-sidebar-collapsed", next ? "1" : "0");
      } catch {
        // Non-fatal.
      }
      return next;
    });
  }

  return (
    <div className="tp-shell min-h-screen" data-collapsed={collapsed ? "true" : "false"}>
      {/* Topbar — horizontal card spanning the top */}
      <header className="tp-topbar rounded-lg border border-glass-border bg-glass shadow-glass backdrop-blur-md">
        <div className="flex h-full items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="flex size-11 cursor-pointer items-center justify-center rounded-md border border-line bg-surface text-ivory-dim transition-colors duration-150 hover:text-ivory"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="size-[18px]"
              >
                {collapsed ? (
                  <path d="M9 6l6 6-6 6" />
                ) : (
                  <path d="M15 6l-6 6 6 6" />
                )}
              </svg>
            </button>
            <Link
              href={user.role === "patient" ? "/portal" : "/staff"}
              className="font-display text-lg font-semibold tracking-tight text-ivory"
            >
              TetaPhysio
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-ivory-dim md:inline">{user.name}</span>
            <span className="hidden rounded bg-surface-2 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ivory-faint md:inline">
              {ROLE_LABELS[user.role]}
            </span>
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Sidebar — vertical card on the left, icon-only when collapsed (`md:hidden lg:block`) */}
      <aside className="tp-sidebar rounded-lg border border-glass-border bg-glass shadow-glass backdrop-blur-md">
        <nav aria-label="Main navigation" className="flex h-full flex-col p-3">
          <ul className="flex flex-1 flex-col gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-ivory-dim transition-colors duration-150 hover:bg-surface hover:text-ivory"
                  title={link.label}
                >
                  <SidebarIcon
                    href={link.href}
                    available={link.available}
                    className="size-[18px] flex-none"
                  />
                  {link.available ? (
                    <span className="sidebar-label truncate">{link.label}</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="sidebar-label truncate text-ivory-faint">
                        {link.label}
                      </span>
                      <span className="sidebar-soon rounded bg-track px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ivory-faint">
                        soon
                      </span>
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Main content — the third floating card, takes the remaining grid cell */}
      <main className="tp-main rounded-lg border border-glass-border bg-glass shadow-glass backdrop-blur-md">
        <div className="h-full p-6 md:p-8">{children}</div>
      </main>
    </div>
  );
}
