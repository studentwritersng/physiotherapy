"use client";

import { useActionState, useState } from "react";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";

const WEEKDAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

export function AvailabilityForm({
  therapistId,
  action,
}: {
  therapistId: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  const [kind, setKind] = useState<"recurring" | "dated">("recurring");

  const inputClass =
    "min-h-11 rounded-md border border-line bg-surface px-3 py-2 tabular text-base focus:outline-none focus:ring-3 focus:ring-jade";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="therapistId" value={therapistId} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ivory">Type</legend>
        <div className="flex flex-wrap gap-4">
          {(["recurring", "dated"] as const).map((option) => (
            <label key={option} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="kind"
                value={option}
                checked={kind === option}
                onChange={() => setKind(option)}
                className="size-5 cursor-pointer accent-jade focus:outline-none focus:ring-3 focus:ring-jade"
              />
              {option === "recurring" ? "Every week" : "A specific date"}
            </label>
          ))}
        </div>
      </fieldset>

      {kind === "recurring" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="dayOfWeek" className="text-sm font-medium text-ivory">
            Day of the week
          </label>
          <select id="dayOfWeek" name="dayOfWeek" className={inputClass} defaultValue="1">
            {WEEKDAYS.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
          {errors.dayOfWeek && (
            <p className="text-xs font-medium text-orchid">{errors.dayOfWeek}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor="specificDate" className="text-sm font-medium text-ivory">
            Date
          </label>
          <input id="specificDate" name="specificDate" type="date" className={inputClass} />
          {/* Spec §3.2 made this rule invisible unless the UI says it out loud. */}
          <p className="text-xs text-ivory-faint">
            A dated entry replaces this therapist&apos;s weekly hours for that day entirely.
          </p>
          {errors.specificDate && (
            <p className="text-xs font-medium text-orchid">{errors.specificDate}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="startTime" className="text-sm font-medium text-ivory">
            From
          </label>
          <input
            id="startTime"
            name="startTime"
            type="time"
            defaultValue="08:00"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="endTime" className="text-sm font-medium text-ivory">
            To
          </label>
          <input
            id="endTime"
            name="endTime"
            type="time"
            defaultValue="17:00"
            className={inputClass}
            aria-invalid={errors.endTime ? true : undefined}
          />
          {errors.endTime && (
            <p className="text-xs font-medium text-orchid">{errors.endTime}</p>
          )}
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isBlocked"
          value="true"
          className="size-5 cursor-pointer accent-orchid focus:outline-none focus:ring-3 focus:ring-jade"
        />
        This is time off, not working hours
      </label>

      <div className="flex flex-col gap-1">
        <label htmlFor="reason" className="text-sm font-medium text-ivory">
          Reason <span className="font-normal text-ivory-faint">(optional)</span>
        </label>
        <input
          id="reason"
          name="reason"
          type="text"
          placeholder="Annual leave"
          className="min-h-11 rounded-md border border-line bg-surface px-3 py-2 text-base focus:outline-none focus:ring-3 focus:ring-jade"
        />
      </div>

      <FormStatus state={state} />

      <div>
        <SubmitButton>Add entry</SubmitButton>
      </div>
    </form>
  );
}
