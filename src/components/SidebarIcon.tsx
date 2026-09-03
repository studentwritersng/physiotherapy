"use client";

import type { SVGProps } from "react";

/**
 * Hand-rolled Lucide-style icons, one per destination in src/lib/nav.ts. The
 * "soon" icon is used when a destination's sub-project has not shipped, so
 * the user sees an architectural placeholder rather than a missing icon.
 *
 * The href-based mapping keeps the icon set aligned with the nav model: a new
 * nav entry needs an icon here in one place.
 */
export function SidebarIcon({
  href,
  available,
  ...props
}: { href: string; available: boolean } & SVGProps<SVGSVGElement>) {
  const path = iconPathFor(href, available);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {path}
    </svg>
  );
}

function iconPathFor(href: string, _available: boolean): React.ReactNode {
  // Every destination gets its own icon regardless of availability — the
  // "soon" badge in NavShell already communicates unshipped state, so reusing
  // one dashed-clock icon for all of them just looks like missing icons.
  void _available;

  if (href === "/staff" || href === "/portal") {
    // Dashboard — a 2x2 grid of tiles
    return (
      <>
        <rect x="3" y="3" width="7" height="9" rx="1.2" />
        <rect x="14" y="3" width="7" height="5" rx="1.2" />
        <rect x="14" y="12" width="7" height="9" rx="1.2" />
        <rect x="3" y="16" width="7" height="5" rx="1.2" />
      </>
    );
  }

  if (href.startsWith("/staff/schedule")) {
    // Calendar / schedule
    return (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
        <path d="M8 3v4M16 3v4" />
      </>
    );
  }

  if (href.startsWith("/staff/patients")) {
    // People / patient list
    return (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3 20c0-3.2 2.7-5.5 6-5.5s6 2.3 6 5.5" />
        <path d="M14.5 20c0-2.2 1.7-3.5 2.5-3.5s2.5 1.3 2.5 3.5" />
      </>
    );
  }

  if (href.startsWith("/staff/appointments")) {
    // Calendar with check — appointments
    return (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
        <path d="M8 3v4M16 3v4" />
        <path d="M9 14l2 2 4-4" />
      </>
    );
  }

  if (href.startsWith("/staff/payments") || href.startsWith("/portal/payments")) {
    // Wallet / payments
    return (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
        <circle cx="17" cy="14.5" r="1.2" fill="currentColor" />
      </>
    );
  }

  if (href === "/staff/settings" || href.startsWith("/staff/settings/")) {
    return (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </>
    );
  }

  if (href.startsWith("/staff/reports")) {
    return (
      <>
        <path d="M3 3v18h18" />
        <path d="M7 14l3-3 3 3 5-6" />
        <path d="M14 8h4v4" />
      </>
    );
  }

  if (href.startsWith("/staff/staff")) {
    // Badge / ID
    return (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="11" r="2.2" />
        <path d="M14 10h4M14 14h4" />
      </>
    );
  }

  if (href.startsWith("/portal/appointments")) {
    return (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
        <path d="M8 3v4M16 3v4" />
        <path d="M9 14l2 2 4-4" />
      </>
    );
  }

  if (href.startsWith("/portal/profile")) {
    return (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4 21c0-3.6 3.6-6.5 8-6.5s8 2.9 8 6.5" />
      </>
    );
  }

  // Fallback — a small dot, never an empty icon
  return <circle cx="12" cy="12" r="2" fill="currentColor" />;
}
