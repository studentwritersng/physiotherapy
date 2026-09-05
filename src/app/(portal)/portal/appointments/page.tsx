import Link from "next/link";
import { requirePageRole } from "@/server/auth/page-guard";
import { getClinicSettings } from "@/server/services/clinic-settings";
import { listActiveServices, getServiceBySlug } from "@/server/services/service-catalog";
import { listTherapists } from "@/server/services/availability";
import { getSlotsForDate } from "@/server/services/booking";
import { getPortalDashboard, requireLinkedPatientId } from "@/server/services/portal";
import { buildWhatsAppLink } from "@/lib/site";
import { TIMEZONE } from "@/lib/constants";
import { todayKey } from "@/lib/slots";
import type { AppointmentStatus } from "@/generated/prisma/client";
import { portalBook, portalCancel, portalReschedule } from "./actions";
import { PortalBookForm, PortalCancelForm, PortalRescheduleForm } from "./PortalForms";

export const metadata = { title: "My appointments — TetaPhysio" };

const STATUS_PILL: Record<AppointmentStatus, string> = {
  scheduled: "bg-sky-dim text-sky-text",
  confirmed: "bg-jade-dim text-jade-text",
  arrived: "bg-sky-dim text-sky-text",
  in_session: "bg-gold-dim text-gold-text",
  completed: "bg-track text-ivory-faint",
  cancelled: "bg-orchid-dim text-orchid",
  no_show: "bg-orchid-dim text-orchid",
};

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

type Params = {
  service?: string;
  therapist?: string;
  date?: string;
  reschedule?: string;
  rdate?: string;
};

/**
 * URL-stepped like /book: each choice accumulates in the URL, so every step is
 * shareable and back-button safe. Booking steps use service/therapist/date;
 * the per-row reschedule picker uses reschedule/rdate alongside them.
 */
function href(base: Params, over: Params): string {
  const merged = { ...base, ...over };
  const q = Object.entries(merged)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join("&");
  return q === "" ? "/portal/appointments" : `/portal/appointments?${q}`;
}

export default async function PortalAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const user = await requirePageRole("patient");
  const patientId = await requireLinkedPatientId(user.id);
  const params = await searchParams;

  const settings = await getClinicSettings();
  const whatsappMove = buildWhatsAppLink(
    settings.contactWhatsapp,
    "Hello, I need to move an appointment that has no fixed therapist.",
  );

  if (!patientId) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <div className="rounded-lg border border-line bg-surface p-6">
          <h1 className="font-display text-2xl font-medium text-ivory">My appointments</h1>
          <p className="mt-2 text-sm text-ivory-dim">
            Your online account is not linked to a patient record yet, so there is nothing to
            show here. Linking usually happens at your next visit.
          </p>
        </div>
      </section>
    );
  }

  const [dash, services, therapists] = await Promise.all([
    getPortalDashboard(patientId),
    listActiveServices(),
    listTherapists(),
  ]);

  const upcoming = dash.upcoming;
  const rescheduling = upcoming.find((a) => a.id === params.reschedule) ?? null;
  const rdate = params.rdate ?? "";

  // Reschedule slots are scoped to the appointment's pinned therapist. A null
  // therapist never reaches the picker — the row renders the contact panel.
  const rescheduleSlots =
    rescheduling && rescheduling.therapistId && rdate !== ""
      ? await getSlotsForDate(rdate, rescheduling.serviceId, rescheduling.therapistId)
      : [];

  // ── Booking steps ──
  const serviceSlug = params.service ?? "";
  const service = serviceSlug !== "" ? await getServiceBySlug(serviceSlug) : null;
  const therapistId = params.therapist ?? "";
  const dateKey = params.date ?? "";
  const bookSlots =
    service && dateKey !== ""
      ? await getSlotsForDate(dateKey, service.id, therapistId === "" ? null : therapistId)
      : [];
  const days = nextFourteenDays();
  const bookBase: Params = { service: serviceSlug, therapist: params.therapist, date: params.date };

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="font-display mt-1 text-3xl font-medium text-ivory">My appointments</h1>
        <p className="mt-1 text-sm text-ivory-dim">
          Move or cancel an upcoming visit, or book a new one below.
        </p>
      </header>

      {/* ── Upcoming ── */}
      <div className="rounded-lg border border-line bg-surface p-6">
        <h2 className="font-display text-xl font-medium text-ivory">Upcoming</h2>
        {upcoming.length > 0 ? (
          <ul className="mt-4 flex flex-col">
            {upcoming.map((appt) => {
              const isRescheduling = rescheduling?.id === appt.id;
              return (
                <li
                  key={appt.id}
                  className="flex flex-col gap-3 border-b border-dashed border-line py-4 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <div>
                      <p className="tabular text-base font-semibold text-ivory">
                        {formatWhen(appt.scheduledStart)}
                      </p>
                      <p className="mt-0.5 text-sm text-ivory-dim">
                        {appt.service.name} · {appt.therapist?.name ?? "To be assigned"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_PILL[appt.status as AppointmentStatus]}`}
                    >
                      {appt.status.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="flex flex-col gap-3">
                    <details open={isRescheduling} className="rounded-md border border-line">
                      <summary className="min-h-11 cursor-pointer px-3 py-2 text-sm font-medium text-ivory">
                        Reschedule
                      </summary>
                      <div className="flex flex-col gap-3 border-t border-line p-3">
                        {appt.therapistId ? (
                          <>
                            <ul className="flex flex-wrap gap-2">
                              {days.map((day) => (
                                <li key={day}>
                                  <Link
                                    href={href(bookBase, {
                                      reschedule: appt.id,
                                      rdate: day,
                                    })}
                                    aria-current={isRescheduling && rdate === day ? "date" : undefined}
                                    className={[
                                      "inline-flex min-h-11 cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium transition-colors duration-150",
                                      isRescheduling && rdate === day
                                        ? "border-jade bg-jade-dim text-jade-text"
                                        : "border-line text-ivory hover:bg-surface-2",
                                    ].join(" ")}
                                  >
                                    {humanDay(day)}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                            {isRescheduling && rdate !== "" && (
                              <PortalRescheduleForm
                                action={portalReschedule}
                                appointmentId={appt.id}
                                dateKey={rdate}
                                slots={rescheduleSlots.map((s) => ({
                                  start: s.start.toISOString(),
                                  end: s.end.toISOString(),
                                }))}
                              />
                            )}
                          </>
                        ) : (
                          <div className="rounded-md border border-dashed border-line p-4">
                            <p className="text-sm font-medium text-ivory">
                              This booking has no fixed therapist.
                            </p>
                            <p className="mt-1 text-sm text-ivory-dim">
                              Contact the clinic and we will move it for you.
                            </p>
                            {whatsappMove && (
                              <a
                                href={whatsappMove}
                                className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-4 py-2 text-sm font-medium text-ivory transition-colors duration-150 hover:bg-surface-2"
                              >
                                WhatsApp the clinic
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </details>

                    <details className="rounded-md border border-line">
                      <summary className="min-h-11 cursor-pointer px-3 py-2 text-sm font-medium text-ivory">
                        Cancel
                      </summary>
                      <div className="border-t border-line p-3">
                        <PortalCancelForm action={portalCancel} appointmentId={appt.id} />
                      </div>
                    </details>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ivory-dim">
            No upcoming appointments. Book your next session below.
          </p>
        )}
      </div>

      {/* ── Book a new appointment ── */}
      <div className="rounded-lg border border-line bg-surface p-6">
        <h2 className="font-display text-xl font-medium text-ivory">Book a new appointment</h2>

        {!serviceSlug ? (
          <>
            <p className="mt-1 text-sm text-ivory-dim">Start by choosing a service.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {services.map((s) => (
                <Link
                  key={s.id}
                  href={href(bookBase, { service: s.slug, therapist: undefined, date: undefined })}
                  className="group flex cursor-pointer flex-col rounded-lg border border-line bg-surface-2 p-4 transition-colors duration-150 hover:bg-surface-3"
                >
                  <span className="font-semibold text-ivory group-hover:text-jade-text">{s.name}</span>
                  <span className="tabular mt-1 text-sm font-semibold text-ivory">
                    ₦{Number(s.defaultPrice.toString()).toFixed(2)}
                    <span className="font-normal text-ivory-faint">
                      {" "}
                      · {s.defaultDurationMinutes} min
                    </span>
                  </span>
                </Link>
              ))}
            </div>
            {services.length === 0 && (
              <p className="mt-4 text-sm text-ivory-dim">
                Online booking is paused — call the clinic to book.
              </p>
            )}
          </>
        ) : !service ? (
          <p className="mt-2 text-sm text-ivory-dim">
            That service is no longer available.{" "}
            <Link
              href="/portal/appointments"
              className="cursor-pointer font-medium text-jade-text underline hover:opacity-80"
            >
              Start again
            </Link>
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ivory-dim">
              Booking {service.name}.{" "}
              <Link
                href={href(bookBase, { service: undefined, therapist: undefined, date: undefined })}
                className="cursor-pointer font-medium text-jade-text underline hover:opacity-80"
              >
                Change service
              </Link>
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-ivory">1. Choose a therapist</h3>
              <ul className="flex flex-wrap gap-2">
                {therapists.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={href(bookBase, { therapist: t.id })}
                      aria-current={therapistId === t.id ? "true" : undefined}
                      className={[
                        "inline-flex min-h-11 cursor-pointer items-center rounded-md border px-4 py-2 text-sm font-medium transition-colors duration-150",
                        therapistId === t.id
                          ? "border-jade bg-jade-dim text-jade-text"
                          : "border-line text-ivory hover:bg-surface-2",
                      ].join(" ")}
                    >
                      {t.name}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href={href(bookBase, { therapist: "" })}
                    aria-current={therapistId === "" ? "true" : undefined}
                    className={[
                      "inline-flex min-h-11 cursor-pointer items-center rounded-md border px-4 py-2 text-sm font-medium transition-colors duration-150",
                      therapistId === ""
                        ? "border-jade bg-jade-dim text-jade-text"
                        : "border-line text-ivory hover:bg-surface-2",
                    ].join(" ")}
                  >
                    No preference
                  </Link>
                </li>
              </ul>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-ivory">2. Choose a day</h3>
              <ul className="flex flex-wrap gap-2">
                {days.map((day) => (
                  <li key={day}>
                    <Link
                      href={href(bookBase, { date: day })}
                      aria-current={dateKey === day ? "date" : undefined}
                      className={[
                        "inline-flex min-h-11 cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium transition-colors duration-150",
                        dateKey === day
                          ? "border-jade bg-jade-dim text-jade-text"
                          : "border-line text-ivory hover:bg-surface-2",
                      ].join(" ")}
                    >
                      {humanDay(day)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {dateKey !== "" && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-ivory">3. Pick a time</h3>
                <div className="mt-2">
                  <PortalBookForm
                    action={portalBook}
                    slots={bookSlots.map((s) => ({
                      start: s.start.toISOString(),
                      end: s.end.toISOString(),
                    }))}
                    selected={{ serviceId: service.id, therapistId, dateKey }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── History ── */}
      <div className="rounded-lg border border-line bg-surface p-6">
        <h2 className="font-display text-xl font-medium text-ivory">History</h2>
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
                    {visit.therapist?.name ?? "Therapist to be assigned"} ·{" "}
                    {formatWhen(visit.scheduledStart)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_PILL[visit.status as AppointmentStatus]}`}
                >
                  {visit.status.replace(/_/g, " ")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ivory-dim">No past visits yet.</p>
        )}
      </div>
    </section>
  );
}

/** The next 14 Lagos calendar days as YYYY-MM-DD keys. */
function nextFourteenDays(now: Date = new Date()): string[] {
  const today = todayKey(now);
  const [y, mo, d] = today.split("-").map(Number);
  const base = Date.UTC(y!, mo! - 1, d);
  return Array.from({ length: 14 }, (_, i) => {
    const t = new Date(base + i * 86_400_000);
    const pad = (v: number) => String(v).padStart(2, "0");
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  });
}

/** "2026-09-16" → "Wed 16 Sep", rendered in Africa/Lagos wall-clock. */
function humanDay(dateKey: string): string {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const atNoon = new Date(Date.UTC(y!, mo! - 1, d, 11, 0));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(atNoon);
}
