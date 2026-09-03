"use client";

import { useActionState } from "react";
import { FormField } from "@/components/FormField";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";
import type { ClinicSettingsView } from "@/server/services/clinic-settings";

export function SettingsForm({
  settings,
  action,
}: {
  settings: ClinicSettingsView;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Clinic name"
          name="clinicName"
          defaultValue={settings.clinicName}
          error={errors.clinicName}
        />
        <FormField
          label="Tagline"
          name="tagline"
          required={false}
          defaultValue={settings.tagline ?? ""}
          error={errors.tagline}
        />
        <FormField
          label="Logo URL"
          name="logoUrl"
          type="url"
          required={false}
          hint="Paste a link. File upload arrives with patient documents."
          defaultValue={settings.logoUrl ?? ""}
          error={errors.logoUrl}
        />
        <FormField
          label="Address"
          name="address"
          required={false}
          defaultValue={settings.address ?? ""}
          error={errors.address}
        />
        <FormField
          label="Phone"
          name="contactPhone"
          type="tel"
          required={false}
          tabular
          defaultValue={settings.contactPhone ?? ""}
          error={errors.contactPhone}
        />
        <FormField
          label="WhatsApp"
          name="contactWhatsapp"
          type="tel"
          required={false}
          tabular
          defaultValue={settings.contactWhatsapp ?? ""}
          error={errors.contactWhatsapp}
        />
        <FormField
          label="Email"
          name="contactEmail"
          type="email"
          required={false}
          defaultValue={settings.contactEmail ?? ""}
          error={errors.contactEmail}
        />
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium text-ivory">Booking rules</legend>
        <FormField
          label="Booking lead time (hours)"
          name="bookingLeadTimeHours"
          type="number"
          min={0}
          max={168}
          tabular
          hint="0 means same-day booking is allowed."
          defaultValue={settings.bookingLeadTimeHours}
          error={errors.bookingLeadTimeHours}
        />
        <FormField
          label="Reschedule cutoff (hours)"
          name="rescheduleCutoffHours"
          type="number"
          min={0}
          max={168}
          tabular
          defaultValue={settings.rescheduleCutoffHours}
          error={errors.rescheduleCutoffHours}
        />
        <FormField
          label="Cancellation cutoff (hours)"
          name="cancellationCutoffHours"
          type="number"
          min={0}
          max={168}
          tabular
          defaultValue={settings.cancellationCutoffHours}
          error={errors.cancellationCutoffHours}
        />
      </fieldset>

      <FormStatus state={state} />

      <div>
        <SubmitButton>Save clinic details</SubmitButton>
      </div>
    </form>
  );
}
