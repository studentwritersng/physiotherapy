"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";

const FIELDS: { name: string; label: string; hint: string }[] = [
  { name: "subjective", label: "Subjective", hint: "Default: Subjective" },
  { name: "objective", label: "Objective", hint: "Default: Objective" },
  {
    name: "treatmentProvided",
    label: "Treatment provided",
    hint: "Default: Treatment provided",
  },
  {
    name: "patientResponse",
    label: "Patient response",
    hint: "Default: Patient response",
  },
  {
    name: "exercisesInstructions",
    label: "Exercises & instructions",
    hint: "Default: Exercises & instructions",
  },
  { name: "nextPlan", label: "Next plan", hint: "Default: Next plan" },
];

/**
 * Relabels for the six SOAP note fields. Every input is optional: leaving one
 * blank keeps the SOAP default on the note form, so the clinic can rename a
 * single field without touching the other five.
 */
export function SoapLabelsForm({
  initial,
  action,
}: {
  initial: Record<string, string | null>;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.name} className="flex flex-col gap-1">
            <label htmlFor={`soap-${field.name}`} className="text-sm font-medium text-ivory">
              {field.label}
            </label>
            <input
              id={`soap-${field.name}`}
              name={field.name}
              type="text"
              maxLength={60}
              defaultValue={initial[field.name] ?? ""}
              placeholder={field.hint}
              aria-invalid={errors[field.name] ? true : undefined}
              className="min-h-11 rounded-md border border-line bg-surface px-3 py-2 text-base text-ivory placeholder:text-ivory-faint focus:outline-none focus:ring-3 focus:ring-jade"
            />
            {errors[field.name] && (
              <p className="text-xs font-medium text-orchid">{errors[field.name]}</p>
            )}
          </div>
        ))}
      </div>

      <FormStatus state={state} />

      <div>
        <SubmitButton>Save note labels</SubmitButton>
      </div>
    </form>
  );
}
