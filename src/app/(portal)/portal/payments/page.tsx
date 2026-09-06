import Link from "next/link";
import { requirePageRole } from "@/server/auth/page-guard";
import { getClinicSettings } from "@/server/services/clinic-settings";
import { isGatewayConfigured } from "@/server/payments/paystack";
import { getPortalBilling, requireLinkedPatientId } from "@/server/services/portal";
import { TIMEZONE } from "@/lib/constants";
import { startOnlinePayment } from "../billing/actions";

export const metadata = { title: "Payments — TetaPhysio" };

/**
 * Full billing view behind the portal sidebar's Payments entry (no more
 * "soon"). Same data as the dashboard balance card, untruncated: every open
 * invoice with Pay Now, plus the complete payment history.
 */
export default async function PortalPaymentsPage() {
  const user = await requirePageRole("patient");
  const patientId = await requireLinkedPatientId(user.id);
  if (!patientId) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <h1 className="font-display text-2xl font-medium text-ivory">Payments</h1>
        <p className="text-sm text-ivory-dim">
          Your online account is not linked to a patient record yet — billing appears here
          once the clinic links it.
        </p>
        <Link
          href="/portal"
          className="cursor-pointer text-sm font-medium text-jade-text underline hover:opacity-80"
        >
          Back to dashboard
        </Link>
      </section>
    );
  }

  const [billing, settings] = await Promise.all([
    getPortalBilling(patientId),
    getClinicSettings(),
  ]);
  const canPayOnline = isGatewayConfigured() && settings.onlinePaymentsEnabled;

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-medium text-ivory">Payments</h1>
        <p className="mt-1 text-sm text-ivory-dim">
          Outstanding invoices and everything you have paid so far.
        </p>
      </header>

      <div className="rounded-lg border border-line bg-surface p-6">
        <h2 className="font-display text-xl font-medium text-ivory">Open invoices</h2>
        {billing.invoices.length > 0 ? (
          <ul className="mt-4 flex flex-col">
            {billing.invoices.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-4 border-b border-dashed border-line py-3 last:border-b-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium text-ivory">{inv.invoiceNumber}</p>
                  <p className="tabular text-xs text-ivory-dim">Due ₦{inv.remainder}</p>
                </div>
                {canPayOnline && (
                  <form action={startOnlinePayment}>
                    <input type="hidden" name="invoiceId" value={inv.id} />
                    <button
                      type="submit"
                      className="inline-flex min-h-11 cursor-pointer items-center rounded-md bg-jade px-4 py-2 text-sm font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
                    >
                      Pay Now
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ivory-dim">Nothing owing — you are all settled up.</p>
        )}
      </div>

      <div className="rounded-lg border border-line bg-surface p-6">
        <h2 className="font-display text-xl font-medium text-ivory">Payment history</h2>
        {billing.payments.length > 0 ? (
          <ul className="mt-4 flex flex-col">
            {billing.payments.map((payment) => (
              <li
                key={payment.id}
                className="flex items-baseline justify-between gap-4 border-b border-dashed border-line py-2 last:border-b-0 last:pb-0"
              >
                <div>
                  <p className="tabular text-sm font-medium text-ivory">₦{payment.amount}</p>
                  <p className="text-xs text-ivory-dim">
                    {payment.invoiceNumber} · {payment.method.replace(/_/g, " ")}
                  </p>
                </div>
                <p className="tabular shrink-0 text-xs text-ivory-dim">
                  {payment.paidAt.toLocaleDateString("en-NG", { timeZone: TIMEZONE })}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ivory-dim">No payments recorded yet.</p>
        )}
      </div>
    </section>
  );
}
