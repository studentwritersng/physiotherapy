"use client";

import { useEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "tp-theme";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function subscribeTheme(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener("tp-theme-change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("tp-theme-change", onChange);
  };
}

/**
 * Single source of truth is localStorage. The blocking inline script in the
 * root layout applies it before first paint (no flash); this subscription
 * reconciles on mount (heals any case where the script missed) and follows
 * cross-tab changes. Previously the toggle read storage once into useState,
 * so any divergence between DOM and state — missed script, another tab —
 * persisted until the next click.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, readStoredTheme, () => "light");

  // Re-apply on every change, including the first mount: if the pre-paint
  // script ran, this is a no-op; if it didn't, this heals the mismatch.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode etc. — still apply to this tab's DOM.
    }
    document.documentElement.setAttribute("data-theme", next);
    // Same-tab listeners don't fire `storage` events for their own writes.
    window.dispatchEvent(new Event("tp-theme-change"));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
      title="Toggle theme"
      className="flex size-11 cursor-pointer items-center justify-center rounded-md border border-line bg-surface text-ivory-dim transition-colors duration-150 hover:text-ivory"
    >
      {theme === "light" ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="size-[17px]"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="size-[17px]"
          aria-hidden="true"
        >
          <path d="M20 14.5A8.5 8.5 0 119.5 4a7 7 0 0010.5 10.5z" />
        </svg>
      )}
    </button>
  );
}
