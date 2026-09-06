import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageRole } from "@/server/auth/page-guard";
import { prisma } from "@/server/db";
import { verifyPayment } from "@/server/payments/paystack";
import { recordGatewayPayment } from "@/server/services/billing";
import { getClinicSettings } from "@/server/services/clinic-settings";
import { requireLinkedPatientId } from "@/server/services/portal";
import { buildWhatsAppLink } from "@/lib/site";

export const metadata = { title: "Payment result — TetaPhysio" };

/** Kobo (Paystack integer) → Decimal(12,2) string. Integer math only. */
function koboToDecimalString(kobo: number): string {
  return `${Math.trunc(kobo / 100)}.${String(Math.abs(kobo % 100)).padStart(2, "0")}`;
}

function UnpaidState({ whatsapp }: { whatsapp: string | null }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-6">
      <h1 className="font-display text-2xl font-medium text-ivory">Payment not completed</h1>
      <p className="mt-2 text-sm text-ivory-dim">
        We could not confirm this payment. If money left your account, it will be
        reversed automatically or appear here once confirmed — otherwise try again
        or talk to the clinic.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/portal"
          className="inline-flex min-h-11 cursor-pointer items-center rounded-md bg-jade px-4 py-2 text-sm font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
        >
          Back to my dashboard
        </Link>
        {whatsapp && (
          <a
            href={whatsapp}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-4 py-2 text-sm font-medium text-ivory transition-colors duration-150 hover:bg-surface-2"
          >
            WhatsApp the clinic
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Paystack callback landing. Patient-gated end to end: the page needs the
 * patient role AND a linked record, and the invoice recorded against must be
 * the linked patient's (a forged reference for another patient's invoice hits
 * notFound — fail closed, no data leak). Recording is idempotent on the
 * provider reference: a replayed callback (or the webhook winning the race)
 * returns the existing payment instead of a duplicate.
 */
export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  const user = await requirePageRole("patient");
  const patientId = await requireLinkedPatientId(user.id);
  const settings = await getClinicSettings();
  const whatsapp = buildWhatsAppLink(
    settings.contactWhatsapp,
    "Hello, I just tried paying online and need help confirming it.",
  );

  if (!patientId) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <div className="rounded-lg border border-line bg-surface p-6">
          <h1 className="font-display text-2xl font-medium text-ivory">
            Almost there, {user.name}.
          </h1>
          <p className="mt-2 text-sm text-ivory-dim">
            Your online account is not linked to a patient record yet, so we cannot
            show this payment. The clinic links accounts at your next visit.
          </p>
          <Link
            href="/portal"
            className="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-md bg-jade px-4 py-2 text-sm font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
          >
            Back to my dashboard
          </Link>
        </div>
      </section>
    );
  }

  const { reference } = await searchParams;
  if (typeof reference !== "string" || reference.length === 0) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <UnpaidState whatsapp={whatsapp} />
      </section>
    );
  }

  // Idempotency first: the webhook usually records the payment before Paystack
  // redirects back here. A found receipt must still prove ownership.
  const existing = await prisma.payment.findFirst({
    where: { providerReference: reference },
    include: { invoice: { select: { id: true, invoiceNumber: true, patientId: true } } },
  });
  if (existing) {
    if (existing.invoice.patientId !== patientId) notFound();
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <div className="rounded-lg border border-line bg-surface p-6">
          <h1 className="font-display text-2xl font-medium text-ivory">Payment received</h1>
          <dl className="mt-4 flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-ivory-dim">Amount</dt>
              <dd className="tabular font-display text-xl font-semibold text-ivory">
                ₦{String(existing.amount)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-ivory-dim">Invoice</dt>
              <dd className="text-base text-ivory">{existing.invoice.invoiceNumber}</dd>
            </div>
          </dl>
          <Link
            href="/portal"
            className="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-md bg-jade px-4 py-2 text-sm font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
          >
            Back to my dashboard
          </Link>
        </div>
      </section>
    );
  }

  let verification: Awaited<ReturnType<typeof verifyPayment>>;
  try {
    verification = await verifyPayment(reference);
  } catch {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <UnpaidState whatsapp={whatsapp} />
      </section>
    );
  }

  // Signed verify responses still get shape-checked: no invoice, no paid flag,
  // or a non-positive/non-integer amount renders the unpaid state, never a
  // fabricated receipt.
  if (
    !verification.paid ||
    !verification.invoiceId ||
    !Number.isInteger(verification.amountKobo) ||
    verification.amountKobo <= 0
  ) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <UnpaidState whatsapp={whatsapp} />
      </section>
    );
  }

  // Ownership BEFORE recording: the invoice verify names must belong to the
  // linked patient, or this reference is somebody else's.
  const invoice = await prisma.invoice.findFirst({
    where: { id: verification.invoiceId, patientId },
    select: { id: true, invoiceNumber: true },
  });
  if (!invoice) notFound();

  let recorded: Awaited<ReturnType<typeof recordGatewayPayment>>;
  try {
    recorded = await recordGatewayPayment({
      invoiceId: invoice.id,
      amount: koboToDecimalString(verification.amountKobo),
      providerReference: reference,
    });
  } catch {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <UnpaidState whatsapp={whatsapp} />
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="rounded-lg border border-line bg-surface p-6">
        <h1 className="font-display text-2xl font-medium text-ivory">Payment received</h1>
        <dl className="mt-4 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-ivory-dim">Amount</dt>
            <dd className="tabular font-display text-xl font-semibold text-ivory">
              ₦{String(recorded.amount)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-ivory-dim">Invoice</dt>
            <dd className="text-base text-ivory">{invoice.invoiceNumber}</dd>
          </div>
        </dl>
        <Link
          href="/portal"
          className="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-md bg-jade px-4 py-2 text-sm font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
        >
          Back to my dashboard
        </Link>
      </div>
    </section>
  );
}
