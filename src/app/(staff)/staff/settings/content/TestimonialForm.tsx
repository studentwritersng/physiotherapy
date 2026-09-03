"use client";

import { useActionState } from "react";
import { FormField } from "@/components/FormField";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";

export function TestimonialForm({
  action,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField
        label="Patient name"
        name="patientName"
        hint="Use initials or a first name only — a full name needs the patient's consent."
        error={errors.patientName}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="content" className="text-sm font-medium text-ivory">
          Testimonial
        </label>
        <textarea
          id="content"
          name="content"
          rows={4}
          aria-invalid={errors.content ? true : undefined}
          className="rounded-md border border-line bg-surface px-3 py-2 text-base focus:outline-none focus:ring-3 focus:ring-jade"
        />
        {errors.content && (
          <p className="text-xs font-medium text-orchid">{errors.content}</p>
        )}
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="published"
          value="true"
          className="size-5 cursor-pointer accent-jade focus:outline-none focus:ring-3 focus:ring-jade"
        />
        Publish immediately
      </label>

      <FormStatus state={state} />

      <div>
        <SubmitButton>Add testimonial</SubmitButton>
      </div>
    </form>
  );
}