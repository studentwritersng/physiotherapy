# TetaPhysio — Sub-project 1: Foundation (Design Spec)

**Date:** 2026-08-28
**Covers PRDs:** 01 (Auth, Roles & Permissions), 11 (Database Schema), 12 (Security & Privacy)
**Status:** Approved for implementation planning

---

## 1. Context

TetaPhysio is a single-clinic physiotherapy management platform for a Nigerian clinic, specified across 13 PRDs in `doc/prd/`. The PRD set is feature-level: it contains no API endpoints, no HTTP verbs, and no column data types. PRD-11 states outright that it is "not a final DDL."

The PRD set is also too large for one spec. It has been decomposed into 11 sub-projects, each with its own spec → plan → implementation cycle:

| # | Sub-project | PRDs |
|---|---|---|
| **1** | **Foundation: schema, auth, RBAC, security baseline, minimal UI** | **01, 11, 12** |
| 2 | Clinic config, services, therapist availability | 06 (subset) |
| 3 | Booking engine, staff calendar, walk-in flow | 03 |
| 4 | Public website | 02 |
| 5 | Patient portal + intake form | 04 |
| 6 | Clinical documentation & treatment plans | 05 |
| 7 | Billing & payments | 07 |
| 8 | Notifications & reminders (+ OTP, password reset) | 08 |
| 9 | Reports & analytics | 09 |
| 10 | Admin remainder | 06 (rest) |
| 11 | Capacitor mobile app | 10 |

This document specifies sub-project 1 only.

Foundation exists because the PRD set contains roughly a dozen cross-document contradictions that must be resolved before any schema is written, not discovered during feature work. Those resolutions are recorded in section 3.

---

## 2. Goals and non-goals

### Goals

1. A working Next.js + Postgres + Prisma application skeleton.
2. The complete database schema for all 11 sub-projects, authored in one pass so later slices add no core-table migrations.
3. Authentication for all four roles, with server-enforced RBAC matching the PRD-01 permission matrix.
4. The PRD-12 security baseline: argon2id hashing, HttpOnly cookies, rate limiting, audit log, secrets out of source control.
5. Enough real UI to log in as each of the four roles in a browser and see role-correct navigation.
6. Every unresolved PRD value pinned to a concrete decision.

### Non-goals for this slice

Booking, clinical notes, billing, notifications, reports, the public marketing site, the Capacitor wrapper, OTP login, password-reset-by-code, and the design system. Each belongs to a later sub-project. The schema tables supporting them are created here; the features are not.

---

## 3. Resolved PRD conflicts

These are decisions, not restatements. Each overrides or completes an ambiguous or contradictory PRD statement.

### 3.1 Patient authentication: password now, OTP later

PRD-01 §3.1 describes both phone+password and OTP for patients, recommending OTP, without choosing.

**Decision:** patients register and log in with phone + password. The `verification_codes` table and a channel-agnostic `MessageProvider` interface are created in Foundation, but OTP login and password-reset-by-code are wired up in sub-project 8 alongside the notification providers.

**Rationale:** OTP-primary would make Foundation depend on a live Termii account and per-message spend for every dev and test cycle, and would need a dev-mode bypass to stay testable. Password-first keeps the entire auth slice buildable and testable offline. The schema is OTP-ready, so sub-project 8 adds a flow, not a migration.

### 3.2 Patient data erasure: anonymise in place

PRD-12 §5 requires the ability to delete a patient's data on request. PRD-11 §4 mandates soft-delete and forbids hard deletes for clinical and financial history. Direct conflict.

**Decision:** an admin-triggered anonymisation action overwrites the patient's identifying fields — `full_name`, `phone`, `email`, `date_of_birth`, `address`, `emergency_contact_name`, `emergency_contact_phone`, `basic_medical_info` — with anonymised placeholders, detaches `user_id`, and sets `anonymised_at`. Appointments, session notes, invoices and payments are retained as de-identified records. The action writes an `audit_log` row.

**Rationale:** satisfies the erasure requirement without invalidating historical revenue reports or destroying clinical records the clinic may be professionally obliged to retain. A cascading hard delete would silently rewrite past financial reporting.

The action itself is implemented in sub-project 10 (Admin remainder); Foundation provides the `anonymised_at` column and the audit action constant.

### 3.3 Patient-visible clinical data: per-plan toggle plus clinic master switch

Three incompatible models appear across PRD-04 FR3 (clinic-level), PRD-04 §6 (per-field), and PRD-05 §7 (per-plan).

**Decision:** `treatment_plans.patient_visible` and `exercises.patient_visible` booleans, both defaulting to `false`, exactly as PRD-11 already models them. A `clinic_settings.show_clinical_to_patients` master switch can hide all clinical content from the portal regardless of per-row flags. Session notes and assessments are never patient-visible in v1.

**Rationale:** therapist controls the individual plan, admin holds a kill switch, and no new schema is invented. Per-field toggles would not be maintained by a therapist working to PRD-05's three-minute session-note target.

### 3.4 Sessions: opaque database tokens, not JWT

PRD-01 §3.2 and PRD-12 §2 both specify JWT in an HttpOnly cookie with a refresh-token pattern. PRD-11 provides no `sessions` table, despite PRD-01 §7 promising one.

**Decision — deliberate deviation from PRD-01 §3.2.** Sessions are opaque 256-bit random tokens, SHA-256 hashed before storage in a `sessions` table, delivered in a `Secure` / `HttpOnly` / `SameSite=Lax` cookie.

**Rationale:** it meets the same requirement with less machinery — no refresh-token rotation to implement incorrectly — and it gives instant revocation, logout-everywhere, and admin-forced logout, none of which a stateless JWT supports. It also removes the PRD-10 FR4 problem: because Capacitor points `server.url` at the hosted domain, the WebView is same-origin and the cookie works with no native token storage. A hashed token table means a database leak yields nothing usable.

### 3.5 Roles: Postgres enum, not a table

PRD-01 FR1 requires roles stored "as enum/table, not hardcoded booleans" and PRD-01 §7 promises a `roles` table in PRD-11, which does not exist.

**Decision:** a native Postgres enum `UserRole` with values `patient`, `therapist`, `receptionist`, `admin`.

**Rationale:** an enum is not a hardcoded boolean, so FR1 is satisfied. PRD-06 §5 explicitly forbids a custom role builder, so the flexibility a roles table buys has no consumer.

### 3.6 Therapist "view all" grant

PRD-01 FR3 and PRD-12 §3 both reference an admin-granted ability for a therapist to see patients beyond their own appointments. No PRD gives it a storage location, and PRD-06 §5 forbids custom permissions.

**Decision:** `staff_profiles.can_view_all_patients` boolean, default `false`, editable by admin only.

### 3.7 Appointment status casing

PRD-03 §4 gives display-cased values ("In Session", "No-show"); PRD-11 defers to PRD-03 verbatim.

**Decision:** all enum values are stored `snake_case` — `scheduled`, `confirmed`, `arrived`, `in_session`, `completed`, `cancelled`, `no_show`. Display strings are a UI-layer concern.

### 3.8 Application timezone

No PRD states a timezone, yet PRD-09 reports, daily revenue, and PRD-03 slot generation all depend on the definition of "today".

**Decision:** all timestamps are `timestamptz`. The application timezone is fixed to `Africa/Lagos` (WAT, UTC+1, no DST) in a single exported constant. All day-boundary and date-range logic derives from it.

### 3.9 Vendors: pinned intent, coded to interfaces

PRDs leave every vendor as an either/or.

**Decision:** intended vendors are Paystack (payments), Termii (SMS + WhatsApp), Cloudflare R2 (object storage), and an S3-compatible client for R2. Each is consumed through an interface — `PaymentProvider`, `MessageProvider`, `StorageProvider` — with a local development implementation (no-op sender, local filesystem storage). Foundation requires no live account for any of them.

**Rationale:** Paystack is the more common Nigerian default and has the cleaner webhook story. Interfaces keep a later switch to Flutterwave or a Meta BSP an adapter change rather than a rewrite, and keep tests free of vendor HTTP mocking.

### 3.10 Missing tables and columns

PRD-11 omits tables and columns that other PRDs depend on. Added in Foundation:

**New tables (7), bringing the total from PRD-11's 20 to 27:**

| Table | Required by | Purpose |
|---|---|---|
| `sessions` | PRD-01 §7, §3.2 | Opaque hashed session tokens, revocable |
| `verification_codes` | PRD-01 §3.1 | OTP and password reset codes (used in sub-project 8) |
| `notification_queue` | PRD-08 §6 (`notifications`, absent from PRD-11) | Outbox with `retry_count`, `last_error`, `scheduled_for`, `provider_message_id` |
| `device_tokens` | PRD-10 FR3 | Push registration |
| `episodes_of_care` | PRD-05 §5, §8 | The load-bearing concept with no PRD-11 representation; assessments, session notes, treatment plans and documents attach to it |
| `testimonials` | PRD-06 §6 | Admin-managed public testimonials |
| `login_attempts` | PRD-01 FR5, PRD-12 §2 | Rate-limit tracking |

**New columns:**

| Table.column | Required by |
|---|---|
| `patients.status` (`lead` / `registered` / `inactive`) | PRD-03 §2 "unregistered/lead"; PRD-09 "active patients" |
| `patients.deleted_at`, `patients.anonymised_at` | PRD-11 §4, PRD-12 §5 |
| `appointments.cancellation_reason`, `cancelled_by`, `was_force_booked` | PRD-09 cancellation reasons; PRD-03 FR5 force-book |
| `payments.notes` | PRD-07 FR2 §3 |
| `invoices.invoice_number`, `invoices.notes` | PRD-07 receipts; PRD-07 §4 per-invoice pricing |
| `exercises.image_url` | PRD-05 §7 |
| `treatment_plans.focus_areas` | PRD-05 §7 |
| `session_notes.edited_by` | PRD-05 FR3 visible edits |
| `users.must_reset_password` | PRD-01 §3.2 forced first-login reset |
| `audit_log.ip_address`, `audit_log.metadata` | PRD-12 §3 |
| `staff_profiles.can_view_all_patients` | PRD-01 FR3 (§3.6 above) |
| `clinic_settings.show_clinical_to_patients`, `reminder_lead_hours` | §3.3 above; PRD-08 FR4 |
| `services.slug`, `services.sort_order` | PRD-02 public site |

**Not added:** `clinic_hours` and `treatment_goals` remain columns (`clinic_settings.opening_hours` JSON, `treatment_plans.goals` text), as PRD-11 already models them. A `roles` table is not added (§3.5).

### 3.11 Pinned values

Every numeric and policy value in the PRDs is an example. These are the decisions. All live in code constants or `clinic_settings`, never inline literals.

| Setting | Value | Source PRD |
|---|---|---|
| Password hashing | argon2id, 19MB memory, 2 iterations, parallelism 1 | PRD-01 §3.3, PRD-12 §2 |
| Password policy | min 8 chars, ≥1 number, no rotation | PRD-01 §3.3 |
| Session expiry | 7 days, sliding; refreshed when >24h since `last_used_at` | PRD-01 §3.2 |
| Login rate limit | 5 failed attempts per identifier per 15-minute sliding window; throttle with retry-after, not lockout | PRD-01 FR5 |
| Upload types | PDF, JPG, PNG, WEBP | PRD-05 §8 |
| Upload max size | 10 MB | PRD-05 §8 |
| Default service duration | 45 minutes | PRD-03 FR1 |
| Reschedule cutoff | 2 hours | PRD-03 §5 |
| Cancellation cutoff | 2 hours | PRD-06 §6 |
| Reminder lead times | 24 hours and 2 hours | PRD-08 §3 |
| Backup retention | Daily, 30 days | PRD-12 §2 |
| Currency | NGN, `Decimal(12,2)` | PRD-07 FR3 |

---

## 4. Architecture

### 4.1 Shape

A single Next.js 15 App Router deployable, TypeScript strict mode. Not a monorepo: PRD-10 wraps this same application via Capacitor `server.url`, so there is no second package to share code with.

Route handlers under `src/app/api` are the API. Prisma is the data layer. Business logic lives in framework-agnostic modules under `src/server/services`, so it is unit-testable without HTTP and portable if a slice ever needs to move out.

Route groups separate the three surfaces without three deployments:

```
teta_physio/
  doc/prd/                       # existing PRD set, untouched
  docs/superpowers/specs/        # design specs
  prisma/
    schema.prisma
    migrations/
    seed.ts
  src/
    app/
      (public)/                  # public site — SSR (PRD-02)
      (portal)/                  # patient portal (PRD-04)
      (staff)/                   # staff + admin (PRD-05, PRD-06)
      api/                       # route handlers
      layout.tsx
    server/
      db.ts                      # Prisma singleton
      auth/
        password.ts              # argon2id hash/verify
        session.ts               # create, read, slide, revoke
        rbac.ts                  # requireRole, requireSession
        rate-limit.ts
      services/                  # business logic per entity
      audit.ts
      providers/                 # Payment/Message/Storage interfaces + local impls
    lib/
      constants.ts               # pinned values, TIMEZONE
      zod/                       # request + env schemas
    components/
  tests/
    unit/
    integration/
    e2e/
```

Route handlers parse, authorize, delegate, and serialize. They contain no business logic.

### 4.2 Dependencies

Pinned to exact versions, no ranges.

| Package | Purpose |
|---|---|
| `next`, `react`, `react-dom` | Framework |
| `typescript`, `@types/node`, `@types/react` | Types |
| `prisma`, `@prisma/client` | ORM and migrations |
| `@node-rs/argon2` | argon2id hashing (native bindings, no build step on Windows) |
| `zod` | Request and environment validation |
| `tailwindcss`, `postcss`, `autoprefixer` | Styling |
| `vitest`, `@vitest/coverage-v8` | Unit and integration tests |
| `@playwright/test` | End-to-end login journeys |
| `eslint`, `eslint-config-next`, `prettier` | Lint and format |
| `tsx` | Running `prisma/seed.ts` |

### 4.3 Environments

| Environment | Database |
|---|---|
| Development | Local Postgres 17 on `localhost:5435`, database `teta_physio_dev` |
| Test | Local Postgres 17 on `localhost:5435`, database `teta_physio_test` |
| Production | Neon (project created, currently empty) |

Migrations are authored and iterated locally with `prisma migrate dev`. Production receives them via `prisma migrate deploy` only after they pass locally. The test suite never connects to Neon.

Environment variables, validated by a zod schema at startup so a missing variable fails fast:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Local dev; in production, the Neon pooled connection string |
| `DIRECT_URL` | Neon direct (non-pooled) connection, required by Prisma for migrations |
| `TEST_DATABASE_URL` | Local test database |
| `SESSION_COOKIE_NAME` | Default `tp_session` |
| `SEED_ADMIN_PASSWORD` etc. | Seed credentials, dev-only fallbacks |
| `APP_URL` | Absolute base URL |

`.env` is gitignored. `.env.example` is committed with placeholder values only — no real credentials, including no Neon string. Neon requires `sslmode=require`.

**Local Postgres note:** the running instance accepts host connections without a password (trust auth in `pg_hba.conf`). Acceptable for localhost development, but it is not password-gated. If that instance is ever reachable beyond localhost, the `postgres` role password must be rotated and `pg_hba.conf` changed to `scram-sha-256`.

### 4.4 Schema conventions

- **Primary keys:** UUID via `gen_random_uuid()` (core in PG13+, available on Neon). Patient and appointment IDs appear in URLs; sequential integers there would permit enumeration of the clinic's patient list.
- **Human-readable identifiers:** `patients.patient_code` (`TP-00001`) satisfies PRD-06's searchable "patient ID"; `invoices.invoice_number` (`INV-2026-00001`). Both from Postgres sequences, distinct from the UUID.
- **Money:** `Decimal(12,2)`, never float.
- **Time:** `timestamptz` everywhere.
- **Enums:** native Postgres enums via Prisma, all values `snake_case`.
- **Soft delete:** `deleted_at timestamptz` on `users`, `patients`, `services`, `appointments`. Prisma has no global filter, so the exclusion is applied once per entity in its service module — never scattered across route handlers.
- **Timestamps:** `created_at` and `updated_at` on every table that is mutated.

The schema file is authored complete — all 27 tables (PRD-11's 20 plus the 7 in §3.10) across the 11 sub-projects — so it is internally consistent and later slices add no core-table migrations. Foundation creates the tables; the features that use them arrive in their own slices.

---

## 5. Authentication and authorization

### 5.1 Passwords

argon2id via `@node-rs/argon2` at the parameters in §3.11. Passwords are never logged, per PRD-12 §2. Policy enforced by a zod schema shared between client and server.

### 5.2 Sessions

Creation: generate 32 random bytes, hex-encode as the cookie value, store only the SHA-256 hash in `sessions` alongside `user_id`, `expires_at`, `last_used_at`, `ip_address`, `user_agent`.

Cookie attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in all environments except localhost, `Max-Age` 7 days.

Sliding expiry: on a request where `last_used_at` is more than 24 hours old, extend `expires_at` and update `last_used_at`. This avoids a database write on every request.

Revocation: delete the row. Logout deletes one row; logout-everywhere and admin-forced logout delete by `user_id`.

Expired sessions are deleted opportunistically on read, plus by a periodic cleanup added in sub-project 8 when the job runner exists.

### 5.3 RBAC — three layers, all server-side

**Layer 1 — session resolution.** A request-scoped `getSession()` reads the cookie and returns user plus role, or null. It is the only path to an authenticated user object.

**Layer 2 — role guards.** `requireSession()` and `requireRole(...roles)` at the top of every API route handler and every server component under `(staff)` and `(portal)`. Deny by default: a handler that omits the guard has no user object to leak data with, so the failure mode is a 401 rather than an authorization bypass.

**Layer 3 — ownership checks in the service layer.** Row-level rules from the PRD-01 matrix:

- A patient reaches only rows belonging to their own `patient_id`.
- A therapist reaches only patients with whom they share an appointment, unless `staff_profiles.can_view_all_patients` is true.
- A receptionist reaches administrative, appointment and payment data, and never `session_notes` or `assessments` — PRD-01 and PRD-06 both make this an explicit block, not an omission.
- An admin reaches everything; role changes, account creation and deactivation are audited.

Next.js middleware performs only the cheap redirect of unauthenticated requests away from protected paths. It never makes the authorization decision, because middleware runs on the edge runtime and cannot reach Prisma.

### 5.4 Rate limiting

5 failed attempts per identifier per 15-minute sliding window, tracked in `login_attempts` keyed on identifier and IP. Response is a throttle with a clear retry-after, not an account lockout: PRD-01 FR5 asks for basic protection, and locking an account keyed on a phone number is a trivial denial-of-service against a real patient. Successful login clears the identifier's attempts.

Rate limiting also applies to the OTP endpoints when they arrive in sub-project 8, per PRD-12 §2.

### 5.5 Audit log

One `audit(actor, action, entityType, entityId, metadata)` service call, capturing IP address and a JSON metadata blob.

Actions logged in Foundation: `login_success`, `login_failure`, `logout`, `password_changed`, `password_reset_by_admin`, `role_changed`, `account_created`, `account_deactivated`.

Actions reserved for later slices, using the same call: `data_exported`, `patient_anonymised`.

No audit UI — PRD-12 §6 explicitly excludes an audit dashboard with search and filter.

### 5.6 Staff first login

`users.must_reset_password` forces a password change before any other page renders. Admin-created staff accounts are issued a temporary password, satisfying PRD-01 §3.2.

### 5.7 Deferred security items

- **2FA for staff:** PRD-01 defers to phase 2.
- **Password reset by code:** requires a `MessageProvider` that can actually send, so it lands in sub-project 8. Until then, an admin can reset a staff password directly, and the action is audited.

---

## 6. Minimal UI

Six surfaces, plain HTML and Tailwind. No design system — that is deliberately deferred, and building components before there are real screens to hold them tends to produce components that get rebuilt.

| Route | Purpose |
|---|---|
| `/login` | Staff login: email or phone, plus password |
| `/portal/login` | Patient login: phone plus password |
| `/portal/register` | Patient self-registration |
| `/reset-password` | Forced password change when `must_reset_password` is set |
| `(staff)` shell | Role-aware sidebar: therapist sees Schedule and Patients; receptionist sees Appointments, Patients, Payments; admin sees all plus Staff, Settings, Reports |
| `(portal)` shell | Patient navigation: Dashboard, Appointments, Profile, Payments |

Both shells display the logged-in user's name and role and provide a working logout. Navigation links point at routes that later sub-projects build; they render as visibly disabled or as a placeholder stating which sub-project delivers them.

Accessibility from the start: real `<label>` elements bound to inputs, form errors associated via `aria-describedby`, visible focus states, and login submission errors announced in a live region.

---

## 7. Seed data

Idempotent — re-running does not duplicate. Passwords come from environment variables with development-only fallbacks; no real credentials in the repository.

- 1 admin
- 2 therapists, each with a `staff_profiles` row
- 1 receptionist
- 3 patients: two with logins, one a walk-in lead with `user_id` null and `status = lead`, which exercises the nullable relationship PRD-11 requires
- The 6 services from PRD-02 §2.2, with durations, prices, slugs and sort order
- `clinic_settings` with Lagos opening hours, booking rules, and the pinned values from §3.11
- The 5 `notification_templates` from PRD-08 (`confirmation`, `reminder`, `reschedule`, `cancellation`, `payment`)

---

## 8. Testing

Vitest runs service-layer tests against `teta_physio_test`, truncating tables between tests. Playwright covers the login journeys end to end.

The tests that matter here are negative. Coverage percentage is not the target; the PRD-01 permission matrix is, because it is the one thing in this slice that is dangerous to get wrong.

**Required RBAC tests:**

- A receptionist cannot read `session_notes` or `assessments`.
- A therapist cannot read a patient with whom they share no appointment.
- A therapist with `can_view_all_patients` can read that patient.
- A patient cannot read another patient's records.
- A request with no session receives 401, not data.
- A request with an expired session receives 401.
- A revoked session receives 401 immediately.
- The 6th failed login within the window is throttled with a retry-after.
- A successful login clears prior failed attempts.
- A user with `must_reset_password` is redirected from every protected route to `/reset-password`.
- Soft-deleted users and patients are excluded from all service-layer reads.

**Required E2E journeys:** admin, therapist, receptionist and patient each log in, see role-correct navigation, and log out.

---

## 9. Definition of done

1. `npm run build` completes with no TypeScript or lint errors.
2. `prisma migrate deploy` applies cleanly to an empty database.
3. `prisma db seed` runs successfully and is idempotent on a second run.
4. All four roles log in through a browser and see role-correct navigation.
5. A staff account with `must_reset_password` is forced through `/reset-password` before reaching any other page.
6. The full RBAC test suite passes.
7. The Playwright login journeys pass.
8. `.env` is gitignored; `.env.example` contains no real credentials.
9. `git log` shows the work committed with the design doc.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Authoring all 27 tables up front encodes wrong assumptions for later slices | Tables are created but unused until their slice; a wrong column is a cheap additive migration, whereas a wrong core-table relationship discovered in sub-project 6 is not |
| Deviating from PRD-01's JWT could surprise the client | Recorded as an explicit deviation in §3.4 with reasoning; the observable behaviour PRD-01 asks for is unchanged |
| Local trust auth masks a production credential problem | §4.3 documents it; production uses Neon with `sslmode=require` |
| `Africa/Lagos` hardcoding blocks a future second branch in another timezone | Single exported constant, so it becomes a `clinic_settings` field if multi-branch ever arrives, which PRD-00 §3 excludes from v1 |
| RBAC guard omitted in a new route handler | Deny-by-default: `getSession()` is the only route to a user object, so an omitted guard yields no data. Enforced by the negative test suite |
