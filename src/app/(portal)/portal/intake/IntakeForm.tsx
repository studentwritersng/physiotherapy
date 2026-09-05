"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";
import type { IntakeForm as IntakeRow } from "@/generated/prisma/client";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

type Initial = Pick<
  IntakeRow,
  | "reasonForVisit"
  | "medicalHistory"
  | "previousInjuries"
  | "previousSurgeries"
  | "currentMedications"
  | "allergies"
  | "referringDoctor"
>;

const FIELDS: { name: keyof Initial; label: string; hint?: string }[] = [
  { name: "reasonForVisit", label: "Reason for visit" },
  { name: "medicalHistory", label: "Medical history" },
  { name: "previousInjuries", label: "Previous injuries" },
  { name: "previousSurgeries", label: "Previous surgeries" },
  { name: "currentMedications", label: "Current medications" },
  { name: "allergies", label: "Allergies" },
  { name: "referringDoctor", label: "Referring doctor", hint: "optional" },
];

/**
 * Flat prefilled intake form. All clinical fields are optional — only the
 * consent checkbox is required (HTML `required` for UX, Zod literal for
 * enforcement). Values arrive via defaultValue so resubmission edits the
 * latest row instead of starting blank.
 */
export function IntakeForm({
  action,
  initial,
  consentText,
}: {
  action: Action;
  initial: Initial | null;
  consentText: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {FIELDS.map((field) => (
        <div key={field.name} className="flex flex-col gap-1.5">
          <label htmlFor={`intake-${field.name}`} className="text-sm font-medium text-ivory">
            {field.label}
            {field.hint && <span className="ml-1 font-normal text-ivory-faint">({field.hint})</span>}
          </label>
          <textarea
            id={`intake-${field.name}`}
            name={field.name}
            rows={2}
            defaultValue={initial?.[field.name] ?? ""}
            aria-invalid={errors[field.name] ? true : undefined}
            className="min-h-11 rounded-md border border-line bg-surface px-3.5 py-2.5 text-base text-ivory transition-colors duration-150 placeholder:text-ivory-faint"
          />
          {errors[field.name] && (
            <p className="text-xs font-medium text-orchid">{errors[field.name]}</p>
          )}
        </div>
      ))}

      <label
        htmlFor="intake-consent"
        className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-4"
      >
        <input
          id="intake-consent"
          type="checkbox"
          name="consent"
          value="on"
          required
          aria-invalid={errors.consent ? true : undefined}
          className="mt-0.5 size-5 shrink-0 cursor-pointer accent-jade"
        />
        <span className="text-sm text-ivory">{consentText}</span>
      </label>
      {errors.consent && <p className="text-xs font-medium text-orchid">{errors.consent}</p>}

      <FormStatus state={state} />

      <div>
        <SubmitButton>Save intake form</SubmitButton>
      </div>
    </form>
  );
}
