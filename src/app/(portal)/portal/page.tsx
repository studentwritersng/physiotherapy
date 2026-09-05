import Link from "next/link";
import { requirePageRole } from "@/server/auth/page-guard";
import { getClinicSettings } from "@/server/services/clinic-settings";
import { buildWhatsAppLink } from "@/lib/site";
import { TIMEZONE } from "@/lib/constants";
import {
  getPortalDashboard,
  hasSubmittedIntake,
  requireLinkedPatientId,
} from "@/server/services/portal";

export const metadata = { title: "My dashboard — TetaPhysio" };

function formatWhen(date: Date): string {
  return new Intl.DateTimeFormat("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIMEZONE,
  }).format(date);
}

export default async function PortalDashboardPage() {
  const user = await requirePageRole("patient");
  const patientId = await requireLinkedPatientId(user.id);
  const settings = await getClinicSettings();

  const whatsappWaiting = buildWhatsAppLink(
    settings.contactWhatsapp,
    "Hello, I registered online and my records are not linked yet.",
  );

  if (!patientId) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <div className="rounded-lg border border-line bg-surface p-6">
          <h1 className="font-display text-2xl font-medium text-ivory">
            Almost there, {user.name}.
          </h1>
          <p className="mt-2 text-sm text-ivory-dim">
            The clinic is linking your online account to your patient record. This usually happens
            at your next visit — you will see your appointments here afterwards.
          </p>
          {whatsappWaiting && (
            <Link
              href={whatsappWaiting}
              className="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-md bg-jade px-4 py-2 text-sm font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
            >
              WhatsApp the clinic
            </Link>
          )}
        </div>
      </section>
    );
  }

  const [dash, intakeDone] = await Promise.all([
    getPortalDashboard(patientId),
    hasSubmittedIntake(patientId),
  ]);
  const next = dash.upcoming[0];

  const telHref = settings.contactPhone
    ? `tel:${settings.contactPhone.replace(/[\s-]/g, "")}`
    : null;
  const whatsappGeneral = buildWhatsAppLink(
    settings.contactWhatsapp,
    "Hello, I have a question about my care.",
  );

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
        <h1 className="font-display mt-1 text-3xl font-medium text-ivory">
          Hello, <span className="italic text-jade-text">{user.name}.</span>
        </h1>
      </header>

      {!intakeDone && (
        <div className="rounded-lg border border-gold/40 bg-gold-dim p-5">
          <h2 className="font-display text-lg font-medium text-ivory">Complete your intake form</h2>
          <p className="mt-1 text-sm text-ivory-dim">
            Tell us about your condition before your visit so your therapist can prepare.
          </p>
          <Link
            href="/portal/intake"
            className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-md bg-jade px-4 py-2 text-sm font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
          >
            Start intake form
          </Link>
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-6">
        <h2 className="font-display text-xl font-medium text-ivory">Next appointment</h2>
        {next ? (
          <dl className="mt-4 flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-ivory-dim">When</dt>
              <dd className="tabular text-base font-semibold text-ivory">
                {formatWhen(next.scheduledStart)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-ivory-dim">Service</dt>
              <dd className="text-base text-ivory">{next.service.name}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-ivory-dim">Therapist</dt>
              <dd className="text-base text-ivory">{next.therapist?.name ?? "To be assigned"}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-ivory-dim">
            No upcoming appointments. Book your next session to keep your recovery on track.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          {telHref && (
            <a
              href={telHref}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-4 py-2 text-sm font-medium text-ivory transition-colors duration-150 hover:bg-surface-2"
            >
              Call the clinic
            </a>
          )}
          {whatsappGeneral && (
            <a
              href={whatsappGeneral}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-4 py-2 text-sm font-medium text-ivory transition-colors duration-150 hover:bg-surface-2"
            >
              WhatsApp the clinic
            </a>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface p-6">
        <h2 className="font-display text-xl font-medium text-ivory">Recent visits</h2>
        {dash.recent.length > 0 ? (
          <ul className="mt-4 flex flex-col">
            {dash.recent.map((visit) => (
              <li
                key={visit.id}
                className="flex items-baseline justify-between gap-4 border-b border-dashed border-line py-3 last:border-b-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium text-ivory">{visit.service.name}</p>
                  <p className="text-xs text-ivory-dim">
                    {visit.therapist?.name ?? "Therapist to be assigned"}
                  </p>
                </div>
                <p className="tabular shrink-0 text-sm text-ivory-dim">
                  {formatWhen(visit.scheduledStart)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ivory-dim">No past visits yet.</p>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-6">
          <h2 className="font-display text-xl font-medium text-ivory">Treatment plan</h2>
          {dash.treatmentPlan?.summary ? (
            <p className="mt-2 text-sm text-ivory">{dash.treatmentPlan.summary}</p>
          ) : (
            <p className="mt-2 text-sm text-ivory-dim">
              Your therapist hasn&apos;t shared a plan yet.
            </p>
          )}
        </div>
        <div className="rounded-lg border border-line bg-surface p-6">
          <h2 className="font-display text-xl font-medium text-ivory">Balance</h2>
          {dash.balanceDue > 0 ? (
            <p className="tabular font-display mt-2 text-2xl font-semibold text-ivory">
              ₦{dash.balanceDue.toFixed(2)}
            </p>
          ) : (
            <p className="mt-2 text-sm text-ivory-dim">Billing arrives in a later update.</p>
          )}
        </div>
      </div>
    </section>
  );
}
