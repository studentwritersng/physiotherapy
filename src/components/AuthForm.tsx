"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { FormField, type FormFieldProps } from "./FormField";

export type AuthFormProps = {
  title: string;
  subtitle?: string;
  endpoint: string;
  fields: FormFieldProps[];
  submitLabel: string;
  footer?: ReactNode;
};

export function AuthForm({
  title,
  subtitle,
  endpoint,
  fields,
  submitLabel,
  footer,
}: AuthFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const body = Object.fromEntries(new FormData(event.currentTarget));

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string; redirectTo?: string };

      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      // Server decides the destination, so the client cannot land somewhere it
      // is not allowed to be.
      router.push(data.redirectTo ?? "/");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        {fields.map((field) => (
          <FormField key={field.name} {...field} />
        ))}

        {/* aria-live so a screen reader announces the error without a focus move. */}
        <div aria-live="polite" role="status">
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-700 px-4 py-2 text-base font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-60"
        >
          {submitting ? "Please wait…" : submitLabel}
        </button>
      </form>

      {footer && <div className="mt-4 text-sm text-gray-600">{footer}</div>}
    </div>
  );
}
