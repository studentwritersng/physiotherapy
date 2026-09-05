"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export type ProfileInitial = {
  fullName: string;
  phone: string;
  email: string | null;
  dateOfBirth: string;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  basicMedicalInfo: string | null;
};

const TEXT_FIELDS: { name: Exclude<keyof ProfileInitial, "dateOfBirth">; label: string; hint?: string; inputMode?: "tel" | "email" }[] = [
  { name: "fullName", label: "Full name" },
  { name: "phone", label: "Phone number", inputMode: "tel" },
  { name: "email", label: "Email address", inputMode: "email" },
  { name: "address", label: "Address", hint: "optional" },
  { name: "emergencyContactName", label: "Emergency contact name", hint: "optional" },
  {
    name: "emergencyContactPhone",
    label: "Emergency contact phone",
    hint: "optional",
    inputMode: "tel",
  },
  { name: "basicMedicalInfo", label: "Basic medical info", hint: "optional" },
];

/**
 * Flat prefilled profile form. Email is required (HTML `required` for UX,
 * Zod + service parse for enforcement). Values arrive via defaultValue so
 * the patient edits their current record instead of starting blank.
 */
export function ProfileForm({ action, initial }: { action: Action; initial: ProfileInitial }) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {TEXT_FIELDS.map((field) => (
        <div key={field.name} className="flex flex-col gap-1.5">
          <label htmlFor={`profile-${field.name}`} className="text-sm font-medium text-ivory">
            {field.label}
            {field.hint && <span className="ml-1 font-normal text-ivory-faint">({field.hint})</span>}
          </label>
          <input
            id={`profile-${field.name}`}
            name={field.name}
            type={field.name === "email" ? "email" : "text"}
            required={field.name === "fullName" || field.name === "phone" || field.name === "email"}
            inputMode={field.inputMode}
            defaultValue={initial[field.name] ?? ""}
            aria-invalid={errors[field.name] ? true : undefined}
            className="min-h-11 rounded-md border border-line bg-surface px-3.5 py-2.5 text-base text-ivory transition-colors duration-150 placeholder:text-ivory-faint"
          />
          {errors[field.name] && (
            <p className="text-xs font-medium text-orchid">{errors[field.name]}</p>
          )}
        </div>
      ))}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="profile-dateOfBirth" className="text-sm font-medium text-ivory">
          Date of birth <span className="ml-1 font-normal text-ivory-faint">(optional)</span>
        </label>
        <input
          id="profile-dateOfBirth"
          name="dateOfBirth"
          type="date"
          defaultValue={initial.dateOfBirth}
          aria-invalid={errors.dateOfBirth ? true : undefined}
          className="min-h-11 cursor-pointer rounded-md border border-line bg-surface px-3.5 py-2.5 text-base text-ivory transition-colors duration-150"
        />
        {errors.dateOfBirth && (
          <p className="text-xs font-medium text-orchid">{errors.dateOfBirth}</p>
        )}
      </div>

      <FormStatus state={state} />

      <div>
        <SubmitButton>Save profile</SubmitButton>
      </div>
    </form>
  );
}
