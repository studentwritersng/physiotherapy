import Link from "next/link";
import { notFound } from "next/navigation";
import { listActiveServices, getServiceBySlug } from "@/server/services/service-catalog";
import { listTherapists } from "@/server/services/availability";
import { getSlotsForDate } from "@/server/services/booking";
import { todayKey } from "@/lib/slots";
import { TIMEZONE } from "@/lib/constants";
import { submitPublicBooking } from "./actions";
import { PublicBookFlow } from "./PublicBookFlow";

export const metadata = {
  title: "Book an appointment — TetaPhysio",
  description: "Book a physiotherapy appointment online: pick a service, a therapist and a time.",
};

/**
 * One page rendering the current step from search params, accumulating state
 * down the URL. Every step is shareable, back-button safe, and works without
 * JS. No session check — this is the unauthenticated surface.
 */
export default async function PublicBookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; therapist?: string; date?: string }>;
}) {
  const { service: serviceSlug, therapist: therapistParam, date: dateParam } = await searchParams;

  // Step 1: no service chosen — grid of active service cards.
  if (!serviceSlug) {
    const services = await listActiveServices();
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
        <h1 className="font-display text-3xl font-semibold text-ivory md:text-4xl">
          Book an appointment
        </h1>
        <p className="mt-2 max-w-prose text-ivory-dim">
          Start by choosing a service — then a therapist and a time that suits you.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <Link
              key={s.id}
              href={`/book?service=${s.slug}`}
              className="group flex cursor-pointer flex-col rounded-lg border border-line bg-surface p-5 transition-colors duration-150 hover:bg-surface-2"
            >
              <span className="font-semibold text-ivory group-hover:text-jade-text">{s.name}</span>
              {s.description && (
                <span className="mt-2 line-clamp-3 text-sm text-ivory-dim">{s.description}</span>
              )}
              <span className="tabular mt-3 text-sm font-semibold text-ivory">
                ₦{Number(s.defaultPrice.toString()).toFixed(2)}
                <span className="font-normal text-ivory-faint"> · {s.defaultDurationMinutes} min</span>
              </span>
            </Link>
          ))}
        </div>

        {services.length === 0 && (
          <p className="mt-8 text-ivory-dim">Online booking is paused — call the clinic to book.</p>
        )}
      </main>
    );
  }

  const service = await getServiceBySlug(serviceSlug);
  if (!service) notFound();

  const therapists = await listTherapists();
  // Absent or empty both mean fan-out; a present id pins the therapist.
  // The empty value is deliberate: the "No preference" link navigates to a URL
  // that differs from the current one only by `therapist=`, so the click is a
  // real navigation even though the visible step does not change.
  const therapistId = therapistParam ?? "";
  const therapistQuery = therapistParam === undefined ? "" : `&therapist=${therapistParam}`;

  const days = nextFourteenDays();
  const dateKey = dateParam ?? "";

  const slots =
    dateKey !== ""
      ? await getSlotsForDate(dateKey, service.id, therapistId === "" ? null : therapistId)
      : [];

  const chosenTherapist = therapists.find((t) => t.id === therapistId);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <h1 className="font-display text-3xl font-semibold text-ivory md:text-4xl">
        Book {service.name}
      </h1>
      <p className="mt-2 max-w-prose text-ivory-dim">
        <Link href="/book" className="cursor-pointer font-medium text-jade-text underline hover:opacity-80">
          Change service
        </Link>
      </p>

      <section aria-label="Choose a therapist" className="mt-8">
        <h2 className="text-sm font-semibold text-ivory">1. Choose a therapist</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {therapists.map((t) => {
            const active = therapistId === t.id;
            return (
              <li key={t.id}>
                <Link
                  href={`/book?service=${service.slug}&therapist=${t.id}${dateKey !== "" ? `&date=${dateKey}` : ""}`}
                  aria-current={active ? "true" : undefined}
                  className={[
                    "inline-flex min-h-11 cursor-pointer items-center rounded-md border px-4 py-2 text-sm font-medium transition-colors duration-150",
                    active
                      ? "border-jade bg-jade-dim text-jade-text"
                      : "border-line text-ivory hover:bg-surface-2",
                  ].join(" ")}
                >
                  {t.name}
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href={`/book?service=${service.slug}&therapist=${dateKey !== "" ? `&date=${dateKey}` : ""}`}
              aria-current={therapistParam === "" ? "true" : undefined}
              className={[
                "inline-flex min-h-11 cursor-pointer items-center rounded-md border px-4 py-2 text-sm font-medium transition-colors duration-150",
                therapistParam === ""
                  ? "border-jade bg-jade-dim text-jade-text"
                  : "border-line text-ivory hover:bg-surface-2",
              ].join(" ")}
            >
              No preference
            </Link>
          </li>
        </ul>
      </section>

      <section aria-label="Choose a day" className="mt-8">
        <h2 className="text-sm font-semibold text-ivory">2. Choose a day</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {days.map((day) => {
            const active = dateKey === day;
            return (
              <li key={day}>
                <Link
                  href={`/book?service=${service.slug}${therapistQuery}&date=${day}`}
                  aria-label={day}
                  aria-current={active ? "date" : undefined}
                  className={[
                    "inline-flex min-h-11 cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium transition-colors duration-150",
                    active
                      ? "border-jade bg-jade-dim text-jade-text"
                      : "border-line text-ivory hover:bg-surface-2",
                  ].join(" ")}
                >
                  {humanDay(day)}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {dateKey !== "" && (
        <section aria-label="Choose a time and add your details" className="mt-8">
          <h2 className="text-sm font-semibold text-ivory">
            3. Pick a time{chosenTherapist ? ` with ${chosenTherapist.name}` : ""} and add your details
          </h2>
          <div className="mt-3 rounded-lg border border-line bg-surface p-5">
            <PublicBookFlow
              action={submitPublicBooking}
              slots={slots.map((s) => ({
                start: s.start.toISOString(),
                end: s.end.toISOString(),
                therapistId: s.therapistId,
                therapistName: s.therapistName,
              }))}
              selected={{ serviceId: service.id, therapistId, dateKey }}
            />
          </div>
        </section>
      )}
    </main>
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
