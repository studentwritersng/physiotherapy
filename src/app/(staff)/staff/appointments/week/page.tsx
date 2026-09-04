import Link from "next/link";
import { Card } from "@/components/Card";
import { requireRole } from "@/server/auth/rbac";
import { getWeekSchedule } from "@/server/services/schedule";
import { todayKey } from "@/lib/slots";
import { TIMEZONE } from "@/lib/constants";

export const metadata = { title: "Week view — TetaPhysio" };

function mondayOf(dateKey: string): string {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, mo! - 1, d!));
  // getUTCDay: 0 Sunday … 6 Saturday. Monday is 1; Sunday goes back 6.
  const back = (dt.getUTCDay() + 6) % 7;
  const monday = new Date(dt.getTime() - back * 86_400_000);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

function shiftWeek(mondayKey: string, delta: number): string {
  const [y, mo, d] = mondayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, mo! - 1, d! + delta));
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; therapist?: string }>;
}) {
  await requireRole("admin", "therapist", "receptionist");
  const [{ week, therapist }] = await Promise.all([searchParams]);

  const mondayKey = mondayOf(week ?? todayKey());
  const days = await getWeekSchedule(mondayKey, therapist ?? null);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ivory">Week view</h1>
          <p className="mt-1 text-sm text-ivory-dim">Week of {mondayKey}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/staff/appointments/week?week=${shiftWeek(mondayKey, -7)}${therapist ? `&therapist=${therapist}` : ""}`}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-4 py-2 text-sm font-medium transition-colors duration-150 hover:bg-surface-2"
          >
            ← Previous
          </Link>
          <Link
            href="/staff/appointments"
            className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-4 py-2 text-sm font-medium transition-colors duration-150 hover:bg-surface-2"
          >
            Day view
          </Link>
          <Link
            href={`/staff/appointments/week?week=${shiftWeek(mondayKey, 7)}${therapist ? `&therapist=${therapist}` : ""}`}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-4 py-2 text-sm font-medium transition-colors duration-150 hover:bg-surface-2"
          >
            Next →
          </Link>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {days.map((day) => (
          <Card key={day.dateKey} title={day.dateKey}>
            {day.entries.length === 0 ? (
              <p className="text-sm text-ivory-dim">Nothing booked.</p>
            ) : (
              <ul className="flex flex-col">
                {day.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="border-b border-dashed border-line py-2 last:border-b-0"
                  >
                    <Link
                      href={`/staff/appointments/${entry.id}`}
                      className="cursor-pointer text-sm font-medium text-ivory hover:text-jade-text"
                    >
                      {entry.patient.fullName}
                    </Link>
                    <p className="tabular text-xs text-ivory-faint">
                      {new Intl.DateTimeFormat("en-NG", {
                        timeZone: TIMEZONE,
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      }).format(entry.scheduledStart)}{" "}
                      · {entry.service.name}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
