"use client";

import { useActionState } from "react";
import { FormField } from "@/components/FormField";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";

export type SlotOption = { start: string; end: string; therapistId: string; therapistName: string };
export type PatientOption = { id: string; fullName: string; phone: string };

export function BookingForm({
  action,
  patients,
  slots,
  selected,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  patients: PatientOption[];
  slots: SlotOption[];
  selected: { serviceId: string; therapistId: string; dateKey: string };
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Step 1 posts to the same page via GET (see page.tsx) — these selects
          live outside this form so changing them re-renders the slot list
          without JavaScript. This form carries the chosen values as hidden
          inputs plus the slot choice and patient. */}
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
        {slots.length === 0 ? (
          <p className="text-sm text-ivory-dim">
            No free slots for this combination. Try another day, therapist, or service.
          </p>
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

      <div className="flex flex-col gap-1">
        <label htmlFor="patientId" className="text-sm font-medium text-ivory">
          Patient
        </label>
        <select
          id="patientId"
          name="patientId"
          required
          className="min-h-11 cursor-pointer rounded-md border border-line bg-surface px-3 py-2 text-base text-ivory focus:outline-none focus:ring-3 focus:ring-jade"
        >
          <option value="">Choose a patient</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName} · {p.phone}
            </option>
          ))}
        </select>
        {errors.patientId && (
          <p className="text-xs font-medium text-orchid">{errors.patientId}</p>
        )}
      </div>

      <FormField
        label="Reason for visit"
        name="reasonForVisit"
        required={false}
        error={errors.reasonForVisit}
      />

      <FormStatus state={state} />

      <div>
        <SubmitButton>Save booking</SubmitButton>
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
