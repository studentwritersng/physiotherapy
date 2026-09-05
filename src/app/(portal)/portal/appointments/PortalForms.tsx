"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";

export type PortalSlotOption = { start: string; end: string };

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function toHHMM(iso: string): string {
  // Slots arrive as UTC instants; the schema wants Lagos HH:MM.
  // WAT is UTC+1 year-round — see lagosWallToUtc.
  const d = new Date(iso);
  const lagos = new Date(d.getTime() + 60 * 60_000);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(lagos.getUTCHours())}:${pad(lagos.getUTCMinutes())}`;
}

function SlotRadios({ slots, field = "startTime" }: { slots: PortalSlotOption[]; field?: string }) {
  if (slots.length === 0) {
    // Taken slots are hidden, never struck through — an empty day is a dead
    // end, not an error, so the submit stays disabled instead of failing.
    return (
      <div className="rounded-md border border-dashed border-line p-4">
        <p className="text-sm font-medium text-ivory">No free slots on this day.</p>
        <p className="mt-1 text-sm text-ivory-dim">Pick another day above.</p>
      </div>
    );
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {slots.map((slot) => (
        <li key={slot.start}>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2 text-sm transition-colors duration-150 hover:bg-surface-2">
            <input
              type="radio"
              name={field}
              value={toHHMM(slot.start)}
              required
              className="size-5 cursor-pointer accent-jade"
            />
            <span className="tabular font-medium">{toHHMM(slot.start)}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** New booking: slot radios + optional reason, posting to portalBook. */
export function PortalBookForm({
  action,
  slots,
  selected,
}: {
  action: Action;
  slots: PortalSlotOption[];
  selected: { serviceId: string; therapistId: string; dateKey: string };
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="serviceId" value={selected.serviceId} />
      <input type="hidden" name="therapistId" value={selected.therapistId} />
      <input type="hidden" name="dateKey" value={selected.dateKey} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ivory">Available slots</legend>
        <SlotRadios slots={slots} />
        {errors.startTime && <p className="text-xs font-medium text-orchid">{errors.startTime}</p>}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="portal-reason" className="text-sm font-medium text-ivory">
          Reason for visit <span className="ml-1 font-normal text-ivory-faint">(optional)</span>
        </label>
        <textarea
          id="portal-reason"
          name="reasonForVisit"
          rows={2}
          aria-invalid={errors.reasonForVisit ? true : undefined}
          className="min-h-11 rounded-md border border-line bg-surface px-3.5 py-2.5 text-base text-ivory transition-colors duration-150 placeholder:text-ivory-faint"
        />
        {errors.reasonForVisit && (
          <p className="text-xs font-medium text-orchid">{errors.reasonForVisit}</p>
        )}
      </div>

      <FormStatus state={state} />

      {selected.therapistId === "" && slots.length > 0 && (
        <p className="text-sm text-ivory-dim">
          No preference selected — a free therapist will be assigned to your slot and
          named on your confirmation.
        </p>
      )}

      <div>
        {slots.length > 0 ? (
          <SubmitButton>Confirm booking</SubmitButton>
        ) : (
          <button
            type="button"
            disabled
            title="Choose a day with free slots first"
            className="min-h-11 cursor-not-allowed rounded-md bg-surface-2 px-4 py-2 text-base font-semibold text-ivory-faint"
          >
            Confirm booking
          </button>
        )}
      </div>
    </form>
  );
}

/** Per-appointment move: slot radios scoped to the pinned therapist. */
export function PortalRescheduleForm({
  action,
  appointmentId,
  dateKey,
  slots,
}: {
  action: Action;
  appointmentId: string;
  dateKey: string;
  slots: PortalSlotOption[];
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={appointmentId} />
      <input type="hidden" name="dateKey" value={dateKey} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ivory">New time</legend>
        <SlotRadios slots={slots} />
        {errors.startTime && <p className="text-xs font-medium text-orchid">{errors.startTime}</p>}
      </fieldset>

      <FormStatus state={state} />

      <div>
        {slots.length > 0 ? (
          <SubmitButton>Move appointment</SubmitButton>
        ) : (
          <button
            type="button"
            disabled
            title="Choose a day with free slots first"
            className="min-h-11 cursor-not-allowed rounded-md bg-surface-2 px-4 py-2 text-base font-semibold text-ivory-faint"
          >
            Move appointment
          </button>
        )}
      </div>
    </form>
  );
}

/** Per-appointment cancel: reason feeds the cancelled-appointments report. */
export function PortalCancelForm({
  action,
  appointmentId,
}: {
  action: Action;
  appointmentId: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={appointmentId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`cancel-reason-${appointmentId}`} className="text-sm font-medium text-ivory">
          Why are you cancelling?
        </label>
        <textarea
          id={`cancel-reason-${appointmentId}`}
          name="reason"
          rows={2}
          required
          aria-invalid={errors.reason ? true : undefined}
          className="min-h-11 rounded-md border border-line bg-surface px-3.5 py-2.5 text-base text-ivory transition-colors duration-150 placeholder:text-ivory-faint"
        />
        {errors.reason && <p className="text-xs font-medium text-orchid">{errors.reason}</p>}
      </div>

      <FormStatus state={state} />

      <div>
        <SubmitButton>Cancel appointment</SubmitButton>
      </div>
    </form>
  );
}
