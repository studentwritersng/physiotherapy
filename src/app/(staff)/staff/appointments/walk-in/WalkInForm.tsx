"use client";

import { useActionState } from "react";
import { FormField } from "@/components/FormField";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";

export type WalkInMatch = { id: string; fullName: string; phone: string } | null;

export function WalkInConfirm({
  action,
  phone,
  match,
  serviceId,
  therapistId,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  phone: string;
  match: WalkInMatch;
  serviceId: string;
  therapistId: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="therapistId" value={therapistId} />

      {match ? (
        <>
          <input type="hidden" name="patientId" value={match.id} />
          <input type="hidden" name="fullName" value={match.fullName} />
          <p className="text-sm text-ivory">
            <span className="font-semibold">{match.fullName}</span>
            <span className="tabular ml-2 text-ivory-dim">{match.phone}</span>
          </p>
          {errors.patientId && (
            <p className="text-xs font-medium text-orchid">{errors.patientId}</p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-ivory-dim">
            No record for <span className="tabular font-medium text-ivory">{phone}</span> — enter a
            name to start a new record.
          </p>
          <FormField
            label="Patient name"
            name="fullName"
            autoComplete="name"
            error={errors.fullName}
          />
        </>
      )}

      {errors.therapistId && (
        <p className="text-xs font-medium text-orchid">{errors.therapistId}</p>
      )}
      {errors.serviceId && (
        <p className="text-xs font-medium text-orchid">{errors.serviceId}</p>
      )}

      <FormStatus state={state} />

      <div>
        <SubmitButton>Check in</SubmitButton>
      </div>
    </form>
  );
}
