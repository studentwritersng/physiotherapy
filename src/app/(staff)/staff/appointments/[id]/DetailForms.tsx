"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";

type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function RescheduleForm({
  action,
  appointmentId,
}: {
  action: FormAction;
  appointmentId: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={appointmentId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reschedule-date" className="text-sm font-medium text-ivory">
            New date
          </label>
          <input
            id="reschedule-date"
            name="dateKey"
            type="date"
            required
            aria-invalid={errors.dateKey ? true : undefined}
            className={`min-h-11 cursor-pointer rounded-md border bg-surface px-3.5 py-2.5 text-base tabular text-ivory transition-colors duration-150 ${errors.dateKey ? "border-orchid" : "border-line"}`}
          />
          {errors.dateKey && (
            <p className="text-xs font-medium text-orchid">{errors.dateKey}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="reschedule-time" className="text-sm font-medium text-ivory">
            New time
          </label>
          <input
            id="reschedule-time"
            name="startTime"
            type="time"
            required
            aria-invalid={errors.startTime ? true : undefined}
            className={`min-h-11 cursor-pointer rounded-md border bg-surface px-3.5 py-2.5 text-base tabular text-ivory transition-colors duration-150 ${errors.startTime ? "border-orchid" : "border-line"}`}
          />
          {errors.startTime && (
            <p className="text-xs font-medium text-orchid">{errors.startTime}</p>
          )}
        </div>
      </div>

      <FormStatus state={state} />

      <div>
        <SubmitButton>Move appointment</SubmitButton>
      </div>
    </form>
  );
}

export function CancelForm({ action, appointmentId }: { action: FormAction; appointmentId: string }) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={appointmentId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="cancel-reason" className="text-sm font-medium text-ivory">
          Reason
        </label>
        <textarea
          id="cancel-reason"
          name="reason"
          required
          rows={3}
          aria-describedby={errors.reason ? "cancel-reason-error" : undefined}
          aria-invalid={errors.reason ? true : undefined}
          className={`min-h-11 rounded-md border bg-surface px-3.5 py-2.5 text-base text-ivory transition-colors duration-150 placeholder:text-ivory-faint ${errors.reason ? "border-orchid" : "border-line"}`}
        />
        {errors.reason && (
          <p id="cancel-reason-error" className="text-xs font-medium text-orchid">
            {errors.reason}
          </p>
        )}
      </div>

      <FormStatus state={state} />

      <div>
        <SubmitButton variant="destructive">Cancel appointment</SubmitButton>
      </div>
    </form>
  );
}
