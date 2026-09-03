"use client";

import { useFormStatus } from "react-dom";

/**
 * useFormStatus reads the pending state of the enclosing form, so this needs no
 * prop threading. PRD-04 FR4 targets slow connections, and spec §6.2 makes
 * submit feedback a High-severity requirement: never a click with no response.
 */
export function SubmitButton({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "destructive";
}) {
  const { pending } = useFormStatus();

  const palette =
    variant === "destructive"
      ? "bg-orchid text-white hover:text-ivory"
      : "bg-jade text-white hover:text-ivory";

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`min-h-11 cursor-pointer rounded-md px-4 py-2 text-base font-medium transition-opacity duration-200  disabled:cursor-not-allowed disabled:opacity-60 ${palette}`}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
