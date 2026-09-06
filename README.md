# TetaPhysio

Physiotherapy clinic management platform for a single clinic in Nigeria: public website, patient portal, and staff/admin portal, plus a Capacitor mobile app wrapping the patient surface.

## Status

Sub-projects 1 (Foundation), 2 (Clinic configuration), 3 (Booking engine), 4 (Public website), 5 (Patient portal), 6 (Clinical documentation & treatment plans) and 7 (Billing & payments) are complete. Sub-project 4 ships the marketing site with live clinic data and unauthenticated booking; sub-project 5 ships portal login/registration with staff-approved account linking, the patient dashboard with waiting and empty states, portal appointment booking/reschedule/cancel with cutoff and ownership enforcement, the digital intake form with consent, and profile editing with required email — plus the E2E journeys that cover them. Sub-project 6 ships the staff clinical record (episodes with auto-creation, assessments, SOAP session notes with the edit rule and relabels, treatment plans with exercises and portal visibility, direct-to-R2 document uploads) and the today-view. Sub-project 7 ships invoicing with derived status, manual cash/bank-transfer/POS payments with no-overpayment enforcement, the staff payments hub (outstanding, today's revenue by method, patient lookup, history), the portal balance card with payment history, Paystack online payments behind the gateway key plus the clinic switch with verified idempotent webhooks, and the E2E journeys that cover them. Operational features arrive with their own sub-projects.

| # | Sub-project | State |
|---|---|---|
| 1 | Foundation — schema, auth, RBAC, security | Done |
| 2 | Clinic config, services, therapist availability | Done |
| 3 | Booking engine, staff calendar, walk-ins | Done |
| 4 | Public website | Done |
| 5 | Patient portal + intake form | Done |
| 6 | Clinical documentation & treatment plans | Done |
| 7 | Billing & payments | Done |
| 8 | Notifications & reminders (+ OTP, password reset) | Not started |
| 9 | Reports & analytics | Not started |
| 10 | Admin remainder | Not started |
| 11 | Capacitor mobile app | Not started |

The staff dashboard in place today is a deliberate placeholder; the portal dashboard shipped with sub-project 5. Remaining screens arrive in sub-projects 7, 9 and 10.

## Requirements

- Node 20.19+ (developed on 24.14)
- PostgreSQL 17 (local instance on port 5435)

## Setup

```bash
npm install
cp .env.example .env      # then edit DATABASE_URL if your Postgres differs
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000.

Creating the two local databases, if they do not exist yet:

```bash
psql -h localhost -p 5435 -U postgres -d postgres \
  -c "CREATE DATABASE teta_physio_dev;" \
  -c "CREATE DATABASE teta_physio_test;"
```

The test database also needs the migrations applied once:

```bash
DATABASE_URL="postgresql://postgres@localhost:5435/teta_physio_test" npx prisma migrate deploy
```

Document uploads need four optional env vars (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`). Browsers PUT bytes direct to R2 via presigned
URLs, so files never pass through the server; without all four the record's Documents
section shows "Document storage is not configured" instead of the picker.

## Seeded logins

Passwords come from `SEED_ADMIN_PASSWORD`, `SEED_STAFF_PASSWORD` and `SEED_PATIENT_PASSWORD` (default `changeme1`). Every staff account must change its password on first login.

| Role | Identifier | Entry point |
|---|---|---|
| Admin | `admin@tetaphysio.ng` | `/login` |
| Therapist | `chidera@tetaphysio.ng` | `/login` |
| Therapist | `aisha@tetaphysio.ng` | `/login` |
| Receptionist | `reception@tetaphysio.ng` | `/login` |
| Patient | `08020000001` | `/portal/login` |

`TP-00003` is a walk-in lead with no login, which is what exercises the nullable `patients.user_id` relationship.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Generate the Prisma client, then build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit and integration tests |
| `npm run test:e2e` | Playwright login journeys |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:seed` | Idempotent seed |
| `npm run db:reset` | Drop, re-migrate, re-seed — destroys all data |

## Architecture

Single Next.js 16 App Router deployable in ESM. Route handlers under `src/app/api` parse, authorize, delegate to services under `src/server`, and serialize. Prisma 7 with the `PrismaPg` driver adapter is the data layer.

Four route groups: `(auth)`, `(public)`, `(portal)`, `(staff)`.

Authorization has three server-side layers:

1. `getCurrentUser()` — the only path to an authenticated user
2. `requireSession()` / `requireRole()` — throw, so an unchecked call fails closed
3. Service-layer ownership checks — row-level rules from the PRD-01 matrix

`src/middleware.ts` only redirects requests with no cookie. It never authorizes: the edge runtime cannot reach Prisma, so a forged cookie passes middleware and is rejected server-side.

Sessions are opaque 256-bit tokens, SHA-256 hashed before storage, in a `Secure`/`HttpOnly`/`SameSite=Lax` cookie with 7-day sliding expiry. This deviates from PRD-01's stated JWT; see §3.4 of the design spec for why (instant revocation, logout-everywhere, and no token-storage problem inside the Capacitor WebView).

### Prisma 7 notes

- ESM is required (`"type": "module"`)
- The client is imported from `@/generated/prisma/client`, never `@prisma/client`
- A driver adapter is mandatory
- `.env` is not auto-loaded — entry points outside Next.js must `import "dotenv/config"`
- `migrate dev` no longer runs `generate` or seeds; both are explicit

## Environments

| Environment | Database |
|---|---|
| Development | Local Postgres 17, `teta_physio_dev` |
| Test | Local Postgres 17, `teta_physio_test` |
| Production | Neon (`sslmode=require`, plus `DIRECT_URL` for migrations) |

The test suite never connects to Neon.

## Verified state

Last full sweep (sub-project 6): 27 tables, 15 enums, three migrations applied (`init`, `no_therapist_overlap`, `add_soap_labels`). 323 Vitest tests across 40 files pass. Playwright journeys pass on chromium and mobile (58 per project: auth, portal, booking, clinic-config, public, clinical). `tsc --noEmit`, `next build` and `eslint` clean (two pre-existing unused-var warnings in `tests/e2e/booking.spec.ts`).

## Documentation

- `AGENTS.md` — design system, styling decisions, architecture invariants
- `doc/prd/` — the 13 original PRDs
- `docs/superpowers/specs/` — design specs, including the 11 resolved PRD contradictions
- `docs/superpowers/plans/` — implementation plans
