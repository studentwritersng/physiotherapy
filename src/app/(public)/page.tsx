import Link from "next/link";
import { PublicImage } from "@/components/PublicImage";
import { Reveal } from "@/components/Reveal";
import { Goniometer } from "@/components/Goniometer";
import { TestimonialCarousel } from "@/components/TestimonialCarousel";
import { getClinicSettings } from "@/server/services/clinic-settings";
import { listActiveServices } from "@/server/services/service-catalog";
import { listPublishedTestimonials } from "@/server/services/testimonial";
import { DAY_KEYS } from "@/lib/zod/clinic";

export const metadata = {
  title: "TetaPhysio — Physiotherapy in Lagos",
  description:
    "Expert physiotherapy in Lagos: sports injury rehab, post-surgery recovery, pain management and more. Book online in under two minutes.",
};

const BENEFITS = [
  {
    title: "Licensed therapists only",
    body: "Every session is delivered by a qualified physiotherapist — never an assistant, never a machine left running.",
  },
  {
    title: "Same-week appointments",
    body: "Real-time availability online. Book in under two minutes, get confirmation on screen immediately.",
  },
  {
    title: "Treatment you can see",
    body: "Clear goals, prescribed exercises and progress you track together — no black-box therapy.",
  },
  {
    title: "One clinic, one record",
    body: "Your history follows you across visits, therapists and treatment plans.",
  },
];

/**
 * Homepage data comes from exactly three live sources plus settings — nothing
 * hardcoded that an admin edit should change. Counts for the dials are honest
 * placeholders (0 of 0 renders an empty gauge, never a fake number): real
 * aggregates arrive with sub-project 9's reporting.
 */
export default async function PublicHomePage() {
  const [settings, services, testimonials] = await Promise.all([
    getClinicSettings(),
    listActiveServices(),
    listPublishedTestimonials(),
  ]);
  const featured = services.slice(0, 3);

  return (
    <main>
      {/* Hero: pinned headline over the clinic photo, CTA pair, scroll cue. */}
      <section aria-label="Introduction" className="relative overflow-hidden">
        <div className="absolute inset-0" aria-hidden="true">
          <PublicImage
            file="hero-clinic.jpg"
            alt=""
            width={2400}
            height={1260}
            eager
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-ink/60" />
        </div>
        <div className="relative mx-auto flex min-h-[82vh] w-full max-w-6xl flex-col justify-center px-4 py-20 md:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">
            {settings.tagline ?? "Movement is medicine"}
          </p>
          <h1 className="font-display mt-3 max-w-2xl text-4xl font-semibold leading-tight text-ivory md:text-6xl">
            {settings.clinicName} — physiotherapy that gets you moving again
          </h1>
          <p className="mt-4 max-w-xl text-base text-ivory-dim md:text-lg">
            Sports injuries, post-surgery rehab, chronic pain and neurological recovery —
            treated by licensed therapists, booked online in under two minutes.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/book"
              className="inline-flex min-h-11 cursor-pointer items-center rounded-md bg-jade px-6 py-3 text-base font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
            >
              Book appointment
            </Link>
            <Link
              href="/services"
              className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line bg-surface px-6 py-3 text-base font-medium text-ivory transition-colors duration-150 hover:bg-surface-2"
            >
              Explore services
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <Reveal as="section" aria-label="Why choose us" className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
        <h2 className="font-display text-3xl font-semibold text-ivory">Why patients choose us</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-lg border border-line bg-surface p-6">
              <h3 className="font-semibold text-ivory">{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ivory-dim">{b.body}</p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Care photos */}
      <section aria-label="The clinic in action" className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <PublicImage file="care-1.jpg" alt="Hands-on physiotherapy treatment" width={1200} height={900} className="w-full rounded-lg" />
          <PublicImage file="care-2.jpg" alt="Patient doing a guided rehabilitation exercise" width={1200} height={900} className="w-full rounded-lg" />
        </div>
      </section>

      {/* Services preview */}
      <Reveal as="section" aria-label="Services" className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-6">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-3xl font-semibold text-ivory">What we treat</h2>
          <Link href="/services" className="cursor-pointer text-sm font-medium text-jade-text underline hover:opacity-80">
            All services
          </Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {featured.map((s) => (
            <Link
              key={s.id}
              href={`/services/${s.slug}`}
              className="group cursor-pointer rounded-lg border border-line bg-surface p-6 transition-colors duration-150 hover:bg-surface-2"
            >
              <h3 className="font-semibold text-ivory group-hover:text-jade-text">{s.name}</h3>
              {s.description && (
                <p className="mt-2 line-clamp-3 text-sm text-ivory-dim">{s.description}</p>
              )}
              <p className="tabular mt-3 text-sm font-semibold text-ivory">
                ₦{Number(s.defaultPrice.toString()).toFixed(2)}
                <span className="font-normal text-ivory-faint"> · {s.defaultDurationMinutes} min</span>
              </p>
            </Link>
          ))}
        </div>
      </Reveal>

      {/* Testimonials */}
      {testimonials.length > 0 && (
        <section aria-label="Patient stories" className="border-y border-line bg-surface-2/40 py-16">
          <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
            <TestimonialCarousel
              items={testimonials.map((t) => ({ patientName: t.patientName, content: t.content }))}
            />
          </div>
        </section>
      )}

      {/* Hours + location + closing CTA */}
      <Reveal as="section" aria-label="Visit us" className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-line bg-surface p-6">
            <h2 className="font-display text-xl font-semibold text-ivory">Opening hours</h2>
            <dl className="mt-3 flex flex-col">
              {DAY_KEYS.map((day) => {
                const hours = settings.openingHours[day];
                return (
                  <div key={day} className="flex items-baseline justify-between border-b border-dashed border-line py-2 last:border-b-0">
                    <dt className="text-sm font-medium capitalize text-ivory">{day}</dt>
                    <dd className="tabular text-sm text-ivory-dim">
                      {hours ? `${hours.open} – ${hours.close}` : "Closed"}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
          <div className="flex flex-col justify-between rounded-lg border border-line bg-surface p-6">
            <div>
              <h2 className="font-display text-xl font-semibold text-ivory">Find us</h2>
              {settings.address && <p className="mt-2 text-sm text-ivory-dim">{settings.address}</p>}
              {settings.contactPhone && (
                <p className="tabular mt-1 text-sm text-ivory-dim">{settings.contactPhone}</p>
              )}
            </div>
            <Link
              href="/book"
              className="mt-6 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md bg-jade px-6 py-3 text-base font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
            >
              Book appointment
            </Link>
          </div>
        </div>
      </Reveal>
    </main>
  );
}
