"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Mobile navigation for the public site. Below lg the inline header links
 * overflow a 375px viewport, so they collapse behind a hamburger that opens a
 * full-page overlay: staggered link entries, the booking CTA, and a close
 * button at the end of the list. Escape dismisses; body scroll locks while
 * open. Entry animation is pure CSS, so prefers-reduced-motion is covered by
 * the global rule in globals.css.
 */
export function MobileMenu({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open ]);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-11 cursor-pointer items-center justify-center rounded-md text-ivory transition-colors duration-150 hover:bg-surface-2 lg:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden="true"
          className="size-6"
        >
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      {open && (
        <div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className="fixed inset-0 z-50 flex flex-col bg-ink lg:hidden"
        >
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
            <span className="font-display text-xl font-semibold text-ivory">Menu</span>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="inline-flex size-11 cursor-pointer items-center justify-center rounded-md text-ivory transition-colors duration-150 hover:bg-surface-2"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                aria-hidden="true"
                className="size-6"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <nav aria-label="Mobile" className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-1 px-4 pb-8">
            <ul className="flex flex-col gap-1">
              {links.map((item, i) => (
                <li
                  key={item.href}
                  className="menu-item"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="font-display flex min-h-14 cursor-pointer items-center rounded-md px-2 text-3xl font-medium text-ivory transition-colors duration-150 hover:bg-surface-2 hover:text-jade-text"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="menu-item mt-6 flex flex-col gap-3" style={{ animationDelay: `${links.length * 60}ms` }}>
              <Link
                href="/book"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md bg-jade px-6 py-3 text-base font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
              >
                Book appointment
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-line-strong px-6 py-3 text-base font-medium text-ivory transition-colors duration-150 hover:bg-surface-2"
              >
                Close menu
              </button>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
