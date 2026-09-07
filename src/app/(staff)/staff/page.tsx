import Link from "next/link";
import { requirePageRole } from "@/server/auth/page-guard";
import { TIMEZONE } from "@/lib/constants";
import { getStaffOverview } from "@/server/services/dashboard";

export const metadata = { title: "Dashboard — TetaPhysio" };

const STATUS_PILL: Record<string, string> = {
  scheduled: "bg-sky-dim text-sky-text",
  confirmed: "bg-sky-dim text-sky-text",
  arrived: "bg-gold-dim text-gold-text",
  in_session: "bg-jade-dim text-jade-text",
  completed: "bg-surface-3 text-ivory-dim",
  cancelled: "bg-orchid-dim text-orchid",
  no_show: "bg-orchid-dim text-orchid",
};

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-5"
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  patients: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 19v-1a4 4 0 0 0-3-3.87M15.5 3.13a3.5 3.5 0 0 1 0 6.74",
  calendar: "M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2",
  pulse: "M3 12h4l2.5-6 4 12L16 12h5",
  receipt: "M6 2h12v20l-3-2-3 2-3-2-3 2M9 7h6M9 11h6",
  cash: "M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2M12 14a2.5 2.5 0 1 0 0-.01",
};

function Kpi({
  icon,
  label,
  value,
  href,
}: {
  icon: keyof typeof ICONS;
  label: string;
  value: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="flex size-10 items-center justify-center rounded-md bg-jade-dim text-jade-text">
        <Icon d={ICONS[icon]} />
      </span>
      <span className="mt-3 text-xs font-medium text-ivory-dim">{label}</span>
      <span className="tabular font-display mt-1 text-3xl font-semibold text-ivory">{value}</span>
    </>
  );
  const cls =
    "flex cursor-pointer flex-col rounded-lg border border-line bg-surface p-5 transition-colors duration-150 hover:bg-surface-2";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls.replace(" cursor-pointer", "")}>{body}</div>
  );
}

function Tile({
  value,
  label,
  href,
}: {
  value: string;
  label: string;
  href?: string;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-line bg-surface p-5">
      <span className="tabular font-display text-2xl font-semibold text-ivory">{value}</span>
      <span className="mt-1 text-xs font-medium text-ivory-dim">{label}</span>
      {href && (
        <Link
          href={href}
          className="mt-2 cursor-pointer text-xs font-semibold text-jade-text hover:opacity-80"
        >
          View all →
        </Link>
      )}
    </div>
  );
}

function formatNaira(decimalString: string): string {
  const [naira, kobo = ""] = decimalString.split(".");
  const grouped = Number(naira).toLocaleString("en-NG");
  return `₦${grouped}.${(kobo + "00").slice(0, 2)}`;
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-NG", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIMEZONE,
  }).format(date);
}

/**
 * Staff home: honest counts from live data, zeroes when there is nothing yet.
 * Depth (ranges, trends, charts) belongs to sub-project 9; low-stock,
 * follow-ups, called and packages have no backing concepts and are omitted
 * rather than faked.
 */
export default async function StaffDashboardPage() {
  const user = await requirePageRole("admin", "therapist", "receptionist");
  const o = await getStaffOverview(user);
  const canSeePatients = user.role !== "receptionist";

  return (
    <section className="flex flex-col gap-6">
      <header>
        <p className="text-xs uppercase tracking-[0.16em] text-gold-text">
          {new Date().toLocaleDateString("en-NG", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: TIMEZONE,
          })}
        </p>
        <h1 className="font-display mt-1 text-3xl font-medium text-ivory">Dashboard</h1>
        <p className="mt-1 text-sm text-ivory-dim">Today at the clinic at a glance.</p>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Kpi icon="patients" label="Total Patients" value={String(o.totalPatients)} href={canSeePatients ? "/staff/patients" : undefined} />
        <Kpi icon="calendar" label="Appointments Today" value={String(o.appointmentsToday)} href="/staff/appointments" />
        <Kpi icon="pulse" label="Active Treatments" value={String(o.activePlans)} />
        <Kpi icon="receipt" label="Outstanding" value={formatNaira(o.outstanding)} href="/staff/payments" />
        {o.revenueToday !== null && (
          <Kpi icon="cash" label="Today's Revenue" value={formatNaira(o.revenueToday)} href="/staff/payments" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <Tile value={String(o.newPatients)} label="New this week" />
        <Tile value={String(o.upcoming)} label="Next 7 days" href="/staff/appointments" />
        <Tile value={String(o.unpaidInvoices)} label="Unpaid Invoices" href="/staff/payments" />
        <Tile value={String(o.waitingToday)} label="Waiting Today" href="/staff/appointments" />
        <Tile value={String(o.inSessionNow)} label="In Session Now" href="/staff/appointments" />
        <Tile value={String(o.completedToday)} label="Completed Today" href="/staff/appointments" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold text-ivory">Today&apos;s appointments</h2>
            <Link
              href="/staff/appointments"
              className="cursor-pointer text-sm font-medium text-jade-text hover:opacity-80"
            >
              View all
            </Link>
          </div>
          {o.today.length > 0 ? (
            <ul className="flex flex-col">
              {o.today.map((a) => (
                <li
                  key={a.id}
                  className="flex items-baseline justify-between gap-4 border-b border-dashed border-line py-2.5 last:border-b-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium text-ivory">{a.patient.fullName}</p>
                    <p className="tabular text-xs text-ivory-dim">
                      {formatTime(a.scheduledStart)} · {a.service.name}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_PILL[a.status] ?? "bg-surface-3 text-ivory-dim"}`}
                  >
                    {a.status.replace(/_/g, " ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ivory-dim">No appointments today yet.</p>
          )}
        </div>

        <div className="rounded-lg border border-line bg-surface p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold text-ivory">Recent invoices</h2>
            <Link
              href="/staff/payments"
              className="cursor-pointer text-sm font-medium text-jade-text hover:opacity-80"
            >
              View all
            </Link>
          </div>
          {o.recentInvoices.length > 0 ? (
            <ul className="flex flex-col">
              {o.recentInvoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-baseline justify-between gap-4 border-b border-dashed border-line py-2.5 last:border-b-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium text-ivory">{inv.invoiceNumber}</p>
                    <p className="text-xs text-ivory-dim">{inv.patient.fullName}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular text-sm font-semibold text-ivory">
                      ₦{Number(inv.totalAmount.toString()).toFixed(2)}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${inv.status === "paid" ? "bg-jade-dim text-jade-text" : inv.status === "partially_paid" ? "bg-gold-dim text-gold-text" : "bg-orchid-dim text-orchid"}`}
                    >
                      {inv.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ivory-dim">No invoices yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
