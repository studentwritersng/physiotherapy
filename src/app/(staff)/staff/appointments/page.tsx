import Link from "next/link";
import { Card } from "@/components/Card";
import { requireRole } from "@/server/auth/rbac";
import { getDaySchedule } from "@/server/services/schedule";
import { listTherapists } from "@/server/services/availability";
import { TIMEZONE } from "@/lib/constants";
import { todayKey } from "@/lib/slots";
import type { AppointmentStatus } from "@/generated/prisma/client";

export const metadata = { title: "Appointments — TetaPhysio" };

const STATUS_PILL: Record<AppointmentStatus, string> = {
  scheduled: "bg-track text-ivory-dim",
  confirmed: "bg-jade-dim text-jade-text",
  arrived: "bg-sky-dim text-sky-text",
  in_session: "bg-gold-dim text-gold-text",
  completed: "bg-track text-ivory-faint",
  cancelled: "bg-orchid-dim text-orchid",
  no_show: "bg-orchid-dim text-orchid",
};

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; therapist?: string; view?: string }>;
}) {
  const user = await requireRole("admin", "therapist", "receptionist");
  const [{ date, therapist }, therapists] = await Promise.all([
    searchParams,
    listTherapists(),
  ]);

  const dateKey = date ?? todayKey();
  // A therapist sees their own day by default; staff pick from the filter.
  const therapistId =
    therapist ?? (user.role === "therapist" ? user.id : null) ?? null;
  const entries = await getDaySchedule(dateKey, therapistId);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ivory">Appointments</h1>
          <p className="mt-1 text-sm text-ivory-dim">
            {entries.length} appointment{entries.length === 1 ? "" : "s"} · {dateKey}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/staff/appointments/week"
            className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-4 py-2 text-sm font-medium text-ivory transition-colors duration-150 hover:bg-surface-2"
          >
            Week view
          </Link>
          <Link
            href="/staff/appointments/walk-in"
            className="inline-flex min-h-11 cursor-pointer items-center rounded-md bg-jade px-4 py-2 text-sm font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
          >
            Walk-in
          </Link>
          <Link
            href="/staff/appointments/new"
            className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-4 py-2 text-sm font-medium text-ivory transition-colors duration-150 hover:bg-surface-2"
          >
            New booking
          </Link>
        </div>
      </header>

      <Card title="Filter by therapist" description="Leave empty to see everyone on shift.">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="date" value={dateKey} />
          <div className="flex flex-col gap-1">
            <label htmlFor="therapist" className="text-sm font-medium text-ivory">
              Therapist
            </label>
            <select
              id="therapist"
              name="therapist"
              defaultValue={therapistId ?? ""}
              className="min-h-11 rounded-md border border-line bg-surface px-3 py-2 text-base focus:outline-none focus:ring-3 focus:ring-jade"
            >
              <option value="">Everyone</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="min-h-11 cursor-pointer rounded-md border border-line px-4 py-2 text-sm font-medium transition-colors duration-150 hover:bg-surface-2"
          >
            Apply
          </button>
        </form>
      </Card>

      <Card title="Agenda" description="Sorted by start time. Cancelled rows stay visible.">
        {entries.length === 0 ? (
          <p className="text-sm text-ivory-dim">Nothing booked for this day.</p>
        ) : (
          <ul className="flex flex-col">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-3 border-b border-dashed border-line py-3 last:border-b-0"
              >
                <span className="tabular w-14 text-sm font-semibold text-ivory-dim">
                  {formatTime(entry.scheduledStart)}
                </span>
                <span
                  className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${STATUS_PILL[entry.status]}`}
                >
                  {entry.status.replace("_", " ")}
                </span>
                <Link
                  href={`/staff/appointments/${entry.id}`}
                  className="min-w-0 flex-1 cursor-pointer font-medium text-ivory hover:text-jade-text"
                >
                  {entry.patient.fullName}
                  <span className="block truncate text-xs font-normal text-ivory-faint">
                    {entry.service.name}
                    {entry.therapist ? ` · ${entry.therapist.name}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
