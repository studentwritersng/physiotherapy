# TetaPhysio

Physiotherapy clinic management platform for a single clinic in Nigeria: public website, patient portal, and staff/admin portal, plus a Capacitor mobile app wrapping the patient surface.

## Status

Sub-project 1 of 11 (Foundation) is complete: database schema, authentication, RBAC, security baseline, and role-aware shells. Operational features arrive with their own sub-projects.

| # | Sub-project | State |
|---|---|---|
| 1 | Foundation — schema, auth, RBAC, security | Done |
| 2 | Clinic config, services, therapist availability | Not started |
| 3 | Booking engine, staff calendar, walk-ins | Not started |
| 4 | Public website | Not started |
| 5 | Patient portal + intake form | Not started |
| 6 | Clinical documentation & treatment plans | Not started |
| 7 | Billing & payments | Not started |
| 8 | Notifications & reminders (+ OTP, password reset) | Not started |
| 9 | Reports & analytics | Not started |
| 10 | Admin remainder | Not started |
| 11 | Capacitor mobile app | Not started |

The staff and portal dashboards in place today are deliberate placeholders. Real screens arrive in sub-projects 3, 5, 7, 9 and 10.

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

Last full sweep: 27 tables, 15 enums, 80 Vitest tests across 10 files, 28 Playwright tests across Desktop Chrome and Pixel 7. `tsc --noEmit`, `eslint .` and `next build` all clean.

## Documentation

- `AGENTS.md` — design system, styling decisions, architecture invariants
- `doc/prd/` — the 13 original PRDs
- `docs/superpowers/specs/` — design specs, including the 11 resolved PRD contradictions
- `docs/superpowers/plans/` — implementation plans
