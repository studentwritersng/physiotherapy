"use client";

import { useActionState } from "react";
import { FormField } from "@/components/FormField";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";

export type PublicSlotOption = {
  start: string;
  end: string;
  therapistId: string;
  therapistName: string;
};

/**
 * The final step of the public booking flow only: slot radios + visitor
 * details + submit. Service, therapist and day arrive as props from the page,
 * which accumulates them in the URL. On success the action redirects to the
 * reference-gated confirm page, so no success banner is needed here.
 */
export function PublicBookFlow({
  action,
  slots,
  selected,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  slots: PublicSlotOption[];
  selected: { serviceId: string; therapistId: string; dateKey: string };
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};
  // When the chosen day has no free slots, submitting would fail on the
  // missing startTime radio every time — a dead end, not an error to display.
  const canBook = slots.length > 0;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="serviceId" value={selected.serviceId} />
      <input type="hidden" name="dateKey" value={selected.dateKey} />
      <input type="hidden" name="therapistId" value={selected.therapistId} />
      <input
        type="hidden"
        name="noPreference"
        value={selected.therapistId === "" ? "true" : "false"}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ivory">Available slots</legend>
        {!canBook ? (
          <div className="rounded-md border border-dashed border-line p-4">
            <p className="text-sm font-medium text-ivory">No free slots on this day.</p>
            <p className="mt-1 text-sm text-ivory-dim">
              This day is fully booked or outside working hours. Pick another day above.
            </p>
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {slots.map((slot) => (
              <li key={`${slot.start}+${slot.therapistId}`}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2 text-sm transition-colors duration-150 hover:bg-surface-2">
                  <input
                    type="radio"
                    name="startTime"
                    value={toHHMM(slot.start)}
                    required
                    className="size-5 cursor-pointer accent-jade"
                  />
                  <span className="tabular font-medium">{toHHMM(slot.start)}</span>
                  <span className="text-xs text-ivory-faint">{slot.therapistName}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {errors.startTime && (
          <p className="text-xs font-medium text-orchid">{errors.startTime}</p>
        )}
      </fieldset>

      <FormField
        label="Full name"
        name="fullName"
        autoComplete="name"
        required
        error={errors.fullName}
      />
      <FormField
        label="Phone number"
        name="phone"
        type="tel"
        autoComplete="tel"
        required
        hint="A Nigerian mobile number, e.g. 0803 123 4567."
        error={errors.phone}
      />
      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required={false}
        error={errors.email}
      />

      <div className="flex cursor-pointer items-center gap-2">
        <input
          id="isNewPatient"
          name="isNewPatient"
          type="checkbox"
          value="true"
          defaultChecked
          className="size-5 cursor-pointer accent-jade"
        />
        <label htmlFor="isNewPatient" className="cursor-pointer text-sm font-medium text-ivory">
          This is my first visit to the clinic
        </label>
      </div>
      {errors.isNewPatient && (
        <p className="text-xs font-medium text-orchid">{errors.isNewPatient}</p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="reasonForVisit" className="text-sm font-medium text-ivory">
          Reason for visit <span className="ml-1 font-normal text-ivory-faint">(optional)</span>
        </label>
        <textarea
          id="reasonForVisit"
          name="reasonForVisit"
          rows={3}
          aria-invalid={errors.reasonForVisit ? true : undefined}
          className={[
            "min-h-11 rounded-md border bg-surface px-3.5 py-2.5 text-base text-ivory",
            "transition-colors duration-150 placeholder:text-ivory-faint",
            errors.reasonForVisit ? "border-orchid" : "border-line",
          ].join(" ")}
        />
        {errors.reasonForVisit && (
          <p className="text-xs font-medium text-orchid">{errors.reasonForVisit}</p>
        )}
      </div>

      <FormStatus state={state} />

      <div>
        {canBook ? (
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

function toHHMM(iso: string): string {
  // Slots arrive as UTC instants; the booking schema wants Lagos HH:MM.
  // WAT is UTC+1 year-round, so +60 minutes. See lagosWallToUtc for why this
  // hardcodes the offset.
  const d = new Date(iso);
  const lagos = new Date(d.getTime() + 60 * 60_000);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(lagos.getUTCHours())}:${pad(lagos.getUTCMinutes())}`;
}
