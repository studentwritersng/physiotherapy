# TetaPhysio — Sub-project 2: Clinic Configuration (Design Spec)

**Date:** 2026-08-29
**Covers PRDs:** 06 §6 (Clinic Settings), 03 FR1–FR3 (availability inputs), 02 §2.2 (services feed the public site)
**Depends on:** Sub-project 1 (Foundation) — complete
**Status:** Approved for implementation planning

---

## 1. Purpose

Sub-project 3's booking engine cannot compute a single bookable slot without three things it does not own: clinic operating hours, per-service duration, and per-therapist working hours. PRD-03 FR1 names all three as inputs and defers each to PRD-06. This slice builds them, plus the CMS-lite content that PRD-02 needs for the public site.

This is the first slice with real UI, so it also lands the design system tokens from `AGENTS.md`.

## 2. Scope

Four admin-only screens under the `(staff)` route group, plus the service layer sub-project 3 will consume.

| Screen | Route | Covers |
|---|---|---|
| Clinic settings | `/staff/settings` | Name, tagline, logo URL, contact details, address, opening hours, booking rules |
| Services | `/staff/settings/services` | List, create, edit, activate/deactivate, reorder |
| Therapist availability | `/staff/settings/availability` | Recurring weekly hours, dated exceptions, block-outs |
| Content | `/staff/settings/content` | About/mission text, testimonials |

All four are `requireRole("admin")`. PRD-06 §5 and §6 scope clinic configuration to admin; receptionists and therapists get no access.

### 2.1 No migration

`clinic_settings`, `services`, `therapist_availability` and `testimonials` were all created in Foundation (spec §4.4 authored the full 27-table schema in one pass, precisely so later slices add no core-table migrations). This slice is service modules, Server Actions, and screens.

### 2.2 Out of scope, with reasons

| Deferred | To | Why |
|---|---|---|
| Staff account creation, therapist profiles | 10 | PRD-06 §5 is staff *administration* — a different concern from clinic config, and profile photos need the upload pipeline |
| File upload for `logoUrl` / `imageUrl` | 6 | The `StorageProvider` gets its real Cloudflare R2 adapter alongside patient documents, where PRD-12's signed-URL requirement is decided once for both |
| Dashboard widgets (PRD-06 §2) | 9 | Every widget needs appointment or payment data that does not exist yet |
| Appointment administration (PRD-06 §3) | 3 | That is the booking engine |

PRD-06 bundles clinic settings, staff management, patient management and appointment administration into one document. This slice takes only the settings half; the remainder depends on data later slices create.

---

## 3. Resolved decisions

### 3.1 Opening hours stay JSON, guarded by Zod

PRD-03 §7 names a `clinic_hours` table; PRD-11 modelled it as a `clinic_settings.openingHours` JSON column instead, and Foundation built the column.

**Decision:** keep the column. A single Zod schema is the only way in or out — every write parses before persisting, every read parses on the way out.

```ts
const dayHoursSchema = z
  .object({
    open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM, 24-hour"),
    close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM, 24-hour"),
  })
  .refine((d) => d.close > d.open, { message: "Closing time must be after opening time" })
  .nullable(); // null = closed that day

const openingHoursSchema = z.object({
  monday: dayHoursSchema,
  tuesday: dayHoursSchema,
  wednesday: dayHoursSchema,
  thursday: dayHoursSchema,
  friday: dayHoursSchema,
  saturday: dayHoursSchema,
  sunday: dayHoursSchema,
});
```

**Rationale:** no migration against a live Neon database, and the booking engine reads hours from the same row it already reads booking rules from — no join. Parsing on read matters: a hand-edited row surfaces as a validation error at the boundary rather than as a crash inside slot generation.

`HH:MM` zero-padded means lexicographic string comparison is chronological comparison (`"09:00" < "17:00"`), so no window arithmetic in this slice needs a `Date`.

Multiple windows per day (a midday break) is deliberately not supported. No PRD asks for it, and it makes slot generation materially harder for a case the clinic has not stated.

### 3.2 A dated availability row overrides the weekly pattern

`TherapistAvailability` carries both a recurring `dayOfWeek` and a one-off `specificDate`, plus `isBlocked`. No PRD defines what happens when they collide.

**Decision:** strict precedence. If any `specificDate` row matches the date being resolved, the recurring `dayOfWeek` rows are ignored **entirely** for that date. Within whichever set wins, `isBlocked` windows subtract from open windows. The result is then intersected with clinic opening hours.

Consequences, which the UI must state plainly:

- A one-off Saturday clinic is a `specificDate` row with `isBlocked: false`.
- Leave or a holiday is a `specificDate` row with `isBlocked: true`.
- "I normally work Tuesdays but not this Tuesday" is one dated blocked row — no need to also delete the recurring row.

**Rationale:** the alternative (union both, only blocks subtract) means a therapist cannot suppress a single day without adding a separate blocking row, which is easy to forget and silently leaves the slot bookable. Precedence is also expressible as one pure function, so it can be exhaustively unit-tested without a database.

A therapist can never be available while the clinic is closed, because the opening-hours intersection is applied last.

### 3.3 Services are deactivated, not deleted

`Service` has both an `active` flag and a `deletedAt` column.

**Decision:** the admin UI exposes only Activate and Deactivate, which flip `active`. Deactivated services disappear from the public site and the booking form but stay attached to their historical appointments and invoices, so past reports still resolve the service name. `deletedAt` remains in the schema and the service layer filters on it, but no UI surfaces it in this slice.

**Rationale:** PRD-06 FR2 prefers deactivation over deletion for records with historical significance. Two similar-looking destructive actions on one screen invite the wrong click.

### 3.4 Mutations use Server Actions

Foundation used route handlers for auth. `ui-ux-pro-max`'s Next.js guidance (`DataFetching`, severity Medium) recommends Server Actions for mutations and flags "API route for every mutation" as the anti-pattern.

**Decision:** the four admin screens mutate through Server Actions. The six existing `/api/auth/*` route handlers stay exactly as they are — the Capacitor app (sub-project 11) and the Playwright suite both consume them as real HTTP endpoints.

**Rationale:** less client JS on every admin screen, progressive enhancement, and no hand-written fetch-and-redirect plumbing. Sub-project 4 renders the public site server-side and will call the service layer directly rather than over HTTP, so read-only API routes would be speculative.

### 3.5 URL fields now, upload later

`logoUrl` and `imageUrl` are text inputs accepting a URL. Foundation's `localStorageProvider` writes to `.uploads/`, which does not survive a Vercel deploy — building upload against it now would work locally and fail silently in production.

---

## 4. Service layer

Four modules under `src/server/services`, each owning one entity and its rules. Validation schemas live in `src/lib/zod/clinic.ts`, shared by the actions and the services.

| Module | Responsibility |
|---|---|
| `clinic-settings.ts` | Read and update the singleton; parses `openingHours` in both directions |
| `service-catalog.ts` | Service CRUD, slug generation, activate/deactivate, reorder; owns the `deletedAt` filter |
| `availability.ts` | Availability row CRUD, plus the pure resolution function |
| `testimonial.ts` | Testimonial CRUD and publish toggle |

### 4.1 The resolution function

This is the contract sub-project 3 depends on, so it takes no database handle and reads no clock:

```ts
export type TimeWindow = { start: string; end: string }; // HH:MM, Africa/Lagos wall-clock

export function resolveAvailability(
  date: string, // YYYY-MM-DD
  rows: TherapistAvailability[],
  openingHours: OpeningHours,
): TimeWindow[];
```

Order of operations:

1. Partition `rows` into those matching `date` via `specificDate` and those matching its weekday via `dayOfWeek`.
2. If any dated rows exist, discard the recurring set (§3.2).
3. Subtract `isBlocked` windows from open windows in the winning set.
4. Intersect the result with `openingHours` for that weekday. A `null` day yields `[]`.
5. Merge touching or overlapping windows, and return them sorted by `start`.

Array in, array out. Every branch is unit-testable.

### 4.2 Timezone boundary

Everything in this slice is wall-clock `Africa/Lagos`, expressed as `HH:MM` strings. Converting a window into real `timestamptz` instants belongs to sub-project 3, when it generates bookable slots. Keeping that conversion out of this slice means the availability logic has no timezone bugs to have.

`TIMEZONE` remains the single source in `src/lib/constants.ts`.

### 4.3 Settings singleton

`clinic_settings` is pinned to `id: 1`. The read is an upsert-with-defaults rather than `findUniqueOrThrow`, so a fresh database with no seed renders an empty settings form instead of a 500.

### 4.4 Shared slug helper

`prisma/seed.ts` currently has a private `slugify`. It moves to `src/lib/slug.ts` and both the seed and `service-catalog.ts` import it, so the two cannot drift into producing different slugs for the same service name — which would break the public service URLs in sub-project 4.

Slug collisions are resolved by appending `-2`, `-3` and so on, checked against existing rows including soft-deleted ones, since `slug` is `@unique` at the database level.

---

## 5. Server Actions

One `actions.ts` colocated with each route. Every action follows the same four steps, in this order:

```ts
"use server";

export async function updateClinicSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("admin");                            // 1. authorize
  const parsed = clinicSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error); // 2. validate
  await clinicSettings.update(parsed.data);              // 3. delegate
  revalidatePath("/staff/settings");                     // 4. revalidate
  return { ok: true, message: "Settings saved" };
}
```

`requireRole` runs **before** parsing, so an unauthorized caller never reaches validation. A `"use server"` export is a public HTTP endpoint whether or not a form points at it; the guard is what makes that safe. It throws, so an unchecked call still fails closed.

```ts
export type ActionState =
  | { ok: true; message: string }
  | { ok: false; message?: string; fieldErrors: Record<string, string> };
```

Forms consume this via `useActionState`, so each error renders next to the field that caused it.

---

## 6. Screens

A shared `SettingsLayout` provides a tab strip across the four pages. Forms are real `<form action={...}>` elements and work with JavaScript disabled. Client components are limited to what needs interactivity: the `useActionState` wrapper for pending and error state, the opening-hours editor, and the availability editor.

### 6.1 Design system

This is the first real UI, so it lands the tokens from `AGENTS.md`:

- A `@theme` block in `src/app/globals.css` defining the ten colour custom properties (`--color-primary` `#0891B2`, `--color-accent` `#059669`, `--color-destructive` `#DC2626`, and the rest).
- Fira Sans for UI text, Fira Code for numeric and tabular data — times, prices, durations.
- Primary actions use `--color-primary`; Deactivate uses `--color-destructive`.

This also retro-fits the Foundation auth screens, which currently use raw `gray-*` and `blue-*` utilities. That is in scope: they are the same design system, and leaving them inconsistent would mean two visual languages in one app.

### 6.2 UX requirements

From the `ux-guidelines` search, all three treated as requirements:

- **Inline validation** (Medium): validate on blur, never submit-only.
- **Submit feedback** (High): loading, then an explicit success or error state. Never a click with no response.
- **Error recovery** (Medium): every error carries a next step, not just a message.

Plus the `AGENTS.md` pre-delivery checklist: SVG icons rather than emoji, `cursor-pointer` on clickables, 150–300ms hover transitions, 4.5:1 minimum text contrast, visible focus rings, `prefers-reduced-motion` respected, and checks at 375px, 768px, 1024px and 1440px.

### 6.3 Opening hours editor

Seven rows, one per day. Each has a closed/open toggle and two `<input type="time">` fields. Native time input gives a real picker on Android with zero JavaScript, which is what PRD-04 FR4's low-end Android target wants.

### 6.4 Availability editor

A therapist selector, then two lists: recurring weekly windows and dated exceptions. Because a dated row overrides the weekly pattern (§3.2), each dated row renders with an explicit "replaces weekly hours" note. Without it the precedence rule is invisible and admins will be surprised by a therapist vanishing from the booking calendar.

---

## 7. Testing

**Vitest, service layer, against `teta_physio_test`:**

- Opening hours round-trip through Zod; malformed stored JSON raises a validation error on read.
- `close` before `open` is rejected; a `null` day means closed.
- Slug generation, and collision resolution against existing and soft-deleted rows.
- Deactivated services are excluded from the public list but still resolve by id for historical rows.
- Soft-deleted services are excluded from every read.
- Testimonials: unpublished ones never appear in the published list.

**Vitest, `resolveAvailability`, no database:**

- Recurring rows only, for a matching and a non-matching weekday.
- A dated row overrides the recurring set entirely.
- A dated blocked row on a normally-working day yields `[]`.
- A blocked window splits an open window into two.
- Clinic-closed days yield `[]` regardless of therapist rows.
- A window extending past closing time is truncated to closing time.
- Overlapping open windows merge.

**Playwright:** one admin journey per screen — save settings, create a service, add availability, publish a testimonial — plus the negative checks that a therapist and a receptionist are both refused at `/staff/settings`.

---

## 8. Definition of done

1. `npx tsc --noEmit`, `npx eslint .` and `npx next build` all clean.
2. The full Vitest suite passes, including the new service and resolution tests.
3. The Playwright suite passes, including the two negative role checks.
4. An admin can set opening hours, create a service, and give a therapist availability, all through the browser.
5. `resolveAvailability` returns correct windows for every case in §7.
6. The design tokens are in `globals.css` and the Foundation auth screens use them.
7. No new migration exists — `prisma migrate status` reports the database in sync.
8. `src/lib/nav.ts` marks Clinic settings `available: true`, and the existing `tests/unit/nav.test.ts` assertion that at least one link is unavailable still holds (Appointments, Patients, Payments, Staff and Reports remain unbuilt).

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| JSON opening hours drift out of shape | Zod parses on read as well as write, so a bad row fails at the boundary rather than inside the booking engine |
| The dated-overrides-recurring rule surprises admins | The editor labels every dated row as replacing weekly hours; §3.2 is recorded so sub-project 3 implements the same precedence |
| Server Actions look like a second mutation pattern next to Foundation's route handlers | §3.4 records why both exist: actions for forms, route handlers where a non-browser client needs HTTP |
| Retro-fitting design tokens touches Foundation's auth screens | Covered by the existing Playwright login journeys, which assert on accessible names and roles rather than CSS classes |
| Flipping Clinic settings to `available: true` breaks an existing test | It does not: `navLabels` in `tests/e2e/login.spec.ts:70` strips the trailing "soon" badge, so it returns the plain label whether the link is enabled or disabled, and the admin navigation assertion holds unchanged. `tests/unit/nav.test.ts:45` only requires at least one unavailable link, and five remain |
| Wall-clock strings get confused with instants in sub-project 3 | §4.2 makes the boundary explicit: this slice is `HH:MM` only, conversion happens where slots are generated |
