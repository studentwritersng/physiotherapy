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
  idPrefix,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  values?: ServiceFormValues;
  idPrefix?: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};
  // The description textarea is hand-rolled rather than a FormField, so it
  // takes the same prefix manually. Names stay unprefixed everywhere: the
  // Server Action reads formData by name.
  const descriptionId = idPrefix ? `${idPrefix}-description` : "description";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {values?.id && <input type="hidden" name="id" value={values.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Service name"
          name="name"
          defaultValue={values?.name ?? ""}
          error={errors.name}
          idPrefix={idPrefix}
        />
        <FormField
          label="Image URL"
          name="imageUrl"
          type="url"
          required={false}
          defaultValue={values?.imageUrl ?? ""}
          error={errors.imageUrl}
          idPrefix={idPrefix}
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
          idPrefix={idPrefix}
        />
        <FormField
          label="Price (₦)"
          name="defaultPrice"
          tabular
          hint="Naira, e.g. 15000 or 15000.00"
          defaultValue={values?.defaultPrice ?? "0"}
          error={errors.defaultPrice}
          idPrefix={idPrefix}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={descriptionId} className="text-sm font-medium text-ivory">
          Description <span className="font-normal text-ivory-faint">(optional)</span>
        </label>
        <textarea
          id={descriptionId}
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