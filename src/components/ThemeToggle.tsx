"use client";

import { useState } from "react";

type Theme = "light" | "dark";

/**
 * Reads the stored choice lazily on the client. The initial `data-theme` is set
 * before first paint by a blocking inline script in the root layout, so this
 * component never flashes and never calls setState inside an effect.
 *
 * The server render always starts from "light" (the layout's default), and the
 * first client render corrects it from localStorage, so hydration stays in sync.
 */
function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("tp-theme");
  return stored === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("tp-theme", next);
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
