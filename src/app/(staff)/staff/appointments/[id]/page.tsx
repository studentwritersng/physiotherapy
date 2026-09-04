import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { requireRole } from "@/server/auth/rbac";
import { prisma } from "@/server/db";
import { NEXT_STATUS } from "@/server/services/appointment-status";
import { TIMEZONE } from "@/lib/constants";
import { changeStatus, saveCancel, saveReschedule } from "./actions";
import { CancelForm, RescheduleForm } from "./DetailForms";

export const metadata = { title: "Appointment — TetaPhysio" };

const STATUS_PILL = {
  scheduled: "bg-track text-ivory-dim",
  confirmed: "bg-jade-dim text-jade-text",
  arrived: "bg-sky-dim text-sky-text",
  in_session: "bg-gold-dim text-gold-text",
  completed: "bg-track text-ivory-faint",
  cancelled: "bg-orchid-dim text-orchid",
  no_show: "bg-orchid-dim text-orchid",
} as const;

function formatInstant(date: Date): string {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("admin", "therapist", "receptionist");
  const { id } = await params;

  // Detail reads go straight to Prisma rather than through a service: the
  // service layer owns writes and filtered lists, and this page needs one row
  // with its relations, nothing more.
  const appointment = await prisma.appointment.findFirst({
    where: { id, deletedAt: null },
    include: {
      patient: { select: { id: true, fullName: true, phone: true, patientCode: true } },
      service: { select: { id: true, name: true, defaultDurationMinutes: true } },
      therapist: { select: { id: true, name: true } },
      statusHistory: { orderBy: { changedAt: "desc" }, take: 10 },
    },
  });
  if (!appointment) notFound();

  const nextStates = NEXT_STATUS[appointment.status];
  const canReschedule = user.role !== "therapist";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-gold-text">
            {formatInstant(appointment.scheduledStart)}
          </p>
          <h1 className="font-display mt-1 text-2xl font-semibold text-ivory">
            {appointment.patient.fullName}
          </h1>
          <p className="mt-1 text-sm text-ivory-dim">
            {appointment.service.name} · {appointment.therapist?.name ?? "Unassigned"} ·{" "}
            {appointment.patient.patientCode}
          </p>
        </div>
        <span
          className={`rounded px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${STATUS_PILL[appointment.status]}`}
        >
          {appointment.status.replace("_", " ")}
        </span>
      </header>

      {appointment.wasForceBooked && (
        <p className="rounded-md bg-gold-dim px-3.5 py-2.5 text-sm font-medium text-gold-text">
          Force-booked over an occupied slot — the conflict was accepted deliberately at booking time.
        </p>
      )}

      {nextStates.length > 0 && (
        <Card title="Update status" description="Only the legal next states are offered.">
          <div className="flex flex-wrap gap-2">
            {nextStates.map((to) => (
              <form key={to} action={changeStatus}>
                <input type="hidden" name="id" value={appointment.id} />
                <input type="hidden" name="to" value={to} />
                <SubmitButton>{to.replace("_", " ")}</SubmitButton>
              </form>
            ))}
          </div>
        </Card>
      )}

      {canReschedule && appointment.status !== "cancelled" && appointment.status !== "completed" && (
        <Card title="Reschedule" description="Cutoff rules apply.">
          <RescheduleForm action={saveReschedule} appointmentId={appointment.id} />
        </Card>
      )}

      {appointment.status !== "cancelled" && appointment.status !== "completed" && (
        <Card title="Cancel appointment" description="A reason is required — it feeds the reports.">
          <CancelForm action={saveCancel} appointmentId={appointment.id} />
        </Card>
      )}

      <Card title="History">
        {appointment.statusHistory.length === 0 ? (
          <p className="text-sm text-ivory-dim">No transitions recorded yet.</p>
        ) : (
          <ul className="flex flex-col">
            {appointment.statusHistory.map((h) => (
              <li key={h.id} className="border-b border-dashed border-line py-2 last:border-b-0">
                <span className="text-sm font-medium">{h.status.replace("_", " ")}</span>{" "}
                <span className="tabular text-xs text-ivory-faint">
                  {formatInstant(h.changedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Link
        href="/staff/appointments"
        className="cursor-pointer text-sm font-medium text-jade-text hover:opacity-80"
      >
        ← Back to appointments
      </Link>
    </div>
  );
}
