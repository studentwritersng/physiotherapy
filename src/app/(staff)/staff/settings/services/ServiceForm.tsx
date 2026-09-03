"use client";

import { useActionState } from "react";
import { FormField } from "@/components/FormField";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";

export type ServiceFormValues = {
  id?: string;
  name: string;
  description: string;
  defaultDurationMinutes: number;
  defaultPrice: string;
  imageUrl: string;
};

export function ServiceForm({
  action,
  submitLabel,
  values,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  values?: ServiceFormValues;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {values?.id && <input type="hidden" name="id" value={values.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Service name"
          name="name"
          defaultValue={values?.name ?? ""}
          error={errors.name}
        />
        <FormField
          label="Image URL"
          name="imageUrl"
          type="url"
          required={false}
          defaultValue={values?.imageUrl ?? ""}
          error={errors.imageUrl}
        />
        <FormField
          label="Duration (minutes)"
          name="defaultDurationMinutes"
          type="number"
          min={5}
          max={480}
          step={5}
          tabular
          defaultValue={values?.defaultDurationMinutes ?? 45}
          error={errors.defaultDurationMinutes}
        />
        <FormField
          label="Price (₦)"
          name="defaultPrice"
          tabular
          hint="Naira, e.g. 15000 or 15000.00"
          defaultValue={values?.defaultPrice ?? "0"}
          error={errors.defaultPrice}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium text-ivory">
          Description <span className="font-normal text-ivory-faint">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={values?.description ?? ""}
          className="rounded-md border border-line bg-surface px-3 py-2 text-base focus:outline-none focus:ring-3 focus:ring-jade"
        />
      </div>

      <FormStatus state={state} />

      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}