# TetaPhysio — Sub-project 3: Booking Engine & Staff Scheduling (Design Spec)

**Date:** 2026-09-03
**Covers PRDs:** 03 (Appointment Booking & Scheduling)
**Depends on:** Sub-project 1 (Foundation) — complete; Sub-project 2 (Clinic Configuration) — complete
**Status:** Approved for implementation planning

---

## 1. Purpose

The engine behind every appointment in the system. PRD-03 §1 names three consumers — the public website (visitor booking), the patient portal (self-service), and the staff portal (manual booking, walk-ins, schedule management). This slice builds the engine and the staff surfaces. The public form arrives in sub-project 4 and the portal UI in sub-project 5, both as thin consumers of the engine built here.

This slice is where the brief's ban gets enforced: no design in which two writers can claim the same slot without the database saying no.

## 2. Brief

Per `AGENTS.md`, every design-heavy sub-project opens with the three-line formula:

1. **WHO IT'S FOR** — the front-desk receptionist booking a walk-in in under 30 seconds, first; the patient self-booking second. A fast receptionist flow makes the patient flow fast for free.
2. **HOW IT SHOULD FEEL** — "quiet luxury, warm-dark restraint", the mockup's recipe. The booking calendar is a product surface: status pills in `-dim` backgrounds, dashed timeline separators, tabular figures on every time. No new visual language.
3. **ONE THING TO AVOID** — no double-booking path, ever. Availability display is advisory; the insert constraint is the truth.

## 3. Scope

| In scope | Consumer |
|---|---|
| `getBookableSlots` — pure slot engine | Sub-projects 3, 4, 5 |
| Staff manual booking (any patient, therapist, service) | Receptionist, admin |
| Walk-in quick booking (name + phone → arrived) | Receptionist, admin |
| Staff day agenda + week calendar with therapist filter | All staff roles |
| Status transitions with history writes | Therapist, receptionist, admin |
| Reschedule/cancel with cutoff enforcement (service layer; UI in sub-project 5) | Service layer now |
| Force-book with warning (PRD-03 FR5) | Admin, receptionist |

| Out of scope | To |
|---|---|
| Public booking form | 4 (renders server-side, calls the engine directly) |
| Portal self-service appointment UI | 5 |
| Booking notifications (confirmation, reminder) | 8 (consumes booking events) |
| Waitlists, group/class bookings, recurring series | Excluded by PRD-03 §8 |

PRD-06 §3 (appointment administration) is also satisfied by the staff surfaces here, leaving sub-project 10 as staff *account* management only.

## 4. Resolved decisions

### 4.1 Slots on a fixed 15-minute grid

Service durations vary (45–60 minutes in the seed). Slots start every 15 minutes; a slot is offered when the full service duration fits inside an availability window without overlapping an existing appointment.

**Rationale:** simple to render as a picker, handles mixed durations without special cases, and matches quarter-hour thinking. Rejected: back-to-back chaining (the grid would depend on booking order, so the UI could never show a stable timetable) and admin-configured slot times (breaks PRD-06's five-minute therapist onboarding).

### 4.2 Lead time is hours-ahead, 0 disables

`bookingLeadTimeHours` from the settings singleton is the single rule: a slot is bookable only when its start is at least that many hours in the future. `0` means same-day booking is allowed and the rule is inert.

**Rationale:** one field, one rule, no clock-face edge cases. Rejected: a daily cutoff time ("no bookings after 3pm") as in PRD-03's example — it needs a second field, interacts awkwardly with the hours rule, and "after 3pm" is ambiguous across timezones. PRD-03 FR3 calls lead time optional and admin-toggleable; `0` is the toggle.

### 4.3 No double-booking, enforced by the database

A Postgres exclusion constraint rejects overlapping appointments for the same therapist no matter what the application does. The service layer still checks first so the user gets a friendly error; the constraint is the backstop against two concurrent transactions both reading "free" and both inserting — the exact race the brief bans.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE appointments ADD CONSTRAINT no_therapist_overlap
  EXCLUDE USING gist (therapist_id WITH =, tstzrange(scheduled_start, scheduled_end) WITH &&)
  WHERE (deleted_at IS NULL AND status NOT IN ('cancelled', 'no_show') AND was_force_booked IS NOT TRUE);
```

**Rationale:** the predicate matters twice. Cancelled and no-show appointments must not block the slot, or a cancelled 9am permanently poisons 9am. And `was_force_booked` rows are exempt — otherwise FR5's override could never insert. That exemption is safe rather than a loophole: force-book is a deliberate human override with the conflicting appointment named in the warning, not a race between two normal bookings. The race the brief bans is two writers both reading "free"; a force-book writer has read "occupied" and proceeded anyway. Rejected: service-layer check alone (the race it permits is the banned case) and pessimistic locking (serialises all bookings per therapist and deadlocks easily).

This is the first migration since Foundation's `init`. The extension statement runs inside the migration; Neon's default roles permit `CREATE EXTENSION` for `btree_gist`.

### 4.4 Linear status graph with branches

PRD-03 §3 lists seven statuses and no transition rules. The engine enforces:

```
scheduled → confirmed → arrived → in_session → completed
    ↓           ↓           ↓
cancelled   cancelled   cancelled / no_show
                ↓
             no_show
```

`completed`, `cancelled` and `no_show` are terminal — any transition out throws before touching the database. Confirmation is optional: arrivals skip it, and walk-ins enter directly at `arrived`. Every legal transition writes one `appointment_status_history` row with actor and timestamp.

**Rationale:** a strict pipeline (mandatory confirmation) would strand walk-ins and phone bookings; free transitions would make "how many no-shows" unanswerable when `completed` can flip back to `scheduled`. The graph drives the UI: only legal next states render as buttons, so an illegal transition is unclickable, not merely rejected.

### 4.5 Walk-in: phone match, staff confirms, then lead

The action takes a phone number and returns either the matched patient (staff taps confirm) or a fresh lead from name + phone. The appointment is created at `arrived` with `bookedVia: "staff"` in the same transaction as the patient link, so a crash never leaves a visit pointing at nobody.

**Rationale:** fully automatic matching is fastest but a recycled Nigerian number silently attaches a visit to the wrong clinical record — a privacy incident, not an inconvenience. Always-create-new fills the patient list with duplicates within weeks. The confirm tap costs one second and keeps a human on the ambiguous case.

## 5. Service layer

Three modules under `src/server/services/`, following the sub-project 2 pattern (soft-delete filters in the module, never in callers):

| Module | Operations |
|---|---|
| `booking.ts` | `bookAppointment`, `rescheduleAppointment`, `cancelAppointment`, `walkInAppointment`, `forceBookAppointment` |
| `schedule.ts` | `getDaySchedule`, `getWeekSchedule` (therapist filter, status grouping) |
| `appointment-status.ts` | `transitionStatus` — the only writer of status changes |

### 5.1 The slot engine

The contract sub-projects 4 and 5 depend on. Pure — no database handle, injected clock:

```ts
export type BookableSlot = { start: string; end: string }; // ISO instants

export function getBookableSlots(args: {
  dateKey: string;                    // YYYY-MM-DD, Africa/Lagos
  availabilityWindows: TimeWindow[];  // from resolveAvailability
  existingAppointments: { start: Date; end: Date }[];
  serviceDurationMinutes: number;
  leadTimeHours: number;
  now: Date;
}): BookableSlot[];
```

Order of operations: walk each window on the 15-minute grid; drop slots whose `[start, start + duration)` overruns the window; drop slots overlapping an existing appointment; drop slots starting less than `leadTimeHours` ahead of `now`; return sorted.

**"No preference" therapist.** The engine runs once per active therapist and merges: a slot is offered when *any* therapist can take it, tagged with who, and the booking pins the therapist. Dr. A full but Dr. B free must never render as "no availability".

**Timezone boundary.** Inputs are wall-clock windows plus a `YYYY-MM-DD`; outputs are `timestamptz` instants computed in `Africa/Lagos`. The conversion lives in one function. WAT has no DST, but the tests pin dates on either side of where DST would fall, so a future timezone change breaks loudly.

### 5.2 Cutoffs and cancellation reasons

`rescheduleAppointment` and `cancelAppointment` read `rescheduleCutoffHours` / `cancellationCutoffHours` from the settings singleton and throw with the hours remaining when inside the window. Force-book bypasses *availability*, never the status graph — FR5's override is about slots, not states.

Every cancel captures a reason (`cancellationReason` exists from Foundation) — PRD-09's cancelled-appointments report depends on it.

## 6. Server Actions and screens

Actions follow the sub-project 2 pattern: `requireRole` first (it throws, so an unchecked call fails closed), then parse, delegate, revalidate. Mutations use Server Actions; no new route handlers — sub-project 4 renders server-side and calls the service layer directly.

| Route | Purpose |
|---|---|
| `/staff/appointments` | Day agenda by default, week toggle, therapist filter. Status pills in `-dim` backgrounds, dashed row separators, tabular times — the mockup's timeline language. Each row links to the patient record. |
| `/staff/appointments/new` | Manual booking: service → therapist (or no preference) → date → slot picker → patient search-or-create. |
| `/staff/appointments/walk-in` | Phone → match-or-lead → service → therapist → confirm. The common case is four taps; the 30-second target is measured, not assumed. |
| `/staff/appointments/[id]` | Detail with only legal next-state buttons (the graph drives the UI). Force-book entry with the conflicting appointment named in the warning. |

The slot picker shows taken slots struck-through rather than hidden — staff see *why* a day looks full.

## 7. Testing

**Vitest, slot engine, no database:** duration fit at window edges, overlap exclusion, lead-time boundary with an injected clock ("2-hour lead at 07:30 shows 10:00, not 09:30"), no-preference merge across therapists, closed-day empty, DST-adjacent dates.

**Vitest, status graph:** the full legal/illegal transition matrix, terminal-state throws, history row written per legal transition, cutoff enforcement with remaining-hours message.

**Vitest, integration:** walk-in phone-match and lead branches; one test inserts two overlapping appointments for one therapist and expects the exclusion constraint to reject — proving the backstop, not just the service check.

**Playwright:** a receptionist books a walk-in end to end; an admin force-books with the warning visible; a therapist moves an appointment arrived → in_session → completed.

## 8. Definition of done

1. `npx tsc --noEmit`, `npx eslint .` and `npx next build` all clean.
2. Full Vitest suite green, including the exclusion-constraint rejection test.
3. Playwright green, including the walk-in journey.
4. A receptionist completes a walk-in in under 30 seconds by the clock.
5. `getBookableSlots` returns correct slots for every case in §7.
6. `prisma migrate status` shows the one new migration applied locally and on Neon.

## 9. Risks

| Risk | Mitigation |
|---|---|
| `btree_gist` unavailable on Neon | Verified permitted on Neon's default roles; if it fails, the migration error is explicit and the slice stops before any code depends on it |
| Exclusion constraint rejects a legitimate force-book | It cannot: the predicate exempts `was_force_booked` rows (Foundation schema already carries the column), so the override path always inserts. Two simultaneous force-books on one slot both succeed — accepted, because force-book is a deliberate override with the conflict named, not a race |
| 15-minute grid wastes odd-duration services | A 50-minute service still starts on grid points; the 10-minute tail is simply unbookable buffer, which clinics want anyway |
| Clock skew between app server and database | Lead-time comparison uses the injected `now` from the app server consistently; the database never decides "is this slot in the future" |
| Status graph needs a transition the clinic actually uses | The graph is data, not code structure — adding an edge is a one-line change with a test, not a refactor |
