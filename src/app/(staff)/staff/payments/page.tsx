import { Card } from "@/components/Card";
import { requirePageRole } from "@/server/auth/page-guard";
import { getClinicSettings } from "@/server/services/clinic-settings";
import {
  getClinicOutstanding,
  getPatientBalance,
  getRevenueByMethod,
  listRecentPayments,
} from "@/server/services/billing";
import { listPatientsForActor } from "@/server/services/patient";
import { lagosDayRange, todayKey } from "@/lib/slots";
import { TIMEZONE } from "@/lib/constants";

export const metadata = { title: "Payments — TetaPhysio" };

/**
 * Money arrives as decimal-strings; pad the fraction for display without
 * routing through a float. "31001" → "31001.00", "7000.00" → "7000.00".
 */
function fmt(money: unknown): string {
  const s = String(money).trim();
  const [naira, kobo = ""] = s.split(".");
  return `${naira}.${(kobo + "00").slice(0, 2)}`;
}

function formatDateTime(date: Date): string {
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

const LOOKUP_LIMIT = 25;
const HISTORY_LIMIT = 50;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  // Therapists never reach this page: the gate throws to the 403 boundary
  // rather than merely hiding the nav link.
  const user = await requirePageRole("admin", "receptionist");
  const { q } = await searchParams;

  // Settings first: the revenue block is hidden from receptionists unless the
  // clinic opts in. Admins always see it.
  const settings = await getClinicSettings();
  const showRevenue = user.role === "admin" || settings.receptionistSeesRevenue;

  const outstanding = await getClinicOutstanding();

  const { from, to } = lagosDayRange(todayKey());
  const revenue = showRevenue ? await getRevenueByMethod(from, to) : [];

  const history = await listRecentPayments(HISTORY_LIMIT);

  const search = q?.trim() ? q.trim() : undefined;
  const matches = search
    ? await listPatientsForActor(user, { search, take: LOOKUP_LIMIT })
    : [];
  const balances = new Map<string, string>();
  for (const patient of matches) {
    balances.set(patient.id, await getPatientBalance(patient.id));
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ivory">Payments</h1>
        <p className="mt-1 text-sm text-ivory-dim">
          Outstanding balances, today&apos;s takings, and payment history.
        </p>
      </header>

      <Card title="Outstanding" description="Unpaid and partially paid invoices, clinic-wide.">
        <p className="tabular font-display text-3xl font-semibold text-ivory">₦{fmt(outstanding)}</p>
      </Card>

      {showRevenue && (
        <Card
          title="Today's revenue"
          description="Payments recorded today (Lagos time), grouped by method."
        >
          {revenue.length === 0 ? (
            <p className="text-sm text-ivory-dim">No payments recorded today yet.</p>
          ) : (
            <ul className="flex flex-col">
              {revenue.map((row) => (
                <li
                  key={row.method}
                  className="flex items-baseline justify-between border-b border-dashed border-line py-2 text-sm last:border-b-0"
                >
                  <span className="font-medium text-ivory">{row.method.replace("_", " ")}</span>
                  <span className="tabular font-semibold text-ivory">₦{fmt(row.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card
        title="Patient balance lookup"
        description="Search by name, phone, or patient code — up to 25 matches."
      >
        <form method="get" action="/staff/payments" className="flex flex-wrap gap-3">
          <label htmlFor="q" className="sr-only">
            Search patients
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={search ?? ""}
            placeholder="Name, phone, or code…"
            className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-base focus:outline-none focus:ring-3 focus:ring-jade"
          />
          <button
            type="submit"
            className="min-h-11 min-w-11 cursor-pointer rounded-md bg-jade px-4 py-2 text-sm font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
          >
            Search
          </button>
        </form>
        {search !== undefined && (
          <div className="mt-4">
            {matches.length === 0 ? (
              <p className="text-sm text-ivory-dim">No matching patients.</p>
            ) : (
              <ul className="flex flex-col">
                {matches.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-baseline justify-between gap-3 border-b border-dashed border-line py-2 text-sm last:border-b-0"
                  >
                    <span className="font-medium text-ivory">
                      {p.fullName}
                      <span className="block truncate text-xs font-normal text-ivory-faint">
                        {p.patientCode} · {p.phone}
                      </span>
                    </span>
                    <span className="tabular shrink-0 font-semibold text-ivory">
                      ₦{fmt(balances.get(p.id) ?? "0.00")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Card
        title="Payment history"
        description={
          history.length === 0
            ? "No payments recorded yet."
            : `Latest ${history.length} payment${history.length === 1 ? "" : "s"}.`
        }
      >
        {history.length === 0 ? (
          <p className="text-sm text-ivory-dim">Recorded payments will appear here.</p>
        ) : (
          <ul className="flex flex-col">
            {history.map((payment) => (
              <li
                key={payment.id}
                className="flex items-baseline justify-between gap-3 border-b border-dashed border-line py-2 text-sm last:border-b-0"
              >
                <span className="font-medium text-ivory">
                  {payment.invoice.patient.fullName}
                  <span className="block truncate text-xs font-normal text-ivory-faint">
                    {payment.invoice.invoiceNumber} · {payment.method.replace("_", " ")} ·{" "}
                    <span className="tabular">{formatDateTime(payment.paidAt)}</span>
                  </span>
                </span>
                <span className="tabular shrink-0 font-semibold text-ivory">
                  ₦{fmt(payment.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
