"use client";

import { useActionState, useState } from "react";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";
import { DAY_KEYS, type OpeningHours } from "@/lib/zod/clinic";

const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export function OpeningHoursEditor({
  openingHours,
  action,
}: {
  openingHours: OpeningHours;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  // Local state only so the time inputs can be disabled when a day is closed.
  // The submitted values still come from the form itself.
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(DAY_KEYS.map((day) => [day, openingHours[day] !== null])),
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {DAY_KEYS.map((day) => {
          const hours = openingHours[day];
          const isOpen = enabled[day] ?? false;
          const dayError = errors[day] ?? errors[`${day}.open`] ?? errors[`${day}.close`];

          return (
            <li key={day} className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-40 items-center gap-2">
                <input
                  id={`${day}-enabled`}
                  name={`${day}-enabled`}
                  type="checkbox"
                  checked={isOpen}
                  onChange={(e) =>
                    setEnabled((prev) => ({ ...prev, [day]: e.target.checked }))
                  }
                  className="size-5 cursor-pointer accent-jade focus:outline-none focus:ring-3 focus:ring-jade"
                />
                <label htmlFor={`${day}-enabled`} className="cursor-pointer text-sm font-medium">
                  {DAY_LABELS[day]}
                </label>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={`${day}-open`} className="text-xs text-ivory-faint">
                  Opens
                </label>
                {/* Native time input: a real picker on Android with zero JS,
                    which is what PRD-04 FR4's low-end target wants. */}
                <input
                  id={`${day}-open`}
                  name={`${day}-open`}
                  type="time"
                  defaultValue={hours?.open ?? "08:00"}
                  disabled={!isOpen}
                  aria-invalid={dayError ? true : undefined}
                  className="min-h-11 rounded-md border border-line bg-surface px-3 py-2 tabular text-base focus:outline-none focus:ring-3 focus:ring-jade disabled:opacity-50"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={`${day}-close`} className="text-xs text-ivory-faint">
                  Closes
                </label>
                <input
                  id={`${day}-close`}
                  name={`${day}-close`}
                  type="time"
                  defaultValue={hours?.close ?? "17:00"}
                  disabled={!isOpen}
                  aria-invalid={dayError ? true : undefined}
                  className="min-h-11 rounded-md border border-line bg-surface px-3 py-2 tabular text-base focus:outline-none focus:ring-3 focus:ring-jade disabled:opacity-50"
                />
              </div>

              {!isOpen && <span className="pb-3 text-sm text-ivory-dim">Closed</span>}
              {dayError && (
                <span className="pb-3 text-sm font-medium text-orchid">{dayError}</span>
              )}
            </li>
          );
        })}
      </ul>

      <FormStatus state={state} />

      <div>
        <SubmitButton>Save opening hours</SubmitButton>
      </div>
    </form>
  );
}
