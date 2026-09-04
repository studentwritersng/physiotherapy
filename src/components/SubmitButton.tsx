"use client";

import { useFormStatus } from "react-dom";

/**
 * useFormStatus reads the pending state of the enclosing form, so this needs no
 * prop threading. PRD-04 FR4 targets slow connections, and spec §6.2 makes
 * submit feedback a High-severity requirement: never a click with no response.
 *
 * Text color per variant:
 * - primary (jade): text-btn-ink (#08201A) — the mockup's design file uses
 *   `--btn-ink` on jade and that passes WCAG AA in both themes.
 * - secondary (sky): sky-text on a sky-dim fill — an informational action
 *   that should not compete with the primary commit button. sky-text is 6.03:1
 *   on light; the dim fill only raises it.
 * - destructive: text-white on `--color-destructive` (#C2185B) — the lighter
 *   orchid fails white-on-color contrast in light mode.
 */
export function SubmitButton({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "destructive";
}) {
  const { pending } = useFormStatus();

  const palette =
    variant === "destructive"
      ? "bg-destructive text-white"
      : variant === "secondary"
        ? "bg-sky-dim text-sky-text"
        : "bg-jade text-btn-ink";

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`min-h-11 cursor-pointer rounded-md px-4 py-2 text-base font-semibold transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${palette}`}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}