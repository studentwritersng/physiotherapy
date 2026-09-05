# Patient Portal + Intake Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the patient portal (dashboard, appointments, intake, profile) with staff-verified account linking and required email.

**Architecture:** Thin portal over existing engines. A new `src/server/services/portal.ts` resolves the session user's linked patient and scopes every query by `patientId`. Booking mutations delegate to `bookAppointment` / `rescheduleAppointment` / `cancelAppointment` in `booking.ts` with `bookedVia: "portal"`. No new tables, no migration.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7, PostgreSQL 17, Tailwind v4, Vitest, Playwright.

## Global Constraints

- Prisma 7: import from `@/generated/prisma/client`, never `@prisma/client`. A `PrismaPg` driver adapter is mandatory.
- ESM only (`"type": "module"`). No `require()`.
- Timezone is `Africa/Lagos`, from `TIMEZONE` in `src/lib/constants.ts`. Never hardcode it.
- Enum values are `snake_case`. Display casing is a UI concern.
- `timestamptz` for timestamps, `Decimal(12,2)` for money, `@db.Uuid` for IDs.
- Never run `npm install`. No new dependencies. Tailwind only — no shadcn/Radix, no chart libs.
- Design tokens only (`bg-ink`, `text-ivory`, `border-line`, `bg-jade`+`text-btn-ink`, `font-display`); no raw palette utilities.
- `(portal)` routes REQUIRE `requireRole("patient")` at the layout (already there). Ownership `where` clauses in every portal service. Patient id always derived from session, never from URL params.
- Route handlers / Server Actions parse, authorize, delegate to `src/server/**`, serialize. No business logic in actions.

---

## Deviation from the spec (recorded, not hidden)

Spec §6 says staff approve the link "on the existing staff patient record".
There is no patient record page — staff has appointments, settings, and a
dashboard only (verified `src/app/(staff)/staff` contents). Task 1 therefore
builds one minimal `staff/portal-links` approve-only page instead. The full
review queue still waits for sub-project 10.

---

### Task 1: Email-required registration, no auto-link, staff approve page

**Files:**
- Modify: `src/lib/zod/auth.ts` (email required)
- Modify: `src/server/auth/login.ts` (remove lead claiming)
- Modify: `tests/integration/login.test.ts` (update claiming test)
- Modify: `src/app/(auth)/portal/register/page.tsx` (email required, subtitle)
- Create: `src/server/services/portal-links.ts`
- Create: `src/app/(staff)/staff/portal-links/page.tsx`
- Create: `src/app/(staff)/staff/portal-links/actions.ts`
- Modify: `src/lib/nav.ts` (staff link for the page; flip portal flags in Task 2)
- Test: `tests/integration/portal-links.test.ts`

**Interfaces:**
- Consumes: `patientRegisterSchema`, `registerPatient`, `normalisePhone` (existing).
- Produces: `listUnlinkedPortalUsers(): Promise<{ id, name, phone, email, createdAt, candidates: { id, fullName, status }[] }[]>`, `approvePortalLink(userId, patientId): Promise<void>` for Task 2+.

- [ ] **Step 1: Failing test — registration rejects a missing email**

```ts
// tests/integration/login.test.ts (append to the registration describe block)
it("rejects registration without an email", async () => {
  const parsed = patientRegisterSchema.safeParse({
    fullName: "Email Less",
    phone: "08030000001",
    password: "Password1",
  });
  expect(parsed.success).toBe(false);
});
```

Run: `npx vitest run tests/integration/login.test.ts`
Expected: FAIL — `parsed.success` is `true` (email is `.optional().or(z.literal(""))`).

- [ ] **Step 2: Make email required in the schema**

```ts
// src/lib/zod/auth.ts line 30, replace with:
email: z.string().trim().email("Enter a valid email address"),
```

Run: `npx vitest run tests/integration/login.test.ts -t "rejects registration without"`
Expected: PASS (other tests in the file may still fail — that is Step 4's work).

- [ ] **Step 3: Failing test — registration does NOT claim the lead**

```ts
it("leaves a matching walk-in lead unlinked for staff to approve", async () => {
  const lead = await testPrisma.patient.create({
    data: {
      patientCode: "T-000099",
      fullName: "Walk In",
      phone: normalisePhone("08030000002"),
      email: "walk@example.com",
      status: "lead",
    },
  });
  const result = await registerPatient(
    { fullName: "Walk In", phone: "08030000002", email: "walk@example.com", password: "Password1" },
    {},
  );
  expect(result.ok).toBe(true);
  const untouched = await testPrisma.patient.findUniqueOrThrow({ where: { id: lead.id } });
  expect(untouched.userId).toBeNull();
  expect(untouched.status).toBe("lead");
});
```

Run: `npx vitest run tests/integration/login.test.ts -t "leaves a matching walk-in"`
Expected: FAIL — `untouched.userId` is set (current code claims the lead).

- [ ] **Step 4: Remove claiming from `registerPatient`**

In `src/server/auth/login.ts`, delete the lead-claim block (the
`tx.patient.findFirst({ where: { phone, userId: null ...` lookup and the
following `tx.patient.update`), so the transaction only creates the user with
`role: "patient"`. Keep the `phone_taken` guard and the email normalisation.

Then update the old claiming test at `tests/integration/login.test.ts:174`
("claims an existing walk-in lead..."): rewrite its expectations to
`userId` null / status `"lead"` (it now duplicates Step 3's test — delete the
old test and keep Step 3's).

Run: `npx vitest run tests/integration/login.test.ts`
Expected: all PASS.

- [ ] **Step 5: Staff link service with tests**

```ts
// src/server/services/portal-links.ts
import "server-only";
import { prisma } from "@/server/db";

/** Portal logins with no linked patient row, plus same-phone candidates. */
export async function listUnlinkedPortalUsers() {
  const users = await prisma.user.findMany({
    where: { role: "patient", deletedAt: null, patient: null },
    select: { id: true, name: true, phone: true, email: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return Promise.all(
    users.map(async (u) => ({
      ...u,
      candidates: await prisma.patient.findMany({
        where: { phone: u.phone, userId: null, deletedAt: null },
        select: { id: true, fullName: true, status: true },
        orderBy: { createdAt: "asc" },
      }),
    })),
  );
}

/** Staff-only caller verifies. Links one login to one record, once. */
export async function approvePortalLink(userId: string, patientId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const patient = await tx.patient.findFirst({
      where: { id: patientId, userId: null, deletedAt: null },
    });
    if (!patient) throw new Error("Patient record is already linked or missing");
    const user = await tx.user.findFirst({
      where: { id: userId, role: "patient", deletedAt: null, patient: null },
    });
    if (!user) throw new Error("Login is already linked or missing");
    await tx.patient.update({
      where: { id: patientId },
      data: { userId, status: "registered" },
    });
  });
}
```

```ts
// tests/integration/portal-links.test.ts
import { describe, expect, it } from "vitest";
import { testPrisma, resetDb } from "./helpers/db";
import { approvePortalLink, listUnlinkedPortalUsers } from "@/server/services/portal-links";

describe("portal linking", () => {
  it("lists unlinked logins with same-phone candidates", async () => {
    await resetDb();
    const user = await testPrisma.user.create({
      data: { name: "Newbie", phone: "08030000011", email: "n@example.com", passwordHash: "x", role: "patient" },
    });
    await testPrisma.patient.create({
      data: { patientCode: "T-000101", fullName: "Newbie", phone: "08030000011", status: "lead" },
    });
    const rows = await listUnlinkedPortalUsers();
    expect(rows.map((r) => r.id)).toContain(user.id);
    expect(rows.find((r) => r.id === user.id)!.candidates).toHaveLength(1);
  });

  it("links once and refuses a second link", async () => {
    await resetDb();
    const user = await testPrisma.user.create({
      data: { name: "Newbie", phone: "08030000012", email: "n@example.com", passwordHash: "x", role: "patient" },
    });
    const patient = await testPrisma.patient.create({
      data: { patientCode: "T-000102", fullName: "Newbie", phone: "08030000012", status: "lead" },
    });
    await approvePortalLink(user.id, patient.id);
    const linked = await testPrisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
    expect(linked.userId).toBe(user.id);
    expect(linked.status).toBe("registered");
    await expect(approvePortalLink(user.id, patient.id)).rejects.toThrow(/already linked/);
  });
});
```

Check `tests/integration/helpers/db.ts` for the actual export names (`testPrisma`,
`resetDb` — read the file; if they differ, use the real ones). Run:
`npx vitest run tests/integration/portal-links.test.ts`. Expected: PASS.

- [ ] **Step 6: Staff approve page + action, register page copy**

`src/app/(staff)/staff/portal-links/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/rbac";
import { approvePortalLink } from "@/server/services/portal-links";
import type { ActionState } from "@/lib/actions";
import { actionOk, actionFail } from "@/lib/actions";

export async function linkPortalAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("admin", "therapist", "receptionist");
  const userId = String(formData.get("userId") ?? "");
  const patientId = String(formData.get("patientId") ?? "");
  if (!userId || !patientId) return actionFail("Choose a record to link.");
  try {
    await approvePortalLink(userId, patientId);
  } catch {
    return actionFail("That record was already linked. Refresh and try again.");
  }
  revalidatePath("/staff/portal-links");
  return actionOk("Account linked.");
}
```

Verify `@/lib/actions` exports `ActionState`, `actionOk`, `actionFail` by reading
the file first — if names differ, use the real ones (same pattern as the staff
`addService` action).

`src/app/(staff)/staff/portal-links/page.tsx`: server page, `requireRole`
same three roles, lists `listUnlinkedPortalUsers()`; each candidate renders a
one-row form (hidden `userId` + `patientId`) with `SubmitButton "Link"` and
`FormStatus`. Users with zero candidates show "No matching clinic record —
link after their next visit."

In `src/lib/nav.ts`, add `{ href: "/staff/portal-links", label: "Portal links", available: true }`
to the staff settings group (read `staffLinksFor` first for the exact group).

In `src/app/(auth)/portal/register/page.tsx`: set the email field
`required: true` and change the subtitle to "Use the same phone number you
gave at the clinic — staff will link your records after you register."

Run: `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/zod/auth.ts src/server/auth/login.ts tests/integration/login.test.ts "src/app/(auth)/portal/register/page.tsx" src/server/services/portal-links.ts tests/integration/portal-links.test.ts "src/app/(staff)/staff/portal-links" src/lib/nav.ts
git commit -m "feat: require portal email, staff-approved account linking"
```

### Task 2: Portal service layer, dashboard, waiting state, nav flags

**Files:**
- Create: `src/server/services/portal.ts`
- Create: `src/app/(portal)/page.tsx`
- Modify: `src/lib/nav.ts` (flip appointments/profile to available, add intake link)
- Test: `tests/integration/portal.test.ts`

**Interfaces:**
- Consumes: `requireRole`, `getClinicSettings`, `buildWhatsAppLink`, `listPublishedTestimonials` (no — not needed), booking reads via prisma.
- Produces for Tasks 3–5: `requireLinkedPatientId(userId: string): Promise<string | null>`, `getPortalDashboard(patientId: string)`, `hasSubmittedIntake(patientId: string): Promise<boolean>`.

- [ ] **Step 1: Failing scoping test — patient B sees nothing of patient A**

```ts
// tests/integration/portal.test.ts
import { describe, expect, it } from "vitest";
import { testPrisma, resetDb } from "./helpers/db";
import { getPortalDashboard } from "@/server/services/portal";

describe("portal scoping", () => {
  it("returns only the linked patient's appointments", async () => {
    await resetDb();
    const svc = await testPrisma.service.create({
      data: { name: "Scope Check", slug: "scope-check", defaultDurationMinutes: 45, defaultPrice: 5000 },
    });
    const mk = (code: string) =>
      testPrisma.patient.create({ data: { patientCode: code, fullName: code, phone: `080${code.slice(-8)}`, status: "registered" } });
    const a = await mk("T-000201");
    const b = await mk("T-000202");
    await testPrisma.appointment.create({
      data: { patientId: a.id, serviceId: svc.id, scheduledStart: new Date("2026-10-01T09:00:00Z"), scheduledEnd: new Date("2026-10-01T09:45:00Z"), status: "scheduled", bookedVia: "staff" },
    });
    expect((await getPortalDashboard(a.id)).upcoming).toHaveLength(1);
    expect((await getPortalDashboard(b.id)).upcoming).toHaveLength(0);
  });
});
```

Run: `npx vitest run tests/integration/portal.test.ts`
Expected: FAIL with "getPortalDashboard is not a function" (red before green).

- [ ] **Step 2: Portal service**

```ts
// src/server/services/portal.ts
import "server-only";
import { prisma } from "@/server/db";

export async function requireLinkedPatientId(userId: string): Promise<string | null> {
  const patient = await prisma.patient.findFirst({
    where: { userId, deletedAt: null },
    select: { id: true },
  });
  return patient?.id ?? null;
}

export type PortalAppointment = {
  id: string;
  start: Date;
  end: Date;
  status: string;
  serviceName: string;
  therapistName: string | null;
  therapistId: string | null;
  serviceId: string;
  reason: string | null;
};

/** Single batched read for the dashboard. Empty states are the caller's job. */
export async function getPortalDashboard(patientId: string, now: Date = new Date()) {
  const [upcoming, recent, treatmentPlan, balance] = await Promise.all([
    prisma.appointment.findMany({
      where: { patientId, scheduledStart: { gte: now }, status: "scheduled", deletedAt: null },
      include: { service: { select: { id: true, name: true } }, therapist: { select: { id: true, name: true } } },
      orderBy: { scheduledStart: "asc" },
    }),
    prisma.appointment.findMany({
      where: { patientId, scheduledStart: { lt: now }, deletedAt: null },
      include: { service: { select: { id: true, name: true } }, therapist: { select: { id: true, name: true } } },
      orderBy: { scheduledStart: "desc" },
      take: 3,
    }),
    // Sub-project 6 owns plans; read the flag-gated row so the card lights up alone.
    prisma.treatmentPlan.findFirst({
      where: { patientId, patientVisible: true, deletedAt: null },
      select: { id: true, summary: true },
      orderBy: { createdAt: "desc" },
    }),
    // Sub-project 7 owns billing; sum open invoices so the card lights up alone.
    prisma.invoice.aggregate({
      where: { patientId, status: "unpaid", deletedAt: null },
      _sum: { balanceDue: true },
    }),
  ]);
  return { upcoming, recent, treatmentPlan, balanceDue: balance._sum.balanceDue ?? 0 };
}

export async function hasSubmittedIntake(patientId: string): Promise<boolean> {
  const row = await prisma.intakeForm.findFirst({
    where: { patientId, submittedAt: { not: null } },
    select: { id: true },
  });
  return row !== null;
}
```

Before writing, verify the `treatmentPlan` (fields `patientVisible`, `summary`?)
and `invoice` (fields `status`, `balanceDue`?) model shapes in
`prisma/schema.prisma`. If names differ, use the real ones and keep the same
function signatures — Tasks 3–5 depend on the signatures, not the internals.

Run: `npx vitest run tests/integration/portal.test.ts`. Expected: PASS.

- [ ] **Step 3: Dashboard page with waiting + empty states**

`src/app/(portal)/page.tsx` (server component):

```tsx
import Link from "next/link";
import { requireRole } from "@/server/auth/rbac";
import { getClinicSettings } from "@/server/services/clinic-settings";
import { buildWhatsAppLink } from "@/lib/site";
import { getPortalDashboard, hasSubmittedIntake, requireLinkedPatientId } from "@/server/services/portal";

export default async function PortalDashboard() {
  const user = await requireRole("patient");
  const patientId = await requireLinkedPatientId(user.id);
  const settings = await getClinicSettings();

  if (!patientId) {
    const whatsapp = buildWhatsAppLink(settings.contactWhatsapp, "Hello, I registered online and my records are not linked yet.");
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="font-display text-2xl font-semibold text-ivory">Almost there, {user.name}</h1>
        <p className="mt-2 text-sm text-ivory-dim">
          The clinic is linking your online account to your patient record. This
          usually happens at your next visit — you will see your appointments here afterwards.
        </p>
        {whatsapp && <Link href={whatsapp} ...>WhatsApp the clinic</Link>}
      </main>
    );
  }

  const [dash, intakeDone] = await Promise.all([getPortalDashboard(patientId), hasSubmittedIntake(patientId)]);
  const next = dash.upcoming[0];
  ... // next-appointment card, recent list, treatment/balance cards with the
  // spec's empty states, Call/WhatsApp buttons, intake banner when !intakeDone
}
```

Full markup follows the public homepage card pattern (bordered `bg-surface`
cards, `font-display` headings, tabular times). Treatment card: plan ? summary
: "Your therapist hasn't shared a plan yet." Balance card: balanceDue > 0 ?
amount : "Billing arrives in a later update." (Pay Now comes in sub-project 7 —
no dead button.) Intake banner links to `/portal/intake`.

In `src/lib/nav.ts` `portalLinks()`: set appointments + profile `available:
true` (drop the notes) and add `{ href: "/portal/intake", label: "Intake form", available: true }`.

Run: `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/server/services/portal.ts tests/integration/portal.test.ts "src/app/(portal)/page.tsx" src/lib/nav.ts
git commit -m "feat: add portal dashboard with waiting and empty states"
```

### Task 3: Portal appointments — list, book, reschedule, cancel

**Files:**
- Create: `src/app/(portal)/appointments/page.tsx`
- Create: `src/app/(portal)/appointments/actions.ts`
- Test: `tests/integration/portal-appointments.test.ts`

**Interfaces:**
- Consumes: `requireLinkedPatientId`, `getPortalDashboard` (Task 2); `bookAppointment`, `rescheduleAppointment`, `cancelAppointment`, `getSlotsForDate`, `SlotTakenError`, `CutoffError` (booking.ts); `getService`, `listActiveServices`, `listPublicTherapists`.
- Produces: nothing later (Task 6 E2E consumes the routes).

- [ ] **Step 1: Failing test — cancel enforces ownership, not just id**

```ts
// tests/integration/portal-appointments.test.ts
it("a patient cannot cancel another patient's appointment", async () => {
  ... // two patients, appointment on A; call portalCancelAppointment(bId, apptId, "reason")
  await expect(portalCancelAppointment(bId, apptId, "nope")).rejects.toThrow(/not found/i);
});
```

This pins the Task 2 `portal.ts` addition below (red: `portalCancelAppointment`
not a function):

```ts
// add to src/server/services/portal.ts
import { cancelAppointment, rescheduleAppointment, bookAppointment } from "./booking";

async function ownedAppointment(patientId: string, appointmentId: string) {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, patientId, deletedAt: null },
  });
  if (!appt) throw new Error("Appointment not found");
  return appt;
}

export async function portalCancelAppointment(patientId: string, appointmentId: string, reason: string, actorId: string) {
  await ownedAppointment(patientId, appointmentId);
  return cancelAppointment(appointmentId, reason, actorId);
}

export async function portalRescheduleAppointment(patientId: string, appointmentId: string, start: Date, actorId: string) {
  const appt = await ownedAppointment(patientId, appointmentId);
  if (!appt.therapistId) throw new Error("This booking has no fixed therapist — contact the clinic to move it.");
  return rescheduleAppointment(appointmentId, start, actorId);
}

export async function portalBookAppointment(args: {
  patientId: string; serviceId: string; therapistId: string | null; start: Date; reason?: string; actorId: string;
}) {
  return bookAppointment({
    patientId: args.patientId,
    serviceId: args.serviceId,
    therapistId: args.therapistId,
    start: args.start,
    bookedVia: "portal",
    reasonForVisit: args.reason ?? null,
    actorId: args.actorId,
  });
}
```

Verify `BookInput` in booking.ts accepts exactly these fields before writing
(read the type; adjust names to match, keep `bookedVia: "portal"`).

Run: `npx vitest run tests/integration/portal-appointments.test.ts`
Expected: PASS after implementation (red confirmed on the missing import first).

- [ ] **Step 2: Actions with cutoff-friendly errors**

`src/app/(portal)/appointments/actions.ts`: three actions
(`portalBook`, `portalReschedule`, `portalCancel`) following the
`submitPublicBooking` pattern — `requireRole("patient")`,
`requireLinkedPatientId(user.id)` (unlinked → `actionFail("Your account is not
linked yet.")`), Zod parse, try the portal service, catch `CutoffError` →
"Too close to the appointment — please WhatsApp the clinic", catch
`SlotTakenError` → "That slot was just taken — pick another", revalidate
`/portal` + `/portal/appointments`. `redirect()` (if used after booking)
sits outside try/catch so `NEXT_REDIRECT` is never swallowed.

- [ ] **Step 3: Appointments page**

URL-stepped like `/book`: `?service=&therapist=&date=` for new bookings
(same link-accumulation, slot radios from `getSlotsForDate`); existing
upcoming list above with per-row reschedule (picker scoped to the
appointment's `therapistId` via `getSlotsForDate(date, serviceId,
therapistId)`; `therapistId` null → contact-clinic panel, never the picker)
and cancel (reason field, cutoff enforced). History below with statuses.

Run: `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/server/services/portal.ts tests/integration/portal-appointments.test.ts "src/app/(portal)/appointments"
git commit -m "feat: add portal appointment booking, reschedule and cancel"
```

### Task 4: Intake form

**Files:**
- Create: `src/lib/zod/intake.ts`
- Create: `src/app/(portal)/intake/page.tsx`
- Create: `src/app/(portal)/intake/actions.ts`
- Test: `tests/integration/portal-intake.test.ts`

**Interfaces:**
- Consumes: `requireLinkedPatientId` (Task 2).
- Produces: latest-row upsert the dashboard banner reads via `hasSubmittedIntake`.

- [ ] **Step 1: Failing test — submit stores row + consent atomically**

```ts
it("submit creates the intake row and stamps consent", async () => {
  const patientId = ...; // registered patient row
  await submitIntake(patientId, { reasonForVisit: "Back pain", consent: true, ... });
  const row = await testPrisma.intakeForm.findFirstOrThrow({ where: { patientId } });
  expect(row.submittedAt).not.toBeNull();
  const patient = await testPrisma.patient.findUniqueOrThrow({ where: { id: patientId } });
  expect(patient.consentGiven).toBe(true);
  expect(patient.consentDate).not.toBeNull();
});

it("consent unchecked fails validation", async () => {
  await expect(submitIntake(patientId, { consent: false, ... })).rejects.toThrow(/consent/i);
});
```

Red: `submitIntake` not defined. Implement in a new
`src/server/services/intake.ts`:

```ts
export async function submitIntake(patientId: string, input: IntakeInput): Promise<void> {
  const parsed = intakeSchema.parse(input); // consent: z.literal(true, { message: "Please accept the consent statement" })
  await prisma.$transaction(async (tx) => {
    const latest = await tx.intakeForm.findFirst({ where: { patientId }, orderBy: { createdAt: "desc" } });
    const data = { ...parsed, consent: undefined, submittedAt: new Date() };
    if (latest) await tx.intakeForm.update({ where: { id: latest.id }, data });
    else await tx.intakeForm.create({ data: { ...data, patientId } });
    await tx.patient.update({ where: { id: patientId }, data: { consentGiven: true, consentDate: new Date() } });
  });
}
```

Run: `npx vitest run tests/integration/portal-intake.test.ts`. Expected: PASS.

- [ ] **Step 2: Page + action**

Prefill from the latest row. Consent statement text covers PRD-12 §4 (what,
why, treatment + communication) with the live clinic name. Action follows the
Task 3 pattern; revalidate `/portal` (banner disappears) + `/portal/intake`.

Run: `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/zod/intake.ts src/server/services/intake.ts tests/integration/portal-intake.test.ts "src/app/(portal)/intake"
git commit -m "feat: add portal digital intake form with consent"
```

### Task 5: Profile with required email

**Files:**
- Create: `src/lib/zod/profile.ts`
- Create: `src/app/(portal)/profile/page.tsx`
- Create: `src/app/(portal)/profile/actions.ts`
- Test: `tests/integration/portal-profile.test.ts`

- [ ] **Step 1: Failing tests — blank email rejected, phone renormalised**

```ts
it("rejects a blank email", ...); // schema parse fails
it("normalises the phone on save", async () => {
  await updateProfile(patientId, { ..., phone: "0803 123 4567", email: "a@b.com", ... });
  expect((await testPrisma.patient.findUniqueOrThrow(...)).phone).toBe("08031234567");
});
```

Schema: name min 2, phone via shared `phoneSchema`, email required (same rule
as registration), dob optional `YYYY-MM-DD`, rest optional trimmed strings.
Service `updateProfile` whitelists exactly the PRD §4 fields + email. Missing
email on an old row: page shows "Add your email so the clinic can reach you"
notice until provided (the prompt, per spec §6).

Run test, implement, re-run. Expected: PASS.

- [ ] **Step 2: Page + action**, same form pattern. Revalidate `/portal/profile`.

Run: `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/zod/profile.ts "src/app/(portal)/profile" tests/integration/portal-profile.test.ts
git commit -m "feat: add portal profile editing with required email"
```

### Task 6: Portal journeys, verification, docs

**Files:**
- Create: `tests/e2e/portal.spec.ts`
- Modify: `tests/e2e/helpers/db.ts` (patient arming helper)
- Modify: `README.md` (portal section, if it documents the staff/public flows)

- [ ] **Step 1: E2E — register → waiting state → linked dashboard**

Arm helper mirrors `armStaffAccount`: create patient-role user + optionally a
linked patient row. Journeys: (1) login lands on dashboard with next
appointment + balance card within 10s of login submit (measure with
`Date.now()`, fail over 10_000); (2) unlinked login sees the waiting screen
and no appointment data; (3) intake completes and the banner disappears;
(4) reschedule inside the cutoff shows the contact-clinic panel, not the
picker; (5) forged-id check is integration-covered, not E2E.

- [ ] **Step 2: Full sweep**

Run: `npx tsc --noEmit && npx eslint . && npx next build && npx vitest run && npx playwright test`
Expected: all green. (Playwright browsers live in `~/.cache/ms-playwright/` —
if absent, run `npx playwright install chromium` first, never bare
`playwright test` on a fresh machine.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/portal.spec.ts tests/e2e/helpers/db.ts README.md
git commit -m "feat: verify portal journeys and close sub-project 5"
```

## Self-Review

- Spec coverage: §1 login/register exist, pages built in Tasks 2–5, waiting state Task 2, dashboard §2 Task 2, appointments §3 Task 3, intake §4 Task 4, profile §5 Task 5, linking §6 Task 1, email-required §6 Tasks 1+5, cross-cutting §7 Tasks 1–6 (forged-id test Task 3, cutoff E2E Task 6, no new client JS by construction).
- No placeholders: every step names files, signatures, exact code or exact read-then-write instructions with fallback rules.
- Type consistency: `requireLinkedPatientId(userId) → string | null`, `getPortalDashboard(patientId) → { upcoming, recent, treatmentPlan, balanceDue }`, `hasSubmittedIntake → boolean`, portal mutations take `(patientId, ...)` first. Task 3–5 signatures match Task 2's productions.
