import type { TherapistAvailability } from "@/generated/prisma/client";
import { SubmitButton } from "@/components/SubmitButton";
import { removeAvailability } from "./actions";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatDate(value: Date): string {
  // The column is a DATE, which Prisma returns at UTC midnight. Read it with
  // getUTC* or a westward local timezone shifts it by a day.
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function AvailabilityList({ rows }: { rows: TherapistAvailability[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-ivory-dim">
        No hours set. This therapist will not appear as available for any booking until at least one
        entry exists.
      </p>
    );
  }

  const recurring = rows.filter((r) => r.specificDate === null);
  const dated = rows.filter((r) => r.specificDate !== null);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-sm font-semibold text-ivory">Every week</h3>
        {recurring.length === 0 ? (
          <p className="mt-2 text-sm text-ivory-dim">No weekly hours.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {recurring.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3"
              >
                <span className="min-w-24 text-sm font-medium">{DAY_NAMES[row.dayOfWeek ?? 0]}</span>
                <span className="tabular text-sm">
                  {row.startTime}–{row.endTime}
                </span>
                {row.isBlocked && (
                  <span className="rounded bg-orchid-dim px-2 py-1 text-xs font-medium text-orchid">
                    Time off
                  </span>
                )}
                {row.reason && <span className="text-sm text-ivory-dim">{row.reason}</span>}
                <form action={removeAvailability} className="ml-auto">
                  <input type="hidden" name="id" value={row.id} />
                  <SubmitButton variant="destructive">Remove</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-ivory">Specific dates</h3>
        {dated.length === 0 ? (
          <p className="mt-2 text-sm text-ivory-dim">No dated entries.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {dated.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3"
              >
                <span className="min-w-28 tabular text-sm font-medium">
                  {formatDate(row.specificDate!)}
                </span>
                <span className="tabular text-sm">
                  {row.startTime}–{row.endTime}
                </span>
                {row.isBlocked ? (
                  <span className="rounded bg-orchid-dim px-2 py-1 text-xs font-medium text-orchid">
                    Time off
                  </span>
                ) : (
                  <span className="rounded bg-jade-dim px-2 py-1 text-xs font-medium text-jade-text">
                    Working
                  </span>
                )}
                {/* Spec §3.2: without this the precedence rule is invisible. */}
                <span className="text-xs text-ivory-faint">Replaces weekly hours</span>
                {row.reason && <span className="text-sm text-ivory-dim">{row.reason}</span>}
                <form action={removeAvailability} className="ml-auto">
                  <input type="hidden" name="id" value={row.id} />
                  <SubmitButton variant="destructive">Remove</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}