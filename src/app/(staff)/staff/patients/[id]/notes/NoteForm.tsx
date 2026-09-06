"use client";

import { useActionState, useState } from "react";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";
import type { SessionNote } from "@/generated/prisma/client";
import type { SoapKey } from "@/server/services/clinical";
import { TIMEZONE } from "@/lib/constants";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

type AppointmentOption = {
  id: string;
  scheduledStart: Date;
  hasNote: boolean;
};

const FIELD_ORDER: SoapKey[] = [
  "subjective",
  "objective",
  "treatmentProvided",
  "patientResponse",
  "exercisesInstructions",
  "nextPlan",
];

function formatSlot(date: Date): string {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

type Existing = Pick<
  SessionNote,
  | "appointmentId"
  | "subjective"
  | "objective"
  | "treatmentProvided"
  | "patientResponse"
  | "exercisesInstructions"
  | "nextPlan"
>;

/**
 * Session-note form under #notes. One note per appointment: picking an
 * appointment with an existing note remounts the fields with that note's
 * values, so resubmission edits rather than duplicates. All six fields are
 * optional (in-progress notes save partial); labels come from the clinic's
 * SOAP relabels with SOAP defaults as fallback.
 */
export function NoteForm({
  action,
  patientId,
  appointments,
  existingNotes,
  labels,
}: {
  action: Action;
  patientId: string;
  appointments: AppointmentOption[];
  existingNotes: Existing[];
  labels: Record<SoapKey, string>;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const [appointmentId, setAppointmentId] = useState(appointments[0]?.id ?? "");
  const errors = state.ok === false ? state.fieldErrors : {};
  const current = existingNotes.find((n) => n.appointmentId === appointmentId) ?? null;

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="patientId" value={patientId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="note-appointment" className="text-sm font-medium text-ivory">
          Appointment
        </label>
        <select
          id="note-appointment"
          name="appointmentId"
          value={appointmentId}
          onChange={(e) => setAppointmentId(e.target.value)}
          required
          className="min-h-11 cursor-pointer rounded-md border border-line bg-surface px-3.5 py-2.5 text-base text-ivory"
        >
          {appointments.length === 0 && <option value="">No appointments yet</option>}
          {appointments.map((a) => (
            <option key={a.id} value={a.id}>
              {formatSlot(a.scheduledStart)}
              {a.hasNote ? " · has note" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Remount on appointment change so the fields pick up that
          appointment's existing note (or blank for a first note). */}
      <div key={appointmentId} className="flex flex-col gap-4">
        {FIELD_ORDER.map((key) => (
          <div key={key} className="flex flex-col gap-1.5">
            <label htmlFor={`note-${key}`} className="text-sm font-medium text-ivory">
              {labels[key]} <span className="font-normal text-ivory-faint">(optional)</span>
            </label>
            <textarea
              id={`note-${key}`}
              name={key}
              rows={2}
              defaultValue={current?.[key] ?? ""}
              aria-invalid={errors[key] ? true : undefined}
              className="min-h-11 rounded-md border border-line bg-surface px-3.5 py-2.5 text-base text-ivory transition-colors duration-150 placeholder:text-ivory-faint"
            />
            {errors[key] && <p className="text-xs font-medium text-orchid">{errors[key]}</p>}
          </div>
        ))}
      </div>

      <FormStatus state={state} />

      <div>
        <SubmitButton>Save session note</SubmitButton>
      </div>
    </form>
  );
}
