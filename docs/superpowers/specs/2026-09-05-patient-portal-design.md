# Sub-project 5 design: Patient portal + intake form (PRD-04)

Approach A (approved): thin portal over existing engines. No new tables, no
migration. Dashboard, appointments, intake and profile are Server Actions and
queries scoped by the session user's linked patient record, reusing the booking
engine instead of copying it.

## §1 Routes & access

The existing `(portal)` shell stays: `getCurrentUser()`, non-patients bounced,
`mustResetPassword` redirected. Pages:

- `/portal` — dashboard (§2)
- `/portal/appointments` — list, book, reschedule, cancel, history (§3)
- `/portal/intake` — digital intake form (§4)
- `/portal/profile` — editable profile (§5)
- `/portal/login`, `/portal/register` — patient auth, reusing the auth handlers

A login with no linked patient record sees only an "unlinked" waiting screen
(record is being linked by the clinic) plus WhatsApp contact — never data.

## §2 Dashboard

One server-rendered page, one batched query:

- Next-appointment card (date, time, therapist, service, status) with
  reschedule/cancel shortcuts.
- Recent-visits short list linking to full history on `/portal/appointments`.
- Treatment snapshot card. Empty state until sub-project 6: "Your therapist
  hasn't shared a plan yet." No fields invented.
- Balance card. Empty state until sub-project 7: "Billing arrives in a later
  update." No Pay Now button until online payment exists.
- Call/WhatsApp buttons from live clinic settings.
- Skippable intake banner while no submitted intake exists.

Success check (PRD-04 §11): next appointment + balance visible within
10 seconds of login — met by construction, verified by E2E timing assertion.

## §3 Appointments

- Upcoming list with per-appointment reschedule/cancel; full history with
  statuses on the same page.
- Booking reuses the staff-proven pattern: service → therapist/no-preference →
  day strip → slot radios, state accumulated in the URL.
- Reschedule reuses the same picker against the existing appointment.
  `rescheduleCutoffHours` enforced server-side; inside the cutoff the picker is
  replaced with a contact-the-clinic panel (WhatsApp deep link).
- Cancel takes a reason and enforces `cancellationCutoffHours` server-side.
- Every read and mutation is scoped `where: { patientId: <linked id> }` in the
  service layer. A forged id returns nothing, never someone else's booking.

## §4 Intake

`/portal/intake` is a single flat form matching the `IntakeForm` columns:
reason for visit, medical history, previous injuries, previous surgeries,
current medications, allergies, referring doctor (all free text), plus one
consent checkbox. The consent statement (PRD-12 §4) states in plain language
what data is collected, why, and that it is used to provide treatment and to
communicate with the patient; exact wording is drafted at implementation with
the live clinic name interpolated. No versioning, no per-field consent in v1.

- Submit creates the row with `submittedAt`; checking consent flips
  `patients.consentGiven` / `consentDate` in the same transaction.
- Resubmission updates the latest row — therapists read "the intake", singular.
- Success check (PRD-04 §11): completable on a phone in under 5 minutes —
  7 short fields + 1 checkbox, no wizard, verified by E2E.

## §5 Profile

Editable fields, exactly PRD-04 §4 plus the required email (§6 amendment):
full name, phone, email (required), date of birth, address, emergency contact
name + phone, basic medical info. Nothing else on the patient row is
patient-editable. Phone change re-normalises and keeps the staff-verified link,
but the change itself (visible via `updatedAt` on the patient record) signals
staff to re-confirm identity at the next visit — no new column, no silent
unlink.

## §6 Account linking + required email

- Registration = phone + password + **required email** (rejected if
  missing/invalid). The clinic needs a non-SMS channel; email is mandatory for
  every portal user.
- A matching patient phone does NOT auto-link: staff approve a one-click link on
  a minimal `staff/portal-links` approve-only page (no patient record page
  exists to host it; full review queue arrives in sub-project 10).
- `patients.email` stays nullable in the DB only for staff-created and walk-in
  rows that predate the address. Those rows carry a staff-visible "missing
  email" flag; the portal prompts the patient to add it until provided. No
  backfill migration.

## §7 Cross-cutting

- Authorization, three layers: `requireRole("patient")` at the layout,
  ownership `where` clauses in every portal service, patient id always derived
  from session → linked record, never from URL params.
- Tests: unit (intake/profile schemas incl. email-required), integration
  (patient B cannot read patient A's appointments/intake — the forged-id
  test), E2E (dashboard-in-10-seconds, intake-under-5-minutes,
  reschedule-cutoff boundary).
- FR1/FR4: server-rendered pages, existing token CSS, no new client JS beyond
  existing primitives — the same surface sub-project 11 wraps in Capacitor.

## Out of scope (per PRD-04 §10)

In-portal messaging, telehealth, community features. Treatment/billing
sections are empty states here, built out in sub-projects 6 and 7.
