import Link from "next/link";
import { PublicImage } from "@/components/PublicImage";
import { Reveal } from "@/components/Reveal";
import { TestimonialCarousel } from "@/components/TestimonialCarousel";
import { getClinicSettings } from "@/server/services/clinic-settings";
import { listActiveServices } from "@/server/services/service-catalog";
import { listPublishedTestimonials } from "@/server/services/testimonial";
import { listPublicTherapists } from "@/server/services/staff-list";
import { buildWhatsAppLink } from "@/lib/site";

export const metadata = {
  title: "TetaPhysio — Physiotherapy in Lagos",
  description:
    "Expert physiotherapy in Lagos: sports injury rehab, post-surgery recovery, pain management and more. Book online in under two minutes.",
};

type ServiceLike = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  defaultDurationMinutes: number;
  defaultPrice: unknown;
};

/* Proof points, not performance claims: nothing here needs a reporting
   pipeline to stay honest (sub-project 9 owns real aggregates). */
const PROOFS = [
  { lead: "Licensed only", body: "Qualified physiotherapists, every session." },
  { lead: "Same-week", body: "Real-time slots, booked online." },
  { lead: "1:1 care", body: "Your therapist, undivided." },
  { lead: "No referral", body: "Book directly — no GP note needed." },
];

const PILLARS = [
  {
    icon: "assess",
    title: "Assess and diagnose",
    body: "Your first session is a full hour: history, movement testing and a diagnosis explained in plain language.",
    checks: ["60-minute first session", "Goals you set together"],
  },
  {
    icon: "treat",
    title: "Treat, hands on",
    body: "Manual therapy and guided exercise, one to one — never handed off to an assistant, never rushed.",
    checks: ["1:1 sessions throughout", "Plan reviewed every visit"],
  },
  {
    icon: "sustain",
    title: "Sustain the result",
    body: "Your home programme lives in the patient portal, with reviews until discharge — and a plan that outlasts it.",
    checks: ["Exercises in your portal", "Planned, supported discharge"],
  },
] as const;

type ZoneKey = "back" | "neck" | "sports" | "surgery" | "chronic";

const ZONES: {
  key: ZoneKey;
  label: string;
  badge: string;
  timing: string;
  title: string;
  description: string;
  involves: string;
  progress: string;
  /** First live service whose name matches wins; otherwise plain /book. */
  match: RegExp;
}[] = [
  {
    key: "back",
    label: "Back & spine",
    badge: "Spinal assessment",
    timing: "Typical course: often 4–8 weeks",
    title: "Calm the back, rebuild the core that protects it",
    description:
      "Persistent back pain usually traces to stiffness, weak deep-core support or irritated joints — not damage. We find which, settle it, then strengthen what guards your spine.",
    involves: "Hands-on joint and soft-tissue treatment plus progressive core and hip strengthening.",
    progress: "Sitting, bending and lifting get easier first; heavy tasks return as strength builds.",
    match: /back|spine|lumbar|sciatica/i,
  },
  {
    key: "neck",
    label: "Neck & posture",
    badge: "Desk-strain recovery",
    timing: "Typical course: often 3–6 weeks",
    title: "Undo the desk posture, free the neck",
    description:
      "Hours over a screen stiffen the neck and upper back and feed tension headaches. We release the stiffness, retrain deep neck support and fix the workstation habits behind it.",
    involves: "Gentle joint mobilisation, deep-neck muscle retraining and ergonomic adjustments.",
    progress: "Headaches ease and turning your head stops feeling guarded.",
    match: /neck|cervical|posture/i,
  },
  {
    key: "sports",
    label: "Sports injuries",
    badge: "Return to play",
    timing: "Typical course: often 6–12 weeks",
    title: "Rehab with a finish line: your return to sport",
    description:
      "Sprains, strains and post-injury deconditioning need loading, not rest alone. We phase your rehab from protection to strength to sport-specific testing before you compete again.",
    involves: "Phased strength loading, agility work and objective return-to-play testing.",
    progress: "Milestones are measured — strength symmetry, hop tests, full training — before clearance.",
    match: /sport|injury|acl|athlet/i,
  },
  {
    key: "surgery",
    label: "Post-surgery",
    badge: "Surgeon-aligned rehab",
    timing: "Typical course: often 8–16 weeks",
    title: "Recover from surgery on your surgeon's protocol",
    description:
      "Joint replacements, repairs and fixations heal best under guided loading. We follow your surgeon's protocol and progress you from wound-safe mobility to full strength.",
    involves: "Swelling control, staged mobility and strength work, gait retraining where needed.",
    progress: "Walking unaided, stairs and independence return step by step, on protocol.",
    match: /surg|post-op|orthop|rehab/i,
  },
  {
    key: "chronic",
    label: "Chronic pain",
    badge: "Long-term pain care",
    timing: "Ongoing care, reviewed regularly",
    title: "Long-standing pain needs a longer view",
    description:
      "Pain that has lasted months behaves differently from a fresh injury — the system stays sensitive after tissues heal. We combine gentle treatment with graded activity to turn the volume down.",
    involves: "Pacing, graded movement exposure and flare-up plans you can run yourself.",
    progress: "Better days get more frequent; setbacks get shorter and manageable.",
    match: /chronic|persistent|fibromyalgia|pain/i,
  },
];

/** Inline stroke icons — the project rule is hand-rolled SVG, never an icon font. */
function PillarIcon({ name }: { name: (typeof PILLARS)[number]["icon"] }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    className: "size-7",
  } as const;
  if (name === "assess") {
    return (
      <svg {...common}>
        <path d="M9 11.5 11 14l4-5" />
        <rect x="4" y="3" width="16" height="18" rx="2.5" />
        <path d="M8 7.5h8" />
      </svg>
    );
  }
  if (name === "treat") {
    return (
      <svg {...common}>
        <path d="M7 11.5V6.8a1.3 1.3 0 0 1 2.6 0v4.4m0-5.6a1.3 1.3 0 0 1 2.6 0v5.6m0-4.4a1.3 1.3 0 0 1 2.6 0v6.2c0 3-2 5.4-5 5.4-2.2 0-3.4-1-4.6-3.2l-1.9-3.6a1.2 1.2 0 0 1 2-1.3L7 12" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 19V9m5.5 10V5M15 19v-8m5 8V7" />
      <path d="M3 19h18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4 shrink-0"
    >
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[18px] transition-transform duration-200 group-hover:translate-x-1"
    >
      <path d="M4 12h15m-6-7 7 7-7 7" />
    </svg>
  );
}

/**
 * Landing page. Section order mirrors doc/index.html (hero, method, programs,
 * condition explorer, testimonials, gallery + closing CTA) in the project's
 * light palette and type pairing — but every word and number is platform
 * content: live clinic data, real routes, and no invented statistics.
 */
export default async function PublicHomePage({
  searchParams,
}: {
  searchParams?: Promise<{ zone?: string | string[] }>;
}) {
  const params = (await searchParams) ?? {};
  const zoneParam = Array.isArray(params.zone) ? params.zone[0] : params.zone;
  const zone = ZONES.find((z) => z.key === zoneParam) ?? ZONES[0]!;

  const [settings, services, testimonials, therapists] = await Promise.all([
    getClinicSettings(),
    listActiveServices(),
    listPublishedTestimonials(),
    listPublicTherapists(),
  ]);
  const featured = services.slice(0, 4) as ServiceLike[];
  const clinician = therapists[0];
  const initials = clinician
    ? clinician.name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : null;
  const zoneService = services.find((s) => zone.match.test(s.name));
  const whatsapp = buildWhatsAppLink(
    settings.contactWhatsapp,
    "Hello TetaPhysio, I'd like to book an appointment.",
  );

  return (
    <main>
      {/* HERO — split headline + first-visit card, over the page wash. */}
      <section aria-label="Introduction" className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 right-[-8%] size-[32rem] rounded-full bg-jade/10 blur-3xl" />
          <div className="absolute -left-40 top-1/3 size-[26rem] rounded-full bg-gold-dim blur-3xl" />
        </div>
        <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-4 pb-16 pt-14 md:px-6 md:pt-20 lg:grid-cols-12">
          <div className="flex flex-col items-start lg:col-span-7">
            <p className="text-sm font-semibold text-gold-text">
              {settings.tagline ?? "Physiotherapy in Lagos"}
            </p>
            <h1 className="font-display mt-3 max-w-2xl text-4xl font-medium leading-[1.05] tracking-tight text-ivory md:text-6xl">
              Physiotherapy that gets you moving —{" "}
              <span className="font-display italic">and keeps you moving</span>
            </h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-ivory-dim md:text-lg">
              One-to-one assessment, hands-on treatment and a home exercise plan in your
              patient portal — delivered by licensed physiotherapists, booked online in
              under two minutes.
            </p>
            <div className="mb-10 mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/book"
                className="inline-flex min-h-11 cursor-pointer items-center rounded-md bg-jade px-6 py-3 text-base font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
              >
                Book appointment
              </Link>
              <Link
                href="/services"
                className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line-strong bg-surface px-6 py-3 text-base font-medium text-ivory transition-colors duration-150 hover:bg-surface-2"
              >
                Explore services
              </Link>
            </div>
            <div className="grid w-full grid-cols-2 gap-6 border-t border-line pt-6 sm:grid-cols-4">
              {PROOFS.map((p) => (
                <div key={p.lead} className="flex flex-col">
                  <span className="font-display text-lg font-semibold text-ivory">{p.lead}</span>
                  <span className="mt-1 text-xs leading-snug text-ivory-dim">{p.body}</span>
                </div>
              ))}
            </div>
          </div>

          {/* First-visit card: real photo, real visit contents, real clinician. */}
          <div className="lg:col-span-5">
            <div className="overflow-hidden rounded-lg border border-line bg-surface p-3 shadow-glass">
              <div className="relative h-60 w-full overflow-hidden rounded-md">
                <PublicImage
                  file="care-1.jpg"
                  alt="Physiotherapist treating a patient hands on"
                  width={1200}
                  height={900}
                  eager
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#08201a]/70 via-transparent to-transparent" />
                <div className="absolute inset-x-3 bottom-3 flex items-center justify-between text-sm">
                  <span className="font-medium text-white">Your first visit</span>
                  <span className="rounded bg-white/20 px-2 py-0.5 text-xs text-white backdrop-blur-md">
                    60 minutes
                  </span>
                </div>
              </div>
              <div className="space-y-3 p-3">
                <h2 className="font-display text-lg font-semibold text-ivory">
                  What happens at visit one
                </h2>
                {[
                  "Full assessment and a diagnosis in plain language",
                  "First hands-on treatment in the same session",
                  "Home exercises added to your patient portal",
                ].map((item) => (
                  <p key={item} className="flex items-center gap-2 text-sm text-ivory">
                    <span className="text-jade-text">
                      <CheckIcon />
                    </span>
                    {item}
                  </p>
                ))}
                <div className="flex items-center justify-between border-t border-line pt-3">
                  {clinician ? (
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="flex size-9 items-center justify-center rounded-full bg-jade-dim text-sm font-bold text-jade-text"
                      >
                        {initials}
                      </span>
                      <div>
                        <p className="text-sm font-semibold leading-tight text-ivory">
                          {clinician.name}
                        </p>
                        <p className="text-xs text-ivory-dim">
                          {clinician.title ?? "Physiotherapist"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    settings.contactPhone && (
                      <a
                        href={`tel:${settings.contactPhone.replace(/\s/g, "")}`}
                        className="tabular cursor-pointer text-sm font-semibold text-ivory"
                      >
                        {settings.contactPhone}
                      </a>
                    )
                  )}
                  <Link
                    href="/about"
                    className="cursor-pointer text-sm font-medium text-jade-text underline hover:opacity-80"
                  >
                    Meet the team
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* METHOD — three pillars of how recovery works here. */}
      <Reveal as="section" aria-label="How recovery works" className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
        <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-xl">
            <p className="mb-1 text-sm font-semibold text-gold-text">The care standard</p>
            <h2 className="font-display text-3xl font-medium tracking-tight text-ivory md:text-4xl">
              Recovery, rebuilt around <span className="font-display italic">your</span> movement
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-ivory-dim">
            No machines left running while you wait, no plan you never see. Three phases,
            one therapist who knows your case, and a record that follows you.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className="flex flex-col justify-between border-t-2 border-line-strong pt-6">
              <div>
                <span className="mb-4 block text-ivory">
                  <PillarIcon name={pillar.icon} />
                </span>
                <h3 className="font-display text-xl font-semibold text-ivory">{pillar.title}</h3>
                <p className="mb-4 mt-2 text-sm leading-relaxed text-ivory-dim">{pillar.body}</p>
              </div>
              <ul className="space-y-1.5">
                {pillar.checks.map((check) => (
                  <li key={check} className="flex items-center gap-2 text-sm text-ivory">
                    <span className="text-gold-text">
                      <CheckIcon />
                    </span>
                    {check}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Reveal>

      {/* SERVICES — live catalog cards. */}
      <section aria-label="Services" className="border-y border-line bg-surface-2/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
          <Reveal className="mb-10 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="mb-1 text-sm font-semibold text-ivory-dim">Focused clinical care</p>
              <h2 className="font-display text-3xl font-medium tracking-tight text-ivory md:text-4xl">
                What we treat
              </h2>
            </div>
            <Link
              href="/services"
              className="group inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-ivory hover:text-jade-text"
            >
              View all services
              <ArrowIcon />
            </Link>
          </Reveal>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((s) => (
              <Link
                key={s.id}
                href={`/services/${s.slug}`}
                className="group flex cursor-pointer flex-col justify-between rounded-lg border border-line bg-surface p-6 transition-shadow duration-300 hover:shadow-glass"
              >
                <div>
                  <p className="tabular mb-3 text-xs font-medium text-ivory-dim">
                    {s.defaultDurationMinutes} min session
                  </p>
                  <h3 className="font-display text-lg font-semibold leading-snug text-ivory">
                    {s.name}
                  </h3>
                  {s.description && (
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ivory-dim">
                      {s.description}
                    </p>
                  )}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-sm">
                  <span className="tabular font-semibold text-ivory">
                    ₦{Number(s.defaultPrice?.toString() ?? 0).toFixed(2)}
                  </span>
                  <span className="text-ivory-dim">
                    <ArrowIcon />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CONDITIONS — query-param tabs, no JS needed; CTA pre-fills booking. */}
      <section aria-label="Conditions we treat" id="conditions" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 md:px-6">
        <Reveal className="mb-8 max-w-2xl">
          <p className="mb-1 text-sm font-semibold text-gold-text">Not sure where to start?</p>
          <h2 className="font-display text-3xl font-medium tracking-tight text-ivory md:text-4xl">
            Tell us where it hurts
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ivory-dim">
            Choose a region to see how we assess it, what treatment involves, and what
            progress looks like — then book straight into the matching service.
          </p>
        </Reveal>
        <div className="mb-8 flex flex-wrap gap-2" role="tablist" aria-label="Body regions">
          {ZONES.map((z) => {
            const active = z.key === zone.key;
            return (
              <Link
                key={z.key}
                scroll={false}
                role="tab"
                aria-selected={active}
                href={{ pathname: "/", query: { zone: z.key } }}
                className={`cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150 ${
                  active
                    ? "bg-jade text-btn-ink"
                    : "bg-surface-2 text-ivory-dim hover:bg-surface-3 hover:text-ivory"
                }`}
              >
                {z.label}
              </Link>
            );
          })}
        </div>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          <div className="rounded-lg border border-line bg-surface p-6 md:p-8 lg:col-span-7">
            <p className="text-sm">
              <span className="font-semibold text-gold-text">{zone.badge}</span>{" "}
              <span className="text-ivory-dim">· {zone.timing}</span>
            </p>
            <h3 className="font-display mt-2 text-2xl font-medium text-ivory">{zone.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ivory-dim md:text-base">
              {zone.description}
            </p>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-md bg-surface-2 p-4">
                <p className="text-sm font-semibold text-ivory">What treatment involves</p>
                <p className="mt-1 text-sm leading-relaxed text-ivory-dim">{zone.involves}</p>
              </div>
              <div className="rounded-md bg-surface-2 p-4">
                <p className="text-sm font-semibold text-ivory">What progress looks like</p>
                <p className="mt-1 text-sm leading-relaxed text-ivory-dim">{zone.progress}</p>
              </div>
            </div>
            <Link
              href={zoneService ? `/book?service=${zoneService.slug}` : "/book"}
              className="mt-6 inline-flex min-h-11 cursor-pointer items-center rounded-md bg-jade px-6 py-3 text-sm font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
            >
              {zoneService ? `Book ${zoneService.name}` : "Book appointment"}
            </Link>
          </div>
          <div className="rounded-lg border border-line bg-surface-2 p-6 md:p-8 lg:col-span-5">
            <h4 className="text-sm font-semibold text-ivory">What recovery looks like</h4>
            <ol className="mt-4 space-y-5 border-l border-line-strong pl-5">
              {[
                { phase: "First: calm it down", body: "Settle pain and stiffness so you can move and sleep again." },
                { phase: "Then: rebuild strength", body: "Progressive loading restores the support the injury took away." },
                { phase: "Finally: stay independent", body: "A home programme and discharge plan keep you out of the clinic." },
              ].map((step, i) => (
                <li key={step.phase} className="relative">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[27px] top-1 size-2.5 rounded-full ring-4 ring-surface-2 ${
                      i === 0 ? "bg-gold" : i === 1 ? "bg-jade" : "bg-sky"
                    }`}
                  />
                  <p className="text-sm font-semibold text-ivory">{step.phase}</p>
                  <p className="mt-0.5 text-sm text-ivory-dim">{step.body}</p>
                </li>
              ))}
            </ol>
            <p className="mt-6 border-t border-line pt-4 text-sm text-ivory-dim">
              Timelines vary — your plan is personal, and phases overlap.
            </p>
          </div>
        </div>
      </section>

      {/* STORIES — live testimonials, carousel only when non-empty. */}
      {testimonials.length > 0 && (
        <section aria-label="Patient stories" id="stories" className="scroll-mt-20 border-y border-line bg-surface-2/60">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
            <Reveal className="mb-8 max-w-xl">
              <p className="mb-1 text-sm font-semibold text-gold-text">Recovery, in their words</p>
              <h2 className="font-display text-3xl font-medium tracking-tight text-ivory md:text-4xl">
                Patient stories
              </h2>
            </Reveal>
            <TestimonialCarousel
              items={testimonials.map((t) => ({ patientName: t.patientName, content: t.content }))}
            />
          </div>
        </section>
      )}

      {/* GALLERY + CLOSING CTA */}
      <section aria-label="Visit us" className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="relative h-80 overflow-hidden rounded-lg md:col-span-7">
            <PublicImage
              file="exterior-clinic.jpg"
              alt="The front of the TetaPhysio clinic"
              width={1600}
              height={900}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-[#08201a]/80 via-[#08201a]/10 to-transparent p-6">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
                Easy to reach
              </span>
              <h3 className="font-display mt-1 text-xl font-semibold text-white">
                {settings.address ?? "A calm clinic, set up for recovery"}
              </h3>
            </div>
          </div>
          <div className="relative h-80 overflow-hidden rounded-lg md:col-span-5">
            <PublicImage
              file="care-2.jpg"
              alt="Patient doing a guided rehabilitation exercise"
              width={1200}
              height={900}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-[#08201a]/80 via-[#08201a]/10 to-transparent p-6">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
                Guided exercise space
              </span>
              <h3 className="font-display mt-1 text-xl font-semibold text-white">
                Rehab supervised, never solo
              </h3>
            </div>
          </div>
        </div>

        <Reveal className="relative overflow-hidden rounded-lg bg-ivory p-8 md:p-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-20 size-96 rounded-full bg-jade/20 blur-3xl"
          />
          <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/80">Same-week appointments</p>
              <h2 className="font-display mt-2 text-3xl font-medium leading-tight text-ink md:text-4xl">
                Start moving better this week.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink/75 md:text-base">
                Your first visit is a full hour: assessment, diagnosis and first treatment —
                with a plan you take home in your portal.
              </p>
              <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink/75">
                <span className="flex items-center gap-1.5">
                  <span className="text-ink">
                    <CheckIcon />
                  </span>
                  No referral needed
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-ink">
                    <CheckIcon />
                  </span>
                  Book online in two minutes
                </span>
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col">
              <Link
                href="/book"
                className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md bg-jade px-6 py-3 text-base font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
              >
                Book appointment
              </Link>
              {whatsapp ? (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-ink/25 px-6 py-3 text-base font-medium text-ink transition-colors duration-150 hover:bg-ink/10"
                >
                  WhatsApp us
                </a>
              ) : (
                settings.contactPhone && (
                  <a
                    href={`tel:${settings.contactPhone.replace(/\s/g, "")}`}
                    className="tabular inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-ink/25 px-6 py-3 text-base font-medium text-ink transition-colors duration-150 hover:bg-ink/10"
                  >
                    {settings.contactPhone}
                  </a>
                )
              )}
            </div>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
