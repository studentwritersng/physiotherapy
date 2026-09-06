import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/Card";
import { requirePageRole } from "@/server/auth/page-guard";
import { getDaySchedule } from "@/server/services/schedule";
import { TIMEZONE } from "@/lib/constants";
import { todayKey } from "@/lib/slots";
import type { AppointmentStatus } from "@/generated/prisma/client";

export const metadata = { title: "Today — TetaPhysio" };

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

export default async function TodayPage() {
  const user = await requirePageRole("admin", "therapist", "receptionist");

  // The today-view is a therapist tool: a receptionist landing here goes to
  // the full appointments agenda instead.
  if (user.role === "receptionist") redirect("/staff/appointments");

  const dateKey = todayKey();
  const entries = await getDaySchedule(dateKey, user.role === "therapist" ? user.id : null);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ivory">Today</h1>
        <p className="mt-1 text-sm text-ivory-dim">
          {entries.length} visit{entries.length === 1 ? "" : "s"} · {dateKey}
          {user.role === "admin" ? " · everyone" : " · your day"}
        </p>
      </header>

      <Card title="Visits" description="Sorted by start time. Cancelled rows stay visible.">
        {entries.length === 0 ? (
          <p className="text-sm text-ivory-dim">Nothing booked for today.</p>
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
                  href={`/staff/patients/${entry.patient.id}`}
                  className="min-w-0 flex-1 cursor-pointer font-medium text-ivory hover:text-jade-text"
                >
                  {entry.patient.fullName}
                  <span className="block truncate text-xs font-normal text-ivory-faint">
                    {entry.service.name}
                    {user.role === "admin" && entry.therapist
                      ? ` · ${entry.therapist.name}`
                      : ""}
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
