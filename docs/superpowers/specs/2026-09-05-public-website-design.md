# TetaPhysio — Sub-project 4: Public Website (Design Spec)

**Date:** 2026-09-05
**Covers PRDs:** 02 (Public Website), 03 §2 + §4 (public booking flow), 12 (privacy policy page)
**Depends on:** Sub-project 1 (Foundation), Sub-project 2 (Clinic Configuration — settings, services, testimonials, staff profiles), Sub-project 3 (Booking Engine — `getSlotsForDate`, status graph)
**Status:** Approved for implementation planning

---

## 1. Purpose

The clinic's primary online presence: inform prospective patients, build trust, and funnel visitors into booking — no login required (PRD-02 FR5). This is the Meng To surface per `AGENTS.md`'s motion rule: scroll storytelling for the marketing narrative, with every interactive element held under Emil restraint.

## 2. Brief

Per `AGENTS.md`, every design-heavy sub-project opens with the three-line formula:

1. **WHO IT'S FOR** — a first-time visitor in Lagos deciding whether to trust this clinic with their body, on a mid-range Android over mobile data.
2. **HOW IT SHOULD FEEL** — "quiet luxury, warm-dark restraint" (the mockup's recipe), on the cinema side of the motion rule: pinned hero-to-content transition, scroll reveals, animated goniometer dials.
3. **ONE THING TO AVOID** — the centered-hero SaaS template. If it looks like every AI landing page, the slice fails no matter how pretty.

## 3. Scope

| In scope | Notes |
|---|---|
| Homepage (`/`) | Hero, benefits, animated stat dials, testimonials, hours/location, dual CTAs, sticky WhatsApp button |
| Services grid + detail (`/services`, `/services/[slug]`) | Rendered from the live service catalog; "Book this service" CTA pre-fills booking |
| About (`/about`) | Story, mission, therapist profiles from `staff_profiles` |
| Contact (`/contact`) | Click-to-call, wa.me chat, mailto, address, embedded map, hours table |
| Public booking flow (`/book`) | Full inline booking, no login (§6) |
| Privacy policy (`/privacy`) | PRD-12 requirement; doubles for app-store submission |
| SEO + performance | Per-page meta, semantic landmarks, sitemap, robots, optimized images |

| Out of scope | To |
|---|---|
| Blog/content marketing, multi-language, A/B testing, live chat widget | Excluded by PRD-02 §4 (WhatsApp covers chat) |
| Admin image upload | Sub-project 6, with the R2 adapter (same decision as sub-project 2 §3.5) |
| Portal appointment UI, visitor booking management | Sub-project 5 (no login → no identity to scope management to) |
| Booking notifications (confirmation SMS/WhatsApp) | Sub-project 8 |

No migration. Every data source in this slice already exists.

## 4. Resolved decisions

### 4.1 Images: placeholders now, real photos later

The homepage must carry photography to avoid the AI-slop look, but no photos exist yet. Every image slot renders a sized placeholder component keyed to the shot list below; supplying a photo is file replacement, not redesign.

**Shot list** (filenames are the contract — drop into `public/images/`, no code change):

| # | File | Subject | Size (display @2x) | Where |
|---|---|---|---|---|
| 1 | `hero-clinic.jpg` | Treatment room or therapist at work, warm light, landscape with copy space left | 2400×1260 | Homepage hero |
| 2 | `care-1.jpg` | Hands-on therapy close-up (no faces needed) | 1200×900 | Homepage "why choose us" |
| 3 | `care-2.jpg` | Exercise/rehab session, patient active | 1200×900 | Homepage secondary |
| 4 | `clinic-exterior.jpg` | Building entrance or reception, daytime | 1600×900 | Contact + footer card |
| 5–10 | `staff-<slug>.jpg` | One headshot per therapist, plain background | 800×800 | About profiles |
| 11–16 | `service-<slug>.jpg` | One per service (equipment, room, motion); optional per PRD-02 §2.2 | 1200×800 | Services grid + detail |

Photo direction: warm natural light over fluorescent, deep greens/ivory in frame where possible, no white-coat-stock stiffness. Phone photos are fine — build-time processing handles grading via a consistent CSS treatment (soft duotone wash in `--jade-dim` at low opacity, same radius system).

**Rationale:** real clinic photos build the most trust and can never look generated. Stock risks reverse-image discovery; AI generation risks the exact look being avoided and struggles with believable physiotherapy scenes.

### 4.2 Full inline booking, no login

Visitors pick service → therapist (or no preference) → date → slot → name/phone → submit, powered by the same `getSlotsForDate` engine as the staff flow. PRD-03 §2 exactly, and the PRD-02 2-click success criterion.

**Rationale:** a request-a-slot form costs staff time per booking and leaves the no-double-booking guarantee uncovered in the confirmation gap; WhatsApp-only abandons PRD-03 §2 and leaves no record. The engine already exists — this slice is a thin unauthenticated consumer of it.

### 4.3 Restrained scroll cinema, zero new dependencies

Pinned hero-to-content transition, IntersectionObserver fade/slide reveals, testimonial carousel (auto-advance, pause on interaction), goniometer dials animating to value on scroll into view, animated stat counters. All hand-rolled; no GSAP/Lenis (~70KB against PRD-00 §2, and jank risk on PRD-04 FR4's mid-range Androids). `prefers-reduced-motion` disables the lot.

### 4.4 Public visitors see free/busy only

Taken slots are hidden on the public grid — never struck-through with names/times. Staff see struck-through slots with context because they need to understand a full day; visitors must learn nothing about other patients. Same engine, different presentation rule.

### 4.5 Abuse guard is the existing rate limiter

The 5-per-15min throttle applies per phone + IP on the public booking action, so the form can't be used to enumerate patients or spam bookings. No new mechanism.

## 5. Pages and data flow

All pages are Server Components reading the service layer directly — no API routes, no client fetch for content. Client components are limited to what needs interactivity: booking slot picker state, testimonial carousel, reveal-on-scroll wrappers, animated dials/counters.

| Route | Content source |
|---|---|
| `/` | settings (name, tagline, hours, contact) + top 3 active services + published testimonials + hero image |
| `/services` | `listActiveServices()` + `service-<slug>.jpg` or goniometer-motif SVG fallback tile |
| `/services/[slug]` | `getServiceBySlug`; unknown slug → `notFound()` |
| `/about` | settings `aboutContent` + therapist `staff_profiles` + `staff-<slug>.jpg` (initials tile fallback) |
| `/contact` | settings contact + opening hours; wa.me link with pre-filled message (PRD-02 FR6) |
| `/book` | services + therapists + `getSlotsForDate`; `?service=<slug>` preselects (§6) |
| `/privacy` | Static copy |

Services without a photo and staff without a headshot render designed fallbacks (goniometer-motif tile / initials tile in brand tokens) — never grey boxes, never broken images.

## 6. Public booking flow

Unauthenticated, no session. Five steps on `/book`, each a GET form so the URL always represents state — shareable, back-button safe, works without JS:

1. **Service** — grid of active services; `?service=<slug>` preselects from service-page CTAs.
2. **Therapist** — list plus "No preference" (fans out per sub-project 3 §5.1, pins on booking).
3. **Date + slot** — 14-day strip, then the 15-minute grid. Free slots only (§4.4).
4. **Details** — PRD-03 §2 field list verbatim: full name, phone, optional email, new/returning flag, optional reason.
5. **Confirm** — writes at `scheduled` with `bookedVia: "public"`, phone-matched to an existing patient or a new lead (same `findWalkInMatch` semantics as staff flow). Confirmation screen carries a booking reference in the form `APT-` plus six uppercase alphanumerics derived from the appointment id (e.g. `APT-7K2Q9M`).

## 7. SEO and performance

PRD-02 FR4 + FR2, treated as requirements rather than polish:

- Per-page `<title>`/description from live data (service names, clinic name).
- One `h1` per page, landmark regions, descriptive alt text (or empty alt for decorative washes).
- `sitemap.xml` generated from routes + service slugs; `robots.txt` allowing all.
- `next/image` with blur placeholders and responsive sizes; lazy below-fold; fonts already self-hosted.
- No client JS on content pages beyond the booking picker, carousel, and reveal/dial animation modules.

## 8. Testing

**Vitest:** booking-reference derivation, sitemap content (routes + live service slugs), wa.me link construction with the pre-filled message, phone-match/lead-branch reuse (already covered in sub-project 3 — reference, don't duplicate).

**Playwright:** first-time visitor reaches the booking form within 2 clicks from the homepage (PRD-02 success criterion); full public booking journey (service → no-preference → slot → details → confirmation with reference); oversold slot rejected with a friendly error; rate limiter engages on rapid resubmission; admin edits hours/adds a service and the public site reflects it with no deploy (render-from-live-data proof).

**Lighthouse:** mobile performance ≥ 90 on the homepage with placeholder images (spec §8 gate).

## 9. Definition of done

1. `npx tsc --noEmit`, `npx eslint .` and `npx next build` all clean.
2. Full Vitest suite green.
3. Playwright green, including the 2-click booking reach and the public booking journey.
4. Every image slot in §4.1 renders a sized placeholder; supplying a file with the listed name swaps it in with no code change.
5. Lighthouse mobile performance ≥ 90 on `/` with placeholders.
6. No new migration — `prisma migrate status` reports the database in sync.
7. No new runtime dependencies — `package.json` unchanged except version bumps.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Real photos never arrive, placeholders ship | Placeholders are sized, composed layout blocks — but cap it: launch-blocking only for the hero; section images degrade to the SVG-motif tiles, which are designed, not grey |
| Public booking gets spammed or probed | Existing 5-per-15min throttle per phone + IP (§4.5); free/busy only (§4.4) leaks nothing |
| Scroll motion janks on low-end Android | Hand-rolled Observer + CSS only, no GSAP/Lenis; `prefers-reduced-motion` kills the lot; Lighthouse gate catches regressions |
| Service slugs change and break `/services/[slug]` links | Slugs are immutable since sub-project 2 (`updateService` never regenerates); unknown slugs `notFound()` cleanly |
| Duplicating staff booking logic in the public flow | The flow calls `getSlotsForDate` + the same book path — one engine, two presentations. Any divergence is a bug, caught by the oversold-slot test |
