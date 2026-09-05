"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";

export function LinkCandidateForm({
  action,
  userId,
  patientId,
  patientLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  userId: string;
  patientId: string;
  patientLabel: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="patientId" value={patientId} />
      <p className="text-sm text-ivory">{patientLabel}</p>
      <FormStatus state={state} />
      <div>
        <SubmitButton>Link</SubmitButton>
      </div>
    </form>
  );
}
