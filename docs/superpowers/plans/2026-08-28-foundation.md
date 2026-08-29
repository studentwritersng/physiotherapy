# TetaPhysio Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build the TetaPhysio application skeleton — complete database schema, four-role authentication, server-enforced RBAC, the PRD-12 security baseline, and enough UI to log in as each role and see role-correct navigation.

**Architecture:** A single Next.js 16 App Router monolith in ESM. Route handlers under `src/app/api` are the API; they parse, authorize, delegate to a framework-agnostic service layer under `src/server`, and serialize. Prisma 7 with the `PrismaPg` driver adapter is the data layer against Postgres. Sessions are opaque SHA-256-hashed tokens in a `sessions` table, delivered as an HttpOnly cookie. RBAC is enforced in three layers: session resolution, role guards, and service-layer ownership checks.

**Tech Stack:** Next.js 16.3.3, React 19.2.8, TypeScript 5.9.3, Prisma 7.10.0 + `@prisma/adapter-pg`, PostgreSQL 17, `@node-rs/argon2` 2.1.0, Zod 4.4.3, Tailwind CSS 4.3.3, Vitest 4.1.11, Playwright 1.62.1.

**Spec:** `docs/superpowers/specs/2026-08-28-foundation-design.md`. Read it before starting. Section references below (§3.4, §5.2, etc.) point into it.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec.

- **ESM only.** `package.json` has `"type": "module"`. No `require()`, no `__dirname`. `tsconfig.json` uses `module: "ESNext"`, `moduleResolution: "bundler"`, `target: "ES2023"`.
- **Exact dependency versions.** No `^` or `~` anywhere in `package.json`. Install with `npm install --save-exact` (or `-E`).
- **Prisma client import path is `@/generated/prisma/client`.** Never `@prisma/client`. Prisma 7 requires an explicit generator `output`.
- **Prisma needs a driver adapter.** Always `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`.
- **Prisma does not load `.env`.** Any entry point that talks to the database outside Next.js (`prisma.config.ts`, `prisma/seed.ts`, Vitest setup) must `import "dotenv/config"` first. Omitting this produces an opaque `PrismaClientKnownRequestError`, not a helpful message.
- **All enum values are `snake_case`** — `in_session`, `no_show`, `partially_paid`. Display casing is a UI concern only (spec §3.7).
- **All timestamps are `timestamptz`** via `@db.Timestamptz`. All money is `@db.Decimal(12, 2)`. All UUIDs are `@db.Uuid`.
- **Application timezone is `Africa/Lagos`**, exported once from `src/lib/constants.ts` as `TIMEZONE`. Never hardcode it elsewhere (spec §3.8).
- **Passwords:** argon2id, `memoryCost: 19456`, `timeCost: 2`, `parallelism: 1`. Minimum 8 characters, at least one number. Never logged (spec §3.11).
- **Session cookie:** name from `SESSION_COOKIE_NAME` (default `tp_session`), `httpOnly: true`, `sameSite: "lax"`, `path: "/"`, `secure` true except on localhost, `maxAge` 604800 (7 days).
- **Rate limit:** 5 failed attempts per identifier per 15-minute sliding window. Throttle with retry-after, never lock the account.
- **Soft delete:** every service-layer read filters `deletedAt: null`. Prisma has no global filter; the filter lives in the service module for that entity and nowhere else.
- **Never commit secrets.** `.env` is gitignored. `.env.example` contains placeholders only — no Neon connection string, no real passwords.
- **Commit after every task.** Conventional Commit prefixes (`chore:`, `feat:`, `test:`, `fix:`).

---

## File Structure

| Path | Responsibility |
|---|---|
| `package.json` | Exact deps, ESM, scripts |
| `tsconfig.json` | Strict ESM TypeScript, `@/*` → `./src/*` |
| `next.config.ts` | Next config |
| `postcss.config.mjs` | Tailwind v4 PostCSS plugin |
| `eslint.config.mjs` | Flat ESLint config |
| `.prettierrc.json` | Formatting |
| `prisma.config.ts` | Prisma 7 datasource, migrations path, seed command |
| `prisma/schema.prisma` | All 27 tables and 15 enums |
| `prisma/seed.ts` | Idempotent seed |
| `vitest.config.ts` | Node environment, tsconfig paths, setup file |
| `playwright.config.ts` | E2E config |
| `.env.example` | Documented placeholders |
| `src/generated/prisma/` | Generated client (gitignored) |
| `src/lib/env.ts` | Zod-validated `process.env`, fails fast |
| `src/lib/constants.ts` | `TIMEZONE`, argon2 params, session/rate-limit/upload constants |
| `src/lib/zod/auth.ts` | Login, register, password schemas — shared client and server |
| `src/server/db.ts` | Prisma singleton with adapter |
| `src/server/auth/password.ts` | `hashPassword`, `verifyPassword` |
| `src/server/auth/session.ts` | `createSession`, `getSession`, `revokeSession`, `revokeAllSessions` |
| `src/server/auth/rate-limit.ts` | `checkRateLimit`, `recordFailedAttempt`, `clearAttempts` |
| `src/server/auth/rbac.ts` | `requireSession`, `requireRole`, `canViewPatient` |
| `src/server/auth/login.ts` | `login`, `registerPatient`, `changePassword` orchestration |
| `src/server/audit.ts` | `audit()` and the `AuditAction` union |
| `src/server/services/patient.ts` | Patient reads with soft-delete and ownership filters |
| `src/server/providers/*.ts` | `PaymentProvider`, `MessageProvider`, `StorageProvider` interfaces + local impls |
| `src/middleware.ts` | Unauthenticated redirect only — no authorization decisions |
| `src/app/api/auth/{login,logout,register,change-password}/route.ts` | Auth endpoints |
| `src/app/(auth)/{login,portal-login,portal-register,reset-password}/page.tsx` | Auth screens |
| `src/app/(staff)/layout.tsx`, `src/app/(portal)/layout.tsx` | Role-aware shells |
| `src/components/*.tsx` | `AuthForm`, `NavShell` |
| `tests/setup.ts` | `dotenv/config` + truncation helper |
| `tests/unit/*.test.ts` | Password, session, rate limit, audit |
| `tests/integration/rbac.test.ts` | The PRD-01 permission matrix |
| `tests/e2e/login.spec.ts` | Four login journeys |

---

## Prerequisites

Confirmed present on this machine: Node 24.14.0, npm 11.9.0, git 2.51.1, PostgreSQL 17.6 at `C:\Program Files\PostgreSQL\17\bin`, server listening on `localhost:5435` and accepting connections as role `postgres`.

The repo is already initialised with two commits (PRD set + design spec). Work on `main`.

---

## Task 1: Project scaffold and validated environment

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.prettierrc.json`, `.env.example`, `.env`
- Create: `src/lib/env.ts`, `src/lib/constants.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `vitest.config.ts`, `tests/setup.ts`, `tests/unit/env.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `src/lib/env.ts` exports `env` — a frozen object with `DATABASE_URL: string`, `DIRECT_URL: string | undefined`, `TEST_DATABASE_URL: string | undefined`, `SESSION_COOKIE_NAME: string`, `APP_URL: string`, `NODE_ENV: "development" | "test" | "production"`, `SEED_ADMIN_PASSWORD: string`, `SEED_STAFF_PASSWORD: string`, `SEED_PATIENT_PASSWORD: string`
  - `src/lib/env.ts` exports `parseEnv(raw: Record<string, string | undefined>): Env` for testing
  - `src/lib/constants.ts` exports `TIMEZONE`, `ARGON2_OPTIONS`, `SESSION_TTL_SECONDS`, `SESSION_SLIDE_AFTER_SECONDS`, `RATE_LIMIT_MAX_ATTEMPTS`, `RATE_LIMIT_WINDOW_SECONDS`, `PASSWORD_MIN_LENGTH`, `UPLOAD_MAX_BYTES`, `UPLOAD_ALLOWED_MIME`, `DEFAULT_SERVICE_DURATION_MINUTES`, `RESCHEDULE_CUTOFF_HOURS`, `CANCELLATION_CUTOFF_HOURS`, `REMINDER_LEAD_HOURS`

- [x] **Step 1: Create `package.json` with exact versions**

```json
{
  "name": "teta-physio",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "prisma db seed",
    "db:reset": "prisma migrate reset --force && prisma generate && prisma db seed",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@node-rs/argon2": "2.1.0",
    "@prisma/adapter-pg": "7.10.0",
    "@prisma/client": "7.10.0",
    "dotenv": "17.4.2",
    "next": "16.3.3",
    "pg": "8.23.0",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "server-only": "0.0.1",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@playwright/test": "1.62.1",
    "@tailwindcss/postcss": "4.3.3",
    "@types/node": "26.4.0",
    "@types/pg": "8.23.1",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.5",
    "@vitest/coverage-v8": "4.1.11",
    "eslint": "9.42.0",
    "eslint-config-next": "16.3.3",
    "prettier": "3.9.6",
    "prisma": "7.10.0",
    "tailwindcss": "4.3.3",
    "tsx": "4.23.12",
    "typescript": "5.9.3",
    "vitest": "4.1.11"
  }
}
```

- [x] **Step 2: Install dependencies**

Run: `npm install`
Expected: completes with no `ERESOLVE` peer errors. `@node-rs/argon2` installs a prebuilt `win32-x64-msvc` binary with no compilation.

If npm reports a peer conflict on `eslint`, run `npm view eslint-config-next@16.3.3 peerDependencies` and pin `eslint` to the highest 9.x that satisfies it. Do not use `--legacy-peer-deps`.

- [x] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "allowJs": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "skipLibCheck": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "src/generated"]
}
```

Note: `next build` will rewrite `jsx` to `react-jsx` and add `.next/dev/types/**/*.ts` to `include` on first run. That is expected; let it.

- [x] **Step 4: Create config files**

`next.config.ts`:

```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  turbopack: { root: import.meta.dirname },
};

export default config;
```

The `turbopack.root` line matters: without it Next walks up to `C:\Users\Teta` looking for a lockfile and warns that it would include the home directory.

`postcss.config.mjs`:

```js
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

`eslint.config.mjs`:

```js
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { ignores: ["src/generated/**", ".next/**", "node_modules/**"] },
];
```

Run `npm install -E -D @eslint/eslintrc@3.3.6` for the `FlatCompat` import.

`.prettierrc.json`:

```json
{ "semi": true, "singleQuote": false, "trailingComma": "all", "printWidth": 100 }
```

- [x] **Step 5: Create `.env.example` (committed) and `.env` (gitignored)**

`.env.example`:

```
# Local development database (PostgreSQL 17 on port 5435)
DATABASE_URL="postgresql://postgres@localhost:5435/teta_physio_dev"

# Local test database — wiped between test runs, never point this at production
TEST_DATABASE_URL="postgresql://postgres@localhost:5435/teta_physio_test"

# Production only: Neon requires sslmode=require.
# DATABASE_URL is the pooled connection; DIRECT_URL is the non-pooled one Prisma uses for migrations.
# DATABASE_URL="postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DB?sslmode=require"
# DIRECT_URL="postgresql://USER:PASSWORD@HOST.REGION.aws.neon.tech/DB?sslmode=require"

SESSION_COOKIE_NAME="tp_session"
APP_URL="http://localhost:3000"

# Seed passwords — development values only. Set real ones in production before seeding.
SEED_ADMIN_PASSWORD="changeme1"
SEED_STAFF_PASSWORD="changeme1"
SEED_PATIENT_PASSWORD="changeme1"
```

`.env` is a copy of the same file with the commented production lines removed. Verify `git status` does not list `.env`.

- [x] **Step 6: Write the failing test for env validation**

`tests/unit/env.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseEnv } from "@/lib/env";

const valid = {
  DATABASE_URL: "postgresql://postgres@localhost:5435/teta_physio_dev",
  SESSION_COOKIE_NAME: "tp_session",
  APP_URL: "http://localhost:3000",
  NODE_ENV: "test",
  SEED_ADMIN_PASSWORD: "changeme1",
  SEED_STAFF_PASSWORD: "changeme1",
  SEED_PATIENT_PASSWORD: "changeme1",
};

describe("parseEnv", () => {
  it("accepts a valid environment", () => {
    const env = parseEnv(valid);
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.SESSION_COOKIE_NAME).toBe("tp_session");
  });

  it("defaults SESSION_COOKIE_NAME when absent", () => {
    const { SESSION_COOKIE_NAME, ...rest } = valid;
    expect(parseEnv(rest).SESSION_COOKIE_NAME).toBe("tp_session");
  });

  it("throws when DATABASE_URL is missing", () => {
    const { DATABASE_URL, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("throws when DATABASE_URL is not a postgres URL", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://localhost/x" })).toThrow();
  });

  it("throws when a seed password is shorter than 8 characters", () => {
    expect(() => parseEnv({ ...valid, SEED_ADMIN_PASSWORD: "short" })).toThrow();
  });
});
```

- [x] **Step 7: Create `vitest.config.ts` and `tests/setup.ts`**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
  },
});
```

`resolve.tsconfigPaths: true` is Vitest 4's native replacement for the `vite-tsconfig-paths` plugin. Do not install that plugin.

`tests/setup.ts`:

```ts
import "dotenv/config";

// Prisma 7 does not load .env itself. Without this import, every Prisma call in a
// test fails with an opaque PrismaClientKnownRequestError instead of a missing-URL error.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
```

- [x] **Step 8: Run the test to verify it fails**

Run: `npx vitest run tests/unit/env.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/env"`.

- [x] **Step 9: Implement `src/lib/env.ts`**

```ts
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().refine((v) => v.startsWith("postgresql://") || v.startsWith("postgres://"), {
    message: "DATABASE_URL must be a PostgreSQL connection string",
  }),
  DIRECT_URL: z.string().optional(),
  TEST_DATABASE_URL: z.string().optional(),
  SESSION_COOKIE_NAME: z.string().min(1).default("tp_session"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SEED_ADMIN_PASSWORD: z.string().min(8).default("changeme1"),
  SEED_STAFF_PASSWORD: z.string().min(8).default("changeme1"),
  SEED_PATIENT_PASSWORD: z.string().min(8).default("changeme1"),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${detail}`);
  }
  return Object.freeze(result.data);
}

export const env: Env = parseEnv(process.env);
```

- [x] **Step 10: Run the test to verify it passes**

Run: `npx vitest run tests/unit/env.test.ts`
Expected: PASS, 5 tests.

- [x] **Step 11: Create `src/lib/constants.ts`**

```ts
/**
 * Every value here is a decision recorded in the design spec (§3.11), not a magic number.
 * Values the clinic may change at runtime live in clinic_settings instead.
 */

/** WAT, UTC+1, no DST. Every "today" and date-range calculation derives from this (spec §3.8). */
export const TIMEZONE = "Africa/Lagos";

/** OWASP argon2id baseline. */
export const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN_LENGTH = 8;

/** 7 days. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Slide expiry only after 24h of use, to avoid a write on every request (spec §5.2). */
export const SESSION_SLIDE_AFTER_SECONDS = 24 * 60 * 60;
export const SESSION_TOKEN_BYTES = 32;

export const RATE_LIMIT_MAX_ATTEMPTS = 5;
export const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Booking defaults, consumed by sub-project 3. Seeded into clinic_settings. */
export const DEFAULT_SERVICE_DURATION_MINUTES = 45;
export const RESCHEDULE_CUTOFF_HOURS = 2;
export const CANCELLATION_CUTOFF_HOURS = 2;
export const REMINDER_LEAD_HOURS = [24, 2] as const;

export const CURRENCY = "NGN";
```

- [x] **Step 12: Create the minimal app shell so `next build` has something to build**

`src/app/globals.css`:

```css
@import "tailwindcss";
```

`src/app/layout.tsx`:

```tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TetaPhysio",
  description: "Physiotherapy clinic management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:

```tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">TetaPhysio</h1>
      <p className="mt-2 text-gray-600">
        The public website is delivered in sub-project 4.
      </p>
      <nav className="mt-6 flex gap-4">
        <Link className="text-blue-700 underline" href="/login">
          Staff login
        </Link>
        <Link className="text-blue-700 underline" href="/portal/login">
          Patient login
        </Link>
      </nav>
    </main>
  );
}
```

- [x] **Step 13: Verify build, typecheck and lint all pass**

Run: `npm run typecheck && npm run lint && npx next build`
Expected: all three succeed. `next build` lists `/` as a static route.

- [x] **Step 14: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs eslint.config.mjs .prettierrc.json .env.example vitest.config.ts tests/ src/
git commit -m "chore: scaffold Next.js 16 app with validated environment

Exact-pinned ESM setup: Next 16.3.3, React 19.2.8, TypeScript 5.9.3,
Tailwind 4.3.3, Vitest 4.1.11. Adds zod-validated env that fails fast on a
missing or malformed DATABASE_URL, and the pinned constants from spec 3.11."
```

Confirm `git status` does not show `.env`.

---

## Task 2: Prisma configuration and the complete schema

**Files:**
- Create: `prisma.config.ts`, `prisma/schema.prisma`
- Modify: `.gitignore` (add `src/generated`)
- Create: `tests/integration/schema.test.ts`

**Interfaces:**
- Consumes: `src/lib/env.ts` (Task 1)
- Produces: the generated client at `src/generated/prisma/client`, exporting `PrismaClient` plus the enum objects `UserRole`, `UserStatus`, `PatientStatus`, `AppointmentStatus`, `BookedVia`, `TreatmentPlanStatus`, `DocumentType`, `InvoiceStatus`, `PaymentMethod`, `NotificationType`, `NotificationChannel`, `NotificationStatus`, `VerificationPurpose`, `EpisodeStatus`, `DevicePlatform`, and the model types `User`, `Session`, `Patient`, `StaffProfile`, `Service`, `Appointment`, `AuditLog`, `LoginAttempt` (and the rest).

This task authors all 27 tables in one pass (spec §4.4) so later sub-projects add no core-table migrations. Only the auth tables get used in Foundation; the rest exist and stay empty.

- [x] **Step 1: Create the two local databases**

```bash
"/c/Program Files/PostgreSQL/17/bin/psql.exe" -h localhost -p 5435 -U postgres -d postgres \
  -c "CREATE DATABASE teta_physio_dev;" -c "CREATE DATABASE teta_physio_test;"
```

Expected: `CREATE DATABASE` twice. If either already exists, that is fine — proceed.

- [x] **Step 2: Add the generated client to `.gitignore`**

Append to `.gitignore`:

```
# Prisma generated client — regenerated by `npm run db:generate`
src/generated/
```

- [x] **Step 3: Create `prisma.config.ts`**

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // In production this is the Neon DIRECT_URL (non-pooled), because migrations
    // cannot run over a pooled connection.
    url: env("DIRECT_URL") ?? env("DATABASE_URL"),
  },
});
```

This file replaces the deprecated `url` / `directUrl` fields in the schema's `datasource` block, and registers the seed command that `prisma db seed` runs.

- [x] **Step 4: Create `prisma/schema.prisma` — generator, datasource, enums**

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// ─────────────────────────── Enums ───────────────────────────
// All values are snake_case (spec §3.7). Display casing is a UI concern.

enum UserRole {
  patient
  therapist
  receptionist
  admin
}

enum UserStatus {
  active
  inactive
}

enum PatientStatus {
  lead
  registered
  inactive
}

enum AppointmentStatus {
  scheduled
  confirmed
  arrived
  in_session
  completed
  cancelled
  no_show
}

enum BookedVia {
  public
  portal
  staff
}

enum EpisodeStatus {
  active
  discharged
}

enum TreatmentPlanStatus {
  active
  completed
  on_hold
}

enum DocumentType {
  referral
  medical_report
  xray
  mri
  other
}

enum InvoiceStatus {
  unpaid
  partially_paid
  paid
}

enum PaymentMethod {
  cash
  bank_transfer
  pos
  online_gateway
}

enum NotificationType {
  confirmation
  reminder
  reschedule
  cancellation
  payment
}

enum NotificationChannel {
  sms
  whatsapp
  email
  push
}

enum NotificationStatus {
  queued
  sent
  delivered
  failed
}

enum VerificationPurpose {
  login_otp
  password_reset
  phone_verification
}

enum DevicePlatform {
  android
  ios
}
```

- [x] **Step 5: Append the identity and auth models**

```prisma
// ─────────────────────── Identity & auth ───────────────────────

model User {
  id                String     @id @default(uuid()) @db.Uuid
  name              String
  email             String?    @unique
  phone             String     @unique
  passwordHash      String     @map("password_hash")
  role              UserRole
  status            UserStatus @default(active)
  mustResetPassword Boolean    @default(false) @map("must_reset_password")
  lastLoginAt       DateTime?  @map("last_login_at") @db.Timestamptz
  deletedAt         DateTime?  @map("deleted_at") @db.Timestamptz
  createdAt         DateTime   @default(now()) @map("created_at") @db.Timestamptz
  updatedAt         DateTime   @updatedAt @map("updated_at") @db.Timestamptz

  sessions            Session[]
  verificationCodes   VerificationCode[]
  deviceTokens        DeviceToken[]
  patient             Patient?
  staffProfile        StaffProfile?
  availability        TherapistAvailability[]
  appointments        Appointment[]           @relation("TherapistAppointments")
  statusChanges       AppointmentStatusHistory[]
  cancelledAppointments Appointment[]         @relation("CancelledByUser")
  episodes            EpisodeOfCare[]
  assessments         Assessment[]
  sessionNotes        SessionNote[]           @relation("NoteAuthor")
  editedNotes         SessionNote[]           @relation("NoteEditor")
  treatmentPlans      TreatmentPlan[]
  uploadedDocuments   PatientDocument[]
  createdInvoices     Invoice[]
  recordedPayments    Payment[]
  auditEntries        AuditLog[]

  @@index([role])
  @@index([deletedAt])
  @@map("users")
}

/// Opaque session tokens. Only the SHA-256 hash is stored, so a table leak
/// yields nothing usable (spec §3.4, §5.2).
model Session {
  id         String   @id @default(uuid()) @db.Uuid
  tokenHash  String   @unique @map("token_hash")
  userId     String   @map("user_id") @db.Uuid
  expiresAt  DateTime @map("expires_at") @db.Timestamptz
  lastUsedAt DateTime @default(now()) @map("last_used_at") @db.Timestamptz
  ipAddress  String?  @map("ip_address")
  userAgent  String?  @map("user_agent")
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@map("sessions")
}

/// OTP and password-reset codes. Created in Foundation, used in sub-project 8
/// once a MessageProvider can actually send (spec §3.1).
model VerificationCode {
  id         String              @id @default(uuid()) @db.Uuid
  userId     String?             @map("user_id") @db.Uuid
  identifier String
  codeHash   String              @map("code_hash")
  purpose    VerificationPurpose
  expiresAt  DateTime            @map("expires_at") @db.Timestamptz
  consumedAt DateTime?           @map("consumed_at") @db.Timestamptz
  attempts   Int                 @default(0)
  createdAt  DateTime            @default(now()) @map("created_at") @db.Timestamptz

  user User? @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([identifier, purpose])
  @@index([expiresAt])
  @@map("verification_codes")
}

/// Failed-login tracking for the rate limiter. Throttles, never locks (spec §5.4).
model LoginAttempt {
  id         String   @id @default(uuid()) @db.Uuid
  identifier String
  ipAddress  String?  @map("ip_address")
  successful Boolean  @default(false)
  attemptedAt DateTime @default(now()) @map("attempted_at") @db.Timestamptz

  @@index([identifier, attemptedAt])
  @@map("login_attempts")
}

model StaffProfile {
  id                 String  @id @default(uuid()) @db.Uuid
  userId             String  @unique @map("user_id") @db.Uuid
  title              String?
  qualifications     String?
  bio                String?
  photoUrl           String? @map("photo_url")
  publicVisible      Boolean @default(true) @map("public_visible")
  /// PRD-01 FR3's admin-granted "view all patients" flag. No PRD gave it a
  /// storage location (spec §3.6).
  canViewAllPatients Boolean @default(false) @map("can_view_all_patients")
  sortOrder          Int     @default(0) @map("sort_order")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("staff_profiles")
}
```

- [x] **Step 6: Append the patient and clinic-configuration models**

```prisma
// ─────────────────── Patients & clinic config ───────────────────

model Patient {
  id                    String        @id @default(uuid()) @db.Uuid
  patientCode           String        @unique @map("patient_code")
  userId                String?       @unique @map("user_id") @db.Uuid
  fullName              String        @map("full_name")
  phone                 String
  email                 String?
  dateOfBirth           DateTime?     @map("date_of_birth") @db.Date
  address               String?
  emergencyContactName  String?       @map("emergency_contact_name")
  emergencyContactPhone String?       @map("emergency_contact_phone")
  basicMedicalInfo      String?       @map("basic_medical_info")
  status                PatientStatus @default(lead)
  consentGiven          Boolean       @default(false) @map("consent_given")
  consentDate           DateTime?     @map("consent_date") @db.Timestamptz
  optOutNotifications   Boolean       @default(false) @map("opt_out_notifications")
  /// Set when identifying fields are overwritten on an erasure request (spec §3.2).
  anonymisedAt          DateTime?     @map("anonymised_at") @db.Timestamptz
  deletedAt             DateTime?     @map("deleted_at") @db.Timestamptz
  createdAt             DateTime      @default(now()) @map("created_at") @db.Timestamptz
  updatedAt             DateTime      @updatedAt @map("updated_at") @db.Timestamptz

  user            User?             @relation(fields: [userId], references: [id], onDelete: SetNull)
  appointments    Appointment[]
  intakeForms     IntakeForm[]
  episodes        EpisodeOfCare[]
  assessments     Assessment[]
  sessionNotes    SessionNote[]
  treatmentPlans  TreatmentPlan[]
  documents       PatientDocument[]
  invoices        Invoice[]
  notificationLog NotificationLog[]
  notificationQueue NotificationQueue[]

  @@index([phone])
  @@index([status])
  @@index([deletedAt])
  @@map("patients")
}

model Service {
  id                     String    @id @default(uuid()) @db.Uuid
  name                   String
  slug                   String    @unique
  description            String?
  defaultDurationMinutes Int       @default(45) @map("default_duration_minutes")
  defaultPrice           Decimal   @default(0) @map("default_price") @db.Decimal(12, 2)
  imageUrl               String?   @map("image_url")
  active                 Boolean   @default(true)
  sortOrder              Int       @default(0) @map("sort_order")
  deletedAt              DateTime? @map("deleted_at") @db.Timestamptz
  createdAt              DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt              DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  appointments Appointment[]

  @@index([active])
  @@map("services")
}

/// Singleton config row. Enforced by a fixed primary key of 1 rather than a
/// unique constraint, so a second row is impossible.
model ClinicSettings {
  id                      Int      @id @default(1)
  clinicName              String   @default("TetaPhysio") @map("clinic_name")
  tagline                 String?
  logoUrl                 String?  @map("logo_url")
  aboutContent            String?  @map("about_content")
  contactPhone            String?  @map("contact_phone")
  contactWhatsapp         String?  @map("contact_whatsapp")
  contactEmail            String?  @map("contact_email")
  address                 String?
  /// JSON keyed by day of week, e.g. { "monday": { "open": "08:00", "close": "17:00" } }
  openingHours            Json     @default("{}") @map("opening_hours")
  bookingLeadTimeHours    Int      @default(0) @map("booking_lead_time_hours")
  rescheduleCutoffHours   Int      @default(2) @map("reschedule_cutoff_hours")
  cancellationCutoffHours Int      @default(2) @map("cancellation_cutoff_hours")
  reminderLeadHours       Int[]    @default([24, 2]) @map("reminder_lead_hours")
  /// Master switch over every per-plan patient_visible flag (spec §3.3).
  showClinicalToPatients  Boolean  @default(false) @map("show_clinical_to_patients")
  onlinePaymentsEnabled   Boolean  @default(false) @map("online_payments_enabled")
  receptionistSeesRevenue Boolean  @default(false) @map("receptionist_sees_revenue")
  therapistSeesOwnStats   Boolean  @default(true) @map("therapist_sees_own_stats")
  updatedAt               DateTime @updatedAt @map("updated_at") @db.Timestamptz

  @@map("clinic_settings")
}

model Testimonial {
  id           String   @id @default(uuid()) @db.Uuid
  patientName  String   @map("patient_name")
  content      String
  published    Boolean  @default(false)
  sortOrder    Int      @default(0) @map("sort_order")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@index([published])
  @@map("testimonials")
}

/// One row is either a recurring weekly window (dayOfWeek set) or a one-off
/// date (specificDate set). PRD-11 left this fork unresolved; this is the
/// decision. isBlocked marks leave and holidays.
model TherapistAvailability {
  id           String    @id @default(uuid()) @db.Uuid
  therapistId  String    @map("therapist_id") @db.Uuid
  dayOfWeek    Int?      @map("day_of_week")
  specificDate DateTime? @map("specific_date") @db.Date
  startTime    String    @map("start_time")
  endTime      String    @map("end_time")
  isBlocked    Boolean   @default(false) @map("is_blocked")
  reason       String?
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz

  therapist User @relation(fields: [therapistId], references: [id], onDelete: Cascade)

  @@index([therapistId, dayOfWeek])
  @@index([therapistId, specificDate])
  @@map("therapist_availability")
}
```

- [x] **Step 7: Append the appointment models**

```prisma
// ───────────────────────── Appointments ─────────────────────────

model Appointment {
  id                 String            @id @default(uuid()) @db.Uuid
  patientId          String            @map("patient_id") @db.Uuid
  therapistId        String?           @map("therapist_id") @db.Uuid
  serviceId          String            @map("service_id") @db.Uuid
  episodeId          String?           @map("episode_id") @db.Uuid
  scheduledStart     DateTime          @map("scheduled_start") @db.Timestamptz
  scheduledEnd       DateTime          @map("scheduled_end") @db.Timestamptz
  status             AppointmentStatus @default(scheduled)
  bookedVia          BookedVia         @map("booked_via")
  reasonForVisit     String?           @map("reason_for_visit")
  /// PRD-09 wants cancellation reasons; PRD-11 had no column (spec §3.10).
  cancellationReason String?           @map("cancellation_reason")
  cancelledById      String?           @map("cancelled_by_id") @db.Uuid
  /// True when staff overrode a full slot per PRD-03 FR5.
  wasForceBooked     Boolean           @default(false) @map("was_force_booked")
  deletedAt          DateTime?         @map("deleted_at") @db.Timestamptz
  createdAt          DateTime          @default(now()) @map("created_at") @db.Timestamptz
  updatedAt          DateTime          @updatedAt @map("updated_at") @db.Timestamptz

  patient       Patient                    @relation(fields: [patientId], references: [id])
  therapist     User?                      @relation("TherapistAppointments", fields: [therapistId], references: [id], onDelete: SetNull)
  service       Service                    @relation(fields: [serviceId], references: [id])
  episode       EpisodeOfCare?             @relation(fields: [episodeId], references: [id], onDelete: SetNull)
  cancelledBy   User?                      @relation("CancelledByUser", fields: [cancelledById], references: [id], onDelete: SetNull)
  statusHistory AppointmentStatusHistory[]
  sessionNote   SessionNote?
  invoices      Invoice[]
  notificationLog NotificationLog[]

  @@index([scheduledStart])
  @@index([status])
  @@index([patientId])
  @@index([therapistId, scheduledStart])
  @@map("appointments")
}

model AppointmentStatusHistory {
  id            String            @id @default(uuid()) @db.Uuid
  appointmentId String            @map("appointment_id") @db.Uuid
  status        AppointmentStatus
  changedById   String?           @map("changed_by_id") @db.Uuid
  changedAt     DateTime          @default(now()) @map("changed_at") @db.Timestamptz

  appointment Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  changedBy   User?       @relation(fields: [changedById], references: [id], onDelete: SetNull)

  @@index([appointmentId])
  @@map("appointment_status_history")
}
```

- [x] **Step 8: Append the clinical models**

```prisma
// ────────────────────────── Clinical ──────────────────────────

model IntakeForm {
  id                 String    @id @default(uuid()) @db.Uuid
  patientId          String    @map("patient_id") @db.Uuid
  reasonForVisit     String?   @map("reason_for_visit")
  medicalHistory     String?   @map("medical_history")
  previousInjuries   String?   @map("previous_injuries")
  previousSurgeries  String?   @map("previous_surgeries")
  currentMedications String?   @map("current_medications")
  allergies          String?
  referringDoctor    String?   @map("referring_doctor")
  submittedAt        DateTime? @map("submitted_at") @db.Timestamptz
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz

  patient Patient @relation(fields: [patientId], references: [id], onDelete: Cascade)

  @@index([patientId])
  @@map("intake_forms")
}

/// PRD-05 treats "episode of care" as load-bearing (one initial assessment per
/// episode) but no PRD modelled it (spec §3.10).
model EpisodeOfCare {
  id                String        @id @default(uuid()) @db.Uuid
  patientId         String        @map("patient_id") @db.Uuid
  primaryTherapistId String?      @map("primary_therapist_id") @db.Uuid
  reason            String
  status            EpisodeStatus @default(active)
  startedAt         DateTime      @default(now()) @map("started_at") @db.Timestamptz
  dischargedAt      DateTime?     @map("discharged_at") @db.Timestamptz

  patient          Patient           @relation(fields: [patientId], references: [id], onDelete: Cascade)
  primaryTherapist User?             @relation(fields: [primaryTherapistId], references: [id], onDelete: SetNull)
  appointments     Appointment[]
  assessments      Assessment[]
  sessionNotes     SessionNote[]
  treatmentPlans   TreatmentPlan[]
  documents        PatientDocument[]

  @@index([patientId, status])
  @@map("episodes_of_care")
}

model Assessment {
  id                 String    @id @default(uuid()) @db.Uuid
  patientId          String    @map("patient_id") @db.Uuid
  therapistId        String    @map("therapist_id") @db.Uuid
  episodeId          String?   @map("episode_id") @db.Uuid
  chiefComplaint     String?   @map("chief_complaint")
  history            String?
  examination        String?
  assessment         String?
  treatmentGoals     String?   @map("treatment_goals")
  treatmentPlan      String?   @map("treatment_plan")
  editedAt           DateTime? @map("edited_at") @db.Timestamptz
  editedById         String?   @map("edited_by_id") @db.Uuid
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz

  patient   Patient        @relation(fields: [patientId], references: [id], onDelete: Cascade)
  therapist User           @relation(fields: [therapistId], references: [id])
  episode   EpisodeOfCare? @relation(fields: [episodeId], references: [id], onDelete: SetNull)

  @@index([patientId])
  @@map("assessments")
}

model SessionNote {
  id                    String    @id @default(uuid()) @db.Uuid
  appointmentId         String    @unique @map("appointment_id") @db.Uuid
  patientId             String    @map("patient_id") @db.Uuid
  therapistId           String    @map("therapist_id") @db.Uuid
  episodeId             String?   @map("episode_id") @db.Uuid
  subjective            String?
  objective             String?
  treatmentProvided     String?   @map("treatment_provided")
  patientResponse       String?   @map("patient_response")
  exercisesInstructions String?   @map("exercises_instructions")
  nextPlan              String?   @map("next_plan")
  editedAt              DateTime? @map("edited_at") @db.Timestamptz
  editedById            String?   @map("edited_by_id") @db.Uuid
  createdAt             DateTime  @default(now()) @map("created_at") @db.Timestamptz

  appointment Appointment    @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  patient     Patient        @relation(fields: [patientId], references: [id], onDelete: Cascade)
  therapist   User           @relation("NoteAuthor", fields: [therapistId], references: [id])
  editedBy    User?          @relation("NoteEditor", fields: [editedById], references: [id], onDelete: SetNull)
  episode     EpisodeOfCare? @relation(fields: [episodeId], references: [id], onDelete: SetNull)

  @@index([patientId, createdAt])
  @@map("session_notes")
}

model TreatmentPlan {
  id             String              @id @default(uuid()) @db.Uuid
  patientId      String              @map("patient_id") @db.Uuid
  therapistId    String              @map("therapist_id") @db.Uuid
  episodeId      String?             @map("episode_id") @db.Uuid
  goals          String?
  planDetails    String?             @map("plan_details")
  frequency      String?
  duration       String?
  focusAreas     String?             @map("focus_areas")
  status         TreatmentPlanStatus @default(active)
  /// Per-plan visibility, gated by clinic_settings.show_clinical_to_patients (spec §3.3).
  patientVisible Boolean             @default(false) @map("patient_visible")
  createdAt      DateTime            @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime            @updatedAt @map("updated_at") @db.Timestamptz

  patient   Patient        @relation(fields: [patientId], references: [id], onDelete: Cascade)
  therapist User           @relation(fields: [therapistId], references: [id])
  episode   EpisodeOfCare? @relation(fields: [episodeId], references: [id], onDelete: SetNull)
  exercises Exercise[]

  @@index([patientId, status])
  @@map("treatment_plans")
}

model Exercise {
  id              String  @id @default(uuid()) @db.Uuid
  treatmentPlanId String  @map("treatment_plan_id") @db.Uuid
  name            String
  description     String?
  imageUrl        String? @map("image_url")
  patientVisible  Boolean @default(false) @map("patient_visible")
  sortOrder       Int     @default(0) @map("sort_order")

  treatmentPlan TreatmentPlan @relation(fields: [treatmentPlanId], references: [id], onDelete: Cascade)

  @@index([treatmentPlanId])
  @@map("exercises")
}

model PatientDocument {
  id           String       @id @default(uuid()) @db.Uuid
  patientId    String       @map("patient_id") @db.Uuid
  episodeId    String?      @map("episode_id") @db.Uuid
  uploadedById String       @map("uploaded_by_id") @db.Uuid
  documentType DocumentType @map("document_type")
  fileUrl      String       @map("file_url")
  fileName     String       @map("file_name")
  fileSize     Int          @map("file_size")
  mimeType     String       @map("mime_type")
  uploadedAt   DateTime     @default(now()) @map("uploaded_at") @db.Timestamptz

  patient    Patient        @relation(fields: [patientId], references: [id], onDelete: Cascade)
  episode    EpisodeOfCare? @relation(fields: [episodeId], references: [id], onDelete: SetNull)
  uploadedBy User           @relation(fields: [uploadedById], references: [id])

  @@index([patientId])
  @@map("patient_documents")
}
```

- [x] **Step 9: Append the billing, notification and audit models**

```prisma
// ─────────────────────────── Billing ───────────────────────────

model Invoice {
  id            String        @id @default(uuid()) @db.Uuid
  invoiceNumber String        @unique @map("invoice_number")
  patientId     String        @map("patient_id") @db.Uuid
  appointmentId String?       @map("appointment_id") @db.Uuid
  totalAmount   Decimal       @map("total_amount") @db.Decimal(12, 2)
  status        InvoiceStatus @default(unpaid)
  notes         String?
  createdById   String        @map("created_by_id") @db.Uuid
  createdAt     DateTime      @default(now()) @map("created_at") @db.Timestamptz
  updatedAt     DateTime      @updatedAt @map("updated_at") @db.Timestamptz

  patient     Patient       @relation(fields: [patientId], references: [id])
  appointment Appointment?  @relation(fields: [appointmentId], references: [id], onDelete: SetNull)
  createdBy   User          @relation(fields: [createdById], references: [id])
  items       InvoiceItem[]
  payments    Payment[]

  @@index([patientId])
  @@index([status])
  @@map("invoices")
}

model InvoiceItem {
  id          String  @id @default(uuid()) @db.Uuid
  invoiceId   String  @map("invoice_id") @db.Uuid
  description String
  quantity    Int     @default(1)
  unitPrice   Decimal @map("unit_price") @db.Decimal(12, 2)
  amount      Decimal @db.Decimal(12, 2)

  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@index([invoiceId])
  @@map("invoice_items")
}

model Payment {
  id                String        @id @default(uuid()) @db.Uuid
  invoiceId         String        @map("invoice_id") @db.Uuid
  amount            Decimal       @db.Decimal(12, 2)
  method            PaymentMethod
  reference         String?
  /// PRD-07 FR2 requires notes; PRD-11 had only reference (spec §3.10).
  notes             String?
  providerReference String?       @map("provider_reference")
  /// Null for gateway/automated payments.
  recordedById      String?       @map("recorded_by_id") @db.Uuid
  paidAt            DateTime      @default(now()) @map("paid_at") @db.Timestamptz

  invoice    Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  recordedBy User?   @relation(fields: [recordedById], references: [id], onDelete: SetNull)

  @@index([invoiceId])
  @@index([paidAt])
  @@map("payments")
}

// ──────────────────────── Notifications ────────────────────────

model NotificationTemplate {
  id           String              @id @default(uuid()) @db.Uuid
  type         NotificationType
  channel      NotificationChannel
  subject      String?
  templateText String              @map("template_text")
  active       Boolean             @default(true)
  updatedAt    DateTime            @updatedAt @map("updated_at") @db.Timestamptz

  @@unique([type, channel])
  @@map("notification_templates")
}

/// The outbox PRD-08 §6 calls `notifications` but PRD-11 never defined.
/// Carries the retry counter and error reason PRD-08 FR2 requires (spec §3.10).
model NotificationQueue {
  id                String              @id @default(uuid()) @db.Uuid
  patientId         String              @map("patient_id") @db.Uuid
  type              NotificationType
  channel           NotificationChannel
  recipient         String
  body              String
  status            NotificationStatus  @default(queued)
  scheduledFor      DateTime            @map("scheduled_for") @db.Timestamptz
  retryCount        Int                 @default(0) @map("retry_count")
  lastError         String?             @map("last_error")
  providerMessageId String?             @map("provider_message_id")
  sentAt            DateTime?           @map("sent_at") @db.Timestamptz
  relatedAppointmentId String?          @map("related_appointment_id") @db.Uuid
  relatedInvoiceId     String?          @map("related_invoice_id") @db.Uuid
  createdAt         DateTime            @default(now()) @map("created_at") @db.Timestamptz

  patient Patient @relation(fields: [patientId], references: [id], onDelete: Cascade)

  @@index([status, scheduledFor])
  @@map("notification_queue")
}

model NotificationLog {
  id                   String              @id @default(uuid()) @db.Uuid
  patientId            String              @map("patient_id") @db.Uuid
  type                 NotificationType
  channel              NotificationChannel
  status               NotificationStatus
  recipient            String
  providerMessageId    String?             @map("provider_message_id")
  errorReason          String?             @map("error_reason")
  sentAt               DateTime            @default(now()) @map("sent_at") @db.Timestamptz
  relatedAppointmentId String?             @map("related_appointment_id") @db.Uuid
  relatedInvoiceId     String?             @map("related_invoice_id") @db.Uuid

  patient     Patient      @relation(fields: [patientId], references: [id], onDelete: Cascade)
  appointment Appointment? @relation(fields: [relatedAppointmentId], references: [id], onDelete: SetNull)

  @@index([patientId, sentAt])
  @@map("notification_log")
}

model DeviceToken {
  id        String         @id @default(uuid()) @db.Uuid
  userId    String         @map("user_id") @db.Uuid
  token     String         @unique
  platform  DevicePlatform
  lastSeenAt DateTime      @default(now()) @map("last_seen_at") @db.Timestamptz
  createdAt DateTime       @default(now()) @map("created_at") @db.Timestamptz

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("device_tokens")
}

// ──────────────────────────── Audit ────────────────────────────

model AuditLog {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String?  @map("user_id") @db.Uuid
  action     String
  entityType String?  @map("entity_type")
  entityId   String?  @map("entity_id")
  ipAddress  String?  @map("ip_address")
  metadata   Json?
  timestamp  DateTime @default(now()) @db.Timestamptz

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId, timestamp])
  @@index([action])
  @@map("audit_log")
}
```

- [x] **Step 10: Create the migration and generate the client**

Run: `npx prisma migrate dev --name init && npx prisma generate`
Expected: migration created under `prisma/migrations/<timestamp>_init/`, then `Generated Prisma Client (7.10.0) to .\src\generated\prisma`.

If migration fails on a relation error, read the message: Prisma names both sides of a relation, and `User` has several relations to the same model (`Appointment` twice, `SessionNote` twice), which is why those carry explicit `@relation("Name")` labels. Every label must match on both sides.

- [x] **Step 11: Verify the generated DDL matches the spec's conventions**

Run: `grep -E "UUID|TIMESTAMPTZ|DECIMAL\(12,2\)" prisma/migrations/*_init/migration.sql | head -20`
Expected: UUID primary keys, `TIMESTAMPTZ` timestamps, `DECIMAL(12,2)` money columns.

Run: `grep -c "CREATE TABLE" prisma/migrations/*_init/migration.sql`
Expected: `27`.

Run: `grep -c "CREATE TYPE" prisma/migrations/*_init/migration.sql`
Expected: `15`.

- [x] **Step 12: Write the schema integration test**

`tests/integration/schema.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("schema", () => {
  it("has all 27 tables in the public schema", async () => {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
    `;
    expect(Number(rows[0]!.count)).toBe(27);
  });

  it("stores appointment status enum values in snake_case", async () => {
    const rows = await prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT enumlabel FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'AppointmentStatus'
      ORDER BY e.enumsortorder
    `;
    expect(rows.map((r) => r.enumlabel)).toEqual([
      "scheduled",
      "confirmed",
      "arrived",
      "in_session",
      "completed",
      "cancelled",
      "no_show",
    ]);
  });

  it("uses timestamptz, not timestamp, for created_at", async () => {
    const rows = await prisma.$queryRaw<{ data_type: string }[]>`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'created_at'
    `;
    expect(rows[0]!.data_type).toBe("timestamp with time zone");
  });

  it("round-trips Decimal(12,2) money without float error", async () => {
    const user = await prisma.user.create({
      data: {
        name: "Schema Probe",
        phone: `+234900${Date.now().toString().slice(-7)}`,
        passwordHash: "x",
        role: "admin",
      },
    });
    const patient = await prisma.patient.create({
      data: { patientCode: `TP-P${Date.now()}`, fullName: "Probe", phone: "+2349000000000" },
    });
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-T${Date.now()}`,
        patientId: patient.id,
        totalAmount: "12345.67",
        createdById: user.id,
      },
    });
    expect(invoice.totalAmount.toString()).toBe("12345.67");

    await prisma.invoice.delete({ where: { id: invoice.id } });
    await prisma.patient.delete({ where: { id: patient.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("allows a patient with no linked user (walk-in lead)", async () => {
    const patient = await prisma.patient.create({
      data: {
        patientCode: `TP-W${Date.now()}`,
        fullName: "Walk In",
        phone: "+2348030000000",
        status: "lead",
      },
    });
    expect(patient.userId).toBeNull();
    expect(patient.status).toBe("lead");
    await prisma.patient.delete({ where: { id: patient.id } });
  });
});
```

- [x] **Step 13: Apply migrations to the test database and run the test**

```bash
DATABASE_URL="postgresql://postgres@localhost:5435/teta_physio_test" npx prisma migrate deploy
npx vitest run tests/integration/schema.test.ts
```

Expected: PASS, 5 tests. `tests/setup.ts` redirects `DATABASE_URL` to `TEST_DATABASE_URL`, so the test writes to `teta_physio_test`.

- [x] **Step 14: Commit**

```bash
git add prisma.config.ts prisma/schema.prisma prisma/migrations .gitignore tests/integration/schema.test.ts
git commit -m "feat: add complete database schema

All 27 tables and 15 enums for the full 11-sub-project scope, authored in
one pass so later slices add no core-table migrations.

Fills the PRD-11 gaps from spec 3.10: sessions, verification_codes,
login_attempts, notification_queue, device_tokens, episodes_of_care and
testimonials, plus the missing columns (patients.status, anonymised_at,
appointments.cancellation_reason, payments.notes, invoices.invoice_number
and the rest).

Conventions per spec 4.4: UUID keys, timestamptz, Decimal(12,2),
snake_case enum values."
```

---

## Task 3: Prisma singleton, password hashing, audit log

**Files:**
- Create: `src/server/db.ts`, `src/server/auth/password.ts`, `src/server/audit.ts`
- Create: `tests/unit/password.test.ts`, `tests/integration/audit.test.ts`
- Create: `tests/helpers/db.ts`

**Interfaces:**
- Consumes: `env` (Task 1), generated client (Task 2)
- Produces:
  - `src/server/db.ts` exports `prisma: PrismaClient`
  - `src/server/auth/password.ts` exports `hashPassword(plain: string): Promise<string>` and `verifyPassword(hash: string, plain: string): Promise<boolean>`
  - `src/server/audit.ts` exports `type AuditAction` (union of the string literals below) and `audit(input: AuditInput): Promise<void>` where `AuditInput = { userId?: string | null; action: AuditAction; entityType?: string; entityId?: string; ipAddress?: string | null; metadata?: Record<string, unknown> }`
  - `tests/helpers/db.ts` exports `testPrisma: PrismaClient` and `truncateAll(): Promise<void>`

- [x] **Step 1: Create the Prisma singleton**

`src/server/db.ts`:

```ts
import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/lib/env";

// Next.js hot-reloads modules in development, which would otherwise open a new
// connection pool on every edit until Postgres refuses more connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  // Prisma 7 requires a driver adapter; there is no built-in connector.
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [x] **Step 2: Create the test database helper**

`tests/helpers/db.ts`:

```ts
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// tests/setup.ts has already pointed DATABASE_URL at TEST_DATABASE_URL.
export const testPrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * Truncate every table except Prisma's migration bookkeeping. One statement with
 * CASCADE, so foreign key order does not matter.
 */
export async function truncateAll(): Promise<void> {
  const tables = await testPrisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await testPrisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}
```

- [x] **Step 3: Write the failing password test**

`tests/unit/password.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";

describe("password hashing", () => {
  it("produces an argon2id hash", async () => {
    const hash = await hashPassword("correct1horse");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("verifies the correct password", async () => {
    const hash = await hashPassword("correct1horse");
    expect(await verifyPassword(hash, "correct1horse")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct1horse");
    expect(await verifyPassword(hash, "wrong1horse")).toBe(false);
  });

  it("produces a different hash for the same input (unique salt)", async () => {
    const a = await hashPassword("correct1horse");
    const b = await hashPassword("correct1horse");
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, "correct1horse")).toBe(true);
    expect(await verifyPassword(b, "correct1horse")).toBe(true);
  });

  it("returns false rather than throwing on a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "correct1horse")).toBe(false);
  });
});
```

- [x] **Step 4: Run the test to verify it fails**

Run: `npx vitest run tests/unit/password.test.ts`
Expected: FAIL — `Failed to resolve import "@/server/auth/password"`.

- [x] **Step 5: Implement password hashing**

`src/server/auth/password.ts`:

```ts
import { hash, verify } from "@node-rs/argon2";
import { ARGON2_OPTIONS } from "@/lib/constants";

/** Never log the plaintext or the resulting hash (PRD-12 §2). */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

/**
 * Returns false for a malformed stored hash rather than throwing, so a corrupt
 * row cannot turn a failed login into a 500.
 */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}
```

- [x] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/unit/password.test.ts`
Expected: PASS, 5 tests.

- [x] **Step 7: Write the failing audit test**

`tests/integration/audit.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import { audit } from "@/server/audit";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function makeAdmin() {
  return testPrisma.user.create({
    data: {
      name: "Audit Admin",
      email: "audit.admin@example.com",
      phone: "+2348010000099",
      passwordHash: "x",
      role: "admin",
    },
  });
}

describe("audit", () => {
  it("writes an entry with actor, action and IP", async () => {
    const admin = await makeAdmin();
    await audit({
      userId: admin.id,
      action: "login_success",
      entityType: "user",
      entityId: admin.id,
      ipAddress: "127.0.0.1",
    });

    const rows = await testPrisma.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe("login_success");
    expect(rows[0]!.userId).toBe(admin.id);
    expect(rows[0]!.ipAddress).toBe("127.0.0.1");
  });

  it("accepts a null actor for a failed login on an unknown identifier", async () => {
    await audit({ userId: null, action: "login_failure", metadata: { identifier: "+2340000" } });
    const rows = await testPrisma.auditLog.findMany();
    expect(rows[0]!.userId).toBeNull();
    expect(rows[0]!.metadata).toEqual({ identifier: "+2340000" });
  });

  it("never stores a password even if one is passed in metadata", async () => {
    await audit({
      userId: null,
      action: "login_failure",
      metadata: { identifier: "+2340000", password: "secret123", token: "abc" },
    });
    const rows = await testPrisma.auditLog.findMany();
    const meta = rows[0]!.metadata as Record<string, unknown>;
    expect(meta.identifier).toBe("+2340000");
    expect(meta.password).toBeUndefined();
    expect(meta.token).toBeUndefined();
  });

  it("does not throw when the audit write fails", async () => {
    // A non-existent user id violates the FK; audit must swallow it so that a
    // logging failure can never break the action being logged.
    await expect(
      audit({ userId: "00000000-0000-0000-0000-000000000000", action: "login_success" }),
    ).resolves.toBeUndefined();
  });
});
```

- [x] **Step 8: Run the test to verify it fails**

Run: `npx vitest run tests/integration/audit.test.ts`
Expected: FAIL — `Failed to resolve import "@/server/audit"`.

- [x] **Step 9: Implement the audit log**

`src/server/audit.ts`:

```ts
import "server-only";
import { prisma } from "@/server/db";

/**
 * The closed set of auditable actions (spec §5.5). PRD-12 §3 requires role
 * changes, data exports and account lifecycle events; PRD-01 FR6 adds logins
 * and password resets.
 */
export type AuditAction =
  | "login_success"
  | "login_failure"
  | "logout"
  | "password_changed"
  | "password_reset_by_admin"
  | "role_changed"
  | "account_created"
  | "account_deactivated"
  // Reserved for later sub-projects; same call site.
  | "data_exported"
  | "patient_anonymised";

export type AuditInput = {
  userId?: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
};

/** Keys stripped from metadata so a caller cannot accidentally persist a secret. */
const REDACTED_KEYS = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "token",
  "tokenhash",
  "token_hash",
  "code",
  "secret",
]);

function scrub(metadata: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!REDACTED_KEYS.has(key.toLowerCase())) out[key] = value;
  }
  return out;
}

/**
 * Writes one audit row. Failures are swallowed deliberately: an audit write must
 * never turn a successful action into an error for the user. There is no audit
 * UI in v1 (PRD-12 §6) — this table is read directly when needed.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        ipAddress: input.ipAddress ?? null,
        metadata: input.metadata ? scrub(input.metadata) : undefined,
      },
    });
  } catch (error) {
    console.error("[audit] failed to write entry", {
      action: input.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
```

Note: `src/server/audit.ts` imports `prisma` from `src/server/db.ts`, which reads `env.DATABASE_URL`. Because `tests/setup.ts` reassigns `process.env.DATABASE_URL` before any test module loads, the singleton connects to the test database.

- [x] **Step 10: Run the test to verify it passes**

Run: `npx vitest run tests/integration/audit.test.ts`
Expected: PASS, 4 tests.

- [x] **Step 11: Commit**

```bash
git add src/server/db.ts src/server/auth/password.ts src/server/audit.ts tests/
git commit -m "feat: add prisma singleton, argon2id hashing and audit log

Prisma singleton uses the mandatory PrismaPg adapter and is cached on
globalThis so dev hot-reload does not exhaust the connection pool.

Password helpers use the OWASP argon2id parameters from spec 3.11 and
return false on a malformed hash rather than throwing.

Audit writes are best-effort and scrub secret-shaped metadata keys, so a
logging failure can never break the action being logged."
```

---

## Task 4: Session lifecycle

**Files:**
- Create: `src/server/auth/session.ts`
- Create: `tests/integration/session.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 3), `SESSION_*` constants (Task 1)
- Produces `src/server/auth/session.ts` exporting:
  - `type SessionUser = { id: string; name: string; email: string | null; phone: string; role: UserRole; mustResetPassword: boolean }`
  - `createSession(userId: string, meta?: { ipAddress?: string | null; userAgent?: string | null }): Promise<string>` — returns the raw token, never stored
  - `hashToken(raw: string): string`
  - `resolveSession(rawToken: string | undefined): Promise<SessionUser | null>` — validates, slides, and returns the user
  - `revokeSession(rawToken: string): Promise<void>`
  - `revokeAllSessions(userId: string): Promise<void>`
  - `sessionCookieOptions(): { name: string; httpOnly: true; sameSite: "lax"; secure: boolean; path: "/"; maxAge: number }`

- [x] **Step 1: Write the failing session test**

`tests/integration/session.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import {
  createSession,
  resolveSession,
  revokeSession,
  revokeAllSessions,
  hashToken,
  sessionCookieOptions,
} from "@/server/auth/session";
import { SESSION_TTL_SECONDS } from "@/lib/constants";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function makeUser() {
  return testPrisma.user.create({
    data: {
      name: "Session User",
      email: "session@example.com",
      phone: "+2348010000001",
      passwordHash: "x",
      role: "therapist",
    },
  });
}

describe("sessions", () => {
  it("returns a raw token and stores only its hash", async () => {
    const user = await makeUser();
    const raw = await createSession(user.id);

    expect(raw).toMatch(/^[0-9a-f]{64}$/);

    const rows = await testPrisma.session.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(raw);
    expect(rows[0]!.tokenHash).toBe(hashToken(raw));
  });

  it("resolves a valid token to the user", async () => {
    const user = await makeUser();
    const raw = await createSession(user.id);

    const resolved = await resolveSession(raw);
    expect(resolved?.id).toBe(user.id);
    expect(resolved?.role).toBe("therapist");
    expect(resolved?.mustResetPassword).toBe(false);
  });

  it("returns null for undefined, unknown and malformed tokens", async () => {
    expect(await resolveSession(undefined)).toBeNull();
    expect(await resolveSession("deadbeef")).toBeNull();
    expect(await resolveSession("")).toBeNull();
  });

  it("returns null for an expired session and deletes the row", async () => {
    const user = await makeUser();
    const raw = await createSession(user.id);
    await testPrisma.session.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await resolveSession(raw)).toBeNull();
    expect(await testPrisma.session.count()).toBe(0);
  });

  it("returns null for a soft-deleted or inactive user", async () => {
    const user = await makeUser();
    const raw = await createSession(user.id);

    await testPrisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
    expect(await resolveSession(raw)).toBeNull();

    await testPrisma.user.update({
      where: { id: user.id },
      data: { deletedAt: null, status: "inactive" },
    });
    expect(await resolveSession(raw)).toBeNull();
  });

  it("does not slide expiry on a freshly used session", async () => {
    const user = await makeUser();
    const raw = await createSession(user.id);
    const before = await testPrisma.session.findFirstOrThrow();

    await resolveSession(raw);

    const after = await testPrisma.session.findFirstOrThrow();
    expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());
  });

  it("slides expiry once the session has been idle beyond the threshold", async () => {
    const user = await makeUser();
    const raw = await createSession(user.id);

    const stale = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await testPrisma.session.updateMany({ data: { lastUsedAt: stale } });
    const before = await testPrisma.session.findFirstOrThrow();

    await resolveSession(raw);

    const after = await testPrisma.session.findFirstOrThrow();
    expect(after.expiresAt.getTime()).toBeGreaterThan(before.expiresAt.getTime());
    expect(after.lastUsedAt.getTime()).toBeGreaterThan(stale.getTime());
  });

  it("revokes a single session immediately", async () => {
    const user = await makeUser();
    const raw = await createSession(user.id);

    await revokeSession(raw);

    expect(await resolveSession(raw)).toBeNull();
    expect(await testPrisma.session.count()).toBe(0);
  });

  it("revokes every session for a user", async () => {
    const user = await makeUser();
    const a = await createSession(user.id);
    const b = await createSession(user.id);
    expect(await testPrisma.session.count()).toBe(2);

    await revokeAllSessions(user.id);

    expect(await resolveSession(a)).toBeNull();
    expect(await resolveSession(b)).toBeNull();
  });

  it("issues cookie options that match the spec", () => {
    const opts = sessionCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBe(SESSION_TTL_SECONDS);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/session.test.ts`
Expected: FAIL — `Failed to resolve import "@/server/auth/session"`.

- [x] **Step 3: Implement the session module**

`src/server/auth/session.ts`:

```ts
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { env } from "@/lib/env";
import {
  SESSION_SLIDE_AFTER_SECONDS,
  SESSION_TOKEN_BYTES,
  SESSION_TTL_SECONDS,
} from "@/lib/constants";

export type SessionUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  role: UserRole;
  mustResetPassword: boolean;
};

/** SHA-256 of the raw token. Only this is persisted (spec §5.2). */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function sessionCookieOptions() {
  return {
    name: env.SESSION_COOKIE_NAME,
    httpOnly: true as const,
    sameSite: "lax" as const,
    // Localhost is served over plain HTTP, so Secure would drop the cookie.
    secure: env.NODE_ENV === "production",
    path: "/" as const,
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function createSession(
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<string> {
  const raw = randomBytes(SESSION_TOKEN_BYTES).toString("hex");
  await prisma.session.create({
    data: {
      tokenHash: hashToken(raw),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });
  return raw;
}

/**
 * Validates the token, applies sliding expiry, and returns the user.
 *
 * Returns null when the token is absent, unknown, expired, or belongs to a
 * soft-deleted or deactivated user. Expired rows are deleted on read so the
 * table self-cleans without a scheduled job (spec §5.2).
 */
export async function resolveSession(rawToken: string | undefined): Promise<SessionUser | null> {
  if (!rawToken) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });
  if (!session) return null;

  const now = Date.now();

  if (session.expiresAt.getTime() <= now) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  if (session.user.deletedAt !== null || session.user.status !== "active") {
    return null;
  }

  // Only write when the session has been idle past the threshold, so a busy
  // session does not cause a database write on every request.
  if (now - session.lastUsedAt.getTime() > SESSION_SLIDE_AFTER_SECONDS * 1000) {
    await prisma.session.update({
      where: { id: session.id },
      data: {
        lastUsedAt: new Date(now),
        expiresAt: new Date(now + SESSION_TTL_SECONDS * 1000),
      },
    });
  }

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    phone: session.user.phone,
    role: session.user.role,
    mustResetPassword: session.user.mustResetPassword,
  };
}

export async function revokeSession(rawToken: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
}

/** Logout-everywhere, and the hook admin-forced logout will use. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/session.test.ts`
Expected: PASS, 10 tests.

- [x] **Step 5: Commit**

```bash
git add src/server/auth/session.ts tests/integration/session.test.ts
git commit -m "feat: add opaque session lifecycle

32-byte random tokens, SHA-256 hashed before storage, so a sessions table
leak yields nothing usable. Sliding 7-day expiry that only writes after 24h
of idle time. Revocation by row delete gives instant logout and
logout-everywhere, which a stateless JWT cannot (spec 3.4).

Resolution also rejects sessions belonging to soft-deleted or deactivated
users, and deletes expired rows on read."
```

---

## Task 5: Rate limiting

**Files:**
- Create: `src/server/auth/rate-limit.ts`
- Create: `tests/integration/rate-limit.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 3), `RATE_LIMIT_*` constants (Task 1)
- Produces `src/server/auth/rate-limit.ts` exporting:
  - `type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }`
  - `checkRateLimit(identifier: string): Promise<RateLimitResult>`
  - `recordFailedAttempt(identifier: string, ipAddress?: string | null): Promise<void>`
  - `clearAttempts(identifier: string): Promise<void>`

- [x] **Step 1: Write the failing rate limit test**

`tests/integration/rate-limit.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import { checkRateLimit, recordFailedAttempt, clearAttempts } from "@/server/auth/rate-limit";
import { RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_SECONDS } from "@/lib/constants";

const ID = "+2348010000001";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("rate limiting", () => {
  it("allows a first attempt", async () => {
    expect(await checkRateLimit(ID)).toEqual({ allowed: true });
  });

  it("allows attempts up to the limit", async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS - 1; i++) {
      await recordFailedAttempt(ID, "127.0.0.1");
    }
    expect(await checkRateLimit(ID)).toEqual({ allowed: true });
  });

  it("blocks the attempt after the limit is reached", async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
      await recordFailedAttempt(ID, "127.0.0.1");
    }
    const result = await checkRateLimit(ID);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(RATE_LIMIT_WINDOW_SECONDS);
    }
  });

  it("scopes the limit per identifier", async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
      await recordFailedAttempt(ID, "127.0.0.1");
    }
    expect((await checkRateLimit(ID)).allowed).toBe(false);
    expect((await checkRateLimit("+2348029999999")).allowed).toBe(true);
  });

  it("ignores attempts older than the window", async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
      await recordFailedAttempt(ID, "127.0.0.1");
    }
    const past = new Date(Date.now() - (RATE_LIMIT_WINDOW_SECONDS + 60) * 1000);
    await testPrisma.loginAttempt.updateMany({ data: { attemptedAt: past } });

    expect((await checkRateLimit(ID)).allowed).toBe(true);
  });

  it("clears attempts on a successful login", async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
      await recordFailedAttempt(ID, "127.0.0.1");
    }
    expect((await checkRateLimit(ID)).allowed).toBe(false);

    await clearAttempts(ID);

    expect((await checkRateLimit(ID)).allowed).toBe(true);
  });

  it("normalises the identifier so casing cannot bypass the limit", async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
      await recordFailedAttempt("Staff@Example.com", "127.0.0.1");
    }
    expect((await checkRateLimit("staff@example.com")).allowed).toBe(false);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/rate-limit.test.ts`
Expected: FAIL — `Failed to resolve import "@/server/auth/rate-limit"`.

- [x] **Step 3: Implement rate limiting**

`src/server/auth/rate-limit.ts`:

```ts
import "server-only";
import { prisma } from "@/server/db";
import { RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_SECONDS } from "@/lib/constants";

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Case-insensitive so an email in different casing cannot open a fresh bucket. */
function normalise(identifier: string): string {
  return identifier.trim().toLowerCase();
}

function windowStart(): Date {
  return new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000);
}

/**
 * Sliding-window throttle, not a lockout (PRD-01 FR5). Locking an account keyed
 * on a phone number would be a trivial denial-of-service against a real patient,
 * so the caller returns 429 with Retry-After and the account stays usable.
 */
export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  const since = windowStart();
  const attempts = await prisma.loginAttempt.findMany({
    where: { identifier: normalise(identifier), successful: false, attemptedAt: { gte: since } },
    orderBy: { attemptedAt: "asc" },
    select: { attemptedAt: true },
  });

  if (attempts.length < RATE_LIMIT_MAX_ATTEMPTS) return { allowed: true };

  // The bucket frees up when the oldest attempt in the window ages out.
  const oldest = attempts[0]!.attemptedAt.getTime();
  const freeAt = oldest + RATE_LIMIT_WINDOW_SECONDS * 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil((freeAt - Date.now()) / 1000));

  return { allowed: false, retryAfterSeconds };
}

export async function recordFailedAttempt(
  identifier: string,
  ipAddress?: string | null,
): Promise<void> {
  await prisma.loginAttempt.create({
    data: { identifier: normalise(identifier), ipAddress: ipAddress ?? null, successful: false },
  });
}

export async function clearAttempts(identifier: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { identifier: normalise(identifier) } });
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/rate-limit.test.ts`
Expected: PASS, 7 tests.

- [x] **Step 5: Commit**

```bash
git add src/server/auth/rate-limit.ts tests/integration/rate-limit.test.ts
git commit -m "feat: add login rate limiting

Sliding 15-minute window, 5 failed attempts per identifier, throttle with
Retry-After rather than account lockout. Identifiers are lowercased so
casing cannot open a fresh bucket, and a successful login clears the bucket."
```

---

## Task 6: RBAC guards and patient-access rules

**Files:**
- Create: `src/server/auth/rbac.ts`, `src/server/services/patient.ts`
- Create: `tests/integration/rbac.test.ts`

**Interfaces:**
- Consumes: `resolveSession`, `SessionUser` (Task 4), `prisma` (Task 3)
- Produces:
  - `src/server/auth/rbac.ts` exports `getCurrentUser(): Promise<SessionUser | null>`, `requireSession(): Promise<SessionUser>`, `requireRole(...roles: UserRole[]): Promise<SessionUser>`, and the error classes `UnauthenticatedError` and `ForbiddenError`
  - `src/server/services/patient.ts` exports `canViewPatient(actor: SessionUser, patientId: string): Promise<boolean>`, `getPatientForActor(actor: SessionUser, patientId: string): Promise<Patient | null>`, `listPatientsForActor(actor: SessionUser, opts?: { search?: string; skip?: number; take?: number }): Promise<Patient[]>`, `assertCanReadClinical(actor: SessionUser): void`

`requireSession` and `requireRole` throw rather than return null, so a handler that forgets to check the result still fails closed.

- [x] **Step 1: Write the failing RBAC test**

`tests/integration/rbac.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import type { SessionUser } from "@/server/auth/session";
import {
  canViewPatient,
  getPatientForActor,
  listPatientsForActor,
  assertCanReadClinical,
} from "@/server/services/patient";
import { ForbiddenError } from "@/server/auth/rbac";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

function actor(over: Partial<SessionUser> & Pick<SessionUser, "id" | "role">): SessionUser {
  return {
    name: "Actor",
    email: null,
    phone: "+2348000000000",
    mustResetPassword: false,
    ...over,
  };
}

/**
 * Builds: two therapists, a receptionist, an admin, a service, and two patients
 * where only patientA has an appointment with therapistA.
 */
async function scenario() {
  const [therapistA, therapistB, receptionist, admin] = await Promise.all([
    testPrisma.user.create({
      data: { name: "T A", email: "ta@x.com", phone: "+2348010000001", passwordHash: "x", role: "therapist" },
    }),
    testPrisma.user.create({
      data: { name: "T B", email: "tb@x.com", phone: "+2348010000002", passwordHash: "x", role: "therapist" },
    }),
    testPrisma.user.create({
      data: { name: "R", email: "r@x.com", phone: "+2348010000003", passwordHash: "x", role: "receptionist" },
    }),
    testPrisma.user.create({
      data: { name: "A", email: "a@x.com", phone: "+2348010000004", passwordHash: "x", role: "admin" },
    }),
  ]);

  await testPrisma.staffProfile.createMany({
    data: [
      { userId: therapistA.id, canViewAllPatients: false },
      { userId: therapistB.id, canViewAllPatients: false },
    ],
  });

  const patientUser = await testPrisma.user.create({
    data: { name: "P One", phone: "+2348020000001", passwordHash: "x", role: "patient" },
  });

  const patientA = await testPrisma.patient.create({
    data: {
      patientCode: "TP-00001",
      userId: patientUser.id,
      fullName: "P One",
      phone: "+2348020000001",
      status: "registered",
    },
  });
  const patientB = await testPrisma.patient.create({
    data: { patientCode: "TP-00002", fullName: "P Two", phone: "+2348020000002", status: "lead" },
  });

  const service = await testPrisma.service.create({
    data: { name: "Sports Injury Rehabilitation", slug: "sports-injury-rehabilitation" },
  });

  await testPrisma.appointment.create({
    data: {
      patientId: patientA.id,
      therapistId: therapistA.id,
      serviceId: service.id,
      scheduledStart: new Date("2026-09-01T09:00:00Z"),
      scheduledEnd: new Date("2026-09-01T09:45:00Z"),
      bookedVia: "staff",
    },
  });

  return { therapistA, therapistB, receptionist, admin, patientUser, patientA, patientB };
}

describe("patient access rules", () => {
  it("lets a therapist read a patient they have an appointment with", async () => {
    const s = await scenario();
    const a = actor({ id: s.therapistA.id, role: "therapist" });
    expect(await canViewPatient(a, s.patientA.id)).toBe(true);
    expect((await getPatientForActor(a, s.patientA.id))?.id).toBe(s.patientA.id);
  });

  it("blocks a therapist from a patient they share no appointment with", async () => {
    const s = await scenario();
    const b = actor({ id: s.therapistB.id, role: "therapist" });
    expect(await canViewPatient(b, s.patientA.id)).toBe(false);
    expect(await getPatientForActor(b, s.patientA.id)).toBeNull();
  });

  it("lets a therapist with canViewAllPatients read any patient", async () => {
    const s = await scenario();
    await testPrisma.staffProfile.update({
      where: { userId: s.therapistB.id },
      data: { canViewAllPatients: true },
    });
    const b = actor({ id: s.therapistB.id, role: "therapist" });
    expect(await canViewPatient(b, s.patientA.id)).toBe(true);
  });

  it("blocks a patient from another patient's record", async () => {
    const s = await scenario();
    const p = actor({ id: s.patientUser.id, role: "patient" });
    expect(await canViewPatient(p, s.patientA.id)).toBe(true);
    expect(await canViewPatient(p, s.patientB.id)).toBe(false);
    expect(await getPatientForActor(p, s.patientB.id)).toBeNull();
  });

  it("lets a receptionist and an admin read any patient", async () => {
    const s = await scenario();
    for (const role of ["receptionist", "admin"] as const) {
      const id = role === "receptionist" ? s.receptionist.id : s.admin.id;
      expect(await canViewPatient(actor({ id, role }), s.patientB.id)).toBe(true);
    }
  });

  it("blocks a receptionist from clinical records and allows therapist and admin", () => {
    expect(() => assertCanReadClinical(actor({ id: "x", role: "receptionist" }))).toThrow(ForbiddenError);
    expect(() => assertCanReadClinical(actor({ id: "x", role: "patient" }))).toThrow(ForbiddenError);
    expect(() => assertCanReadClinical(actor({ id: "x", role: "therapist" }))).not.toThrow();
    expect(() => assertCanReadClinical(actor({ id: "x", role: "admin" }))).not.toThrow();
  });

  it("excludes soft-deleted patients from reads and lists", async () => {
    const s = await scenario();
    const admin = actor({ id: s.admin.id, role: "admin" });
    expect(await listPatientsForActor(admin)).toHaveLength(2);

    await testPrisma.patient.update({
      where: { id: s.patientB.id },
      data: { deletedAt: new Date() },
    });

    expect(await getPatientForActor(admin, s.patientB.id)).toBeNull();
    expect(await listPatientsForActor(admin)).toHaveLength(1);
  });

  it("scopes a therapist's patient list to their own appointments", async () => {
    const s = await scenario();
    expect(await listPatientsForActor(actor({ id: s.therapistA.id, role: "therapist" }))).toHaveLength(1);
    expect(await listPatientsForActor(actor({ id: s.therapistB.id, role: "therapist" }))).toHaveLength(0);
  });

  it("scopes a patient's list to their own record", async () => {
    const s = await scenario();
    const rows = await listPatientsForActor(actor({ id: s.patientUser.id, role: "patient" }));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(s.patientA.id);
  });

  it("searches by name and phone for staff", async () => {
    const s = await scenario();
    const admin = actor({ id: s.admin.id, role: "admin" });
    expect(await listPatientsForActor(admin, { search: "P Two" })).toHaveLength(1);
    expect(await listPatientsForActor(admin, { search: "8020000001" })).toHaveLength(1);
    expect(await listPatientsForActor(admin, { search: "TP-00002" })).toHaveLength(1);
    expect(await listPatientsForActor(admin, { search: "nobody" })).toHaveLength(0);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/rbac.test.ts`
Expected: FAIL — cannot resolve `@/server/services/patient`.

- [x] **Step 3: Implement the RBAC guards**

`src/server/auth/rbac.ts`:

```ts
import "server-only";
import { cookies } from "next/headers";
import type { UserRole } from "@/generated/prisma/client";
import { resolveSession, type SessionUser } from "@/server/auth/session";
import { env } from "@/lib/env";

export class UnauthenticatedError extends Error {
  readonly status = 401;
  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "You do not have access to this resource") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * The only path to an authenticated user. Because every guard funnels through
 * here, a route handler that forgets to authorize has no user object to leak
 * data with, so the failure mode is a 401 rather than a bypass (spec §5.3).
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return resolveSession(jar.get(env.SESSION_COOKIE_NAME)?.value);
}

/** Throws rather than returning null, so an unchecked call still fails closed. */
export async function requireSession(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireSession();
  if (!roles.includes(user.role)) throw new ForbiddenError();
  return user;
}
```

- [x] **Step 4: Implement the patient service**

`src/server/services/patient.ts`:

```ts
import "server-only";
import type { Patient } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { ForbiddenError } from "@/server/auth/rbac";
import type { SessionUser } from "@/server/auth/session";

/**
 * Soft-delete filter (spec §4.4). Prisma has no global filter, so this lives
 * here and every read in this module composes it. Never inline `deletedAt` in a
 * route handler.
 */
const notDeleted = { deletedAt: null } as const;

async function therapistCanViewAll(therapistId: string): Promise<boolean> {
  const profile = await prisma.staffProfile.findUnique({
    where: { userId: therapistId },
    select: { canViewAllPatients: true },
  });
  return profile?.canViewAllPatients ?? false;
}

/**
 * PRD-01 FR3: a therapist reaches only patients they share an appointment with,
 * unless admin granted canViewAllPatients (spec §3.6).
 */
export async function canViewPatient(actor: SessionUser, patientId: string): Promise<boolean> {
  switch (actor.role) {
    case "admin":
    case "receptionist":
      return true;

    case "therapist": {
      if (await therapistCanViewAll(actor.id)) return true;
      const shared = await prisma.appointment.count({
        where: { patientId, therapistId: actor.id, deletedAt: null },
      });
      return shared > 0;
    }

    case "patient": {
      const own = await prisma.patient.findFirst({
        where: { id: patientId, userId: actor.id, ...notDeleted },
        select: { id: true },
      });
      return own !== null;
    }
  }
}

export async function getPatientForActor(
  actor: SessionUser,
  patientId: string,
): Promise<Patient | null> {
  if (!(await canViewPatient(actor, patientId))) return null;
  return prisma.patient.findFirst({ where: { id: patientId, ...notDeleted } });
}

export async function listPatientsForActor(
  actor: SessionUser,
  opts: { search?: string; skip?: number; take?: number } = {},
): Promise<Patient[]> {
  const { search, skip = 0, take = 25 } = opts;

  const searchFilter = search
    ? {
        OR: [
          { fullName: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search } },
          { patientCode: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const scope =
    actor.role === "patient"
      ? { userId: actor.id }
      : actor.role === "therapist"
        ? (await therapistCanViewAll(actor.id))
          ? {}
          : { appointments: { some: { therapistId: actor.id, deletedAt: null } } }
        : {};

  return prisma.patient.findMany({
    where: { ...notDeleted, ...scope, ...searchFilter },
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });
}

/**
 * PRD-01 and PRD-06 both make the receptionist block on clinical notes explicit,
 * not an omission. Patients never read raw clinical records either; they see
 * only patient-visible treatment plans (spec §3.3).
 */
export function assertCanReadClinical(actor: SessionUser): void {
  if (actor.role !== "therapist" && actor.role !== "admin") {
    throw new ForbiddenError("Clinical records are restricted to therapists and admins");
  }
}
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/integration/rbac.test.ts`
Expected: PASS, 10 tests.

- [x] **Step 6: Commit**

```bash
git add src/server/auth/rbac.ts src/server/services/patient.ts tests/integration/rbac.test.ts
git commit -m "feat: add RBAC guards and patient access rules

Three layers per spec 5.3: getCurrentUser is the only path to an
authenticated user, requireSession/requireRole throw so an unchecked call
fails closed, and the patient service holds the row-level rules.

Encodes the PRD-01 matrix: therapists reach only patients they share an
appointment with unless granted canViewAllPatients, patients reach only
their own record, and receptionists are blocked from clinical records.

The soft-delete filter lives in the service module and nowhere else."
```

---

## Task 7: Login, registration and password change

**Files:**
- Create: `src/lib/zod/auth.ts`, `src/server/auth/login.ts`
- Create: `tests/integration/login.test.ts`

**Interfaces:**
- Consumes: `hashPassword`/`verifyPassword` (Task 3), session functions (Task 4), rate limit (Task 5), `audit` (Task 3)
- Produces:
  - `src/lib/zod/auth.ts` exports `passwordSchema`, `phoneSchema`, `staffLoginSchema` (`{ identifier, password }`), `patientLoginSchema` (`{ phone, password }`), `patientRegisterSchema` (`{ fullName, phone, email?, password }`), `changePasswordSchema` (`{ currentPassword, newPassword }`), and the inferred types `StaffLoginInput`, `PatientLoginInput`, `PatientRegisterInput`, `ChangePasswordInput`
  - `src/server/auth/login.ts` exports `type LoginOutcome`, `login(input, meta)`, `registerPatient(input, meta)`, `changePassword(userId, input, meta)`, and `normalisePhone(raw: string): string`

`LoginOutcome` is a discriminated union:

```ts
type LoginOutcome =
  | { ok: true; token: string; user: SessionUser }
  | { ok: false; reason: "invalid_credentials" }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number }
  | { ok: false; reason: "account_inactive" };
```

- [x] **Step 1: Create the shared Zod schemas**

`src/lib/zod/auth.ts`:

```ts
import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "@/lib/constants";

/** PRD-01 §3.3: minimum 8 characters, at least one number. Nothing more. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .regex(/[0-9]/, "Password must contain at least one number");

/** Nigerian numbers, accepted as 0803..., +234803... or 234803... */
export const phoneSchema = z
  .string()
  .trim()
  .min(10, "Enter a valid phone number")
  .regex(/^(\+?234|0)[789][01]\d{8}$/, "Enter a valid Nigerian phone number");

export const staffLoginSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your email or phone number"),
  password: z.string().min(1, "Enter your password"),
});

export const patientLoginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, "Enter your password"),
});

export const patientRegisterSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name"),
  phone: phoneSchema,
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: passwordSchema,
});

export type StaffLoginInput = z.infer<typeof staffLoginSchema>;
export type PatientLoginInput = z.infer<typeof patientLoginSchema>;
export type PatientRegisterInput = z.infer<typeof patientRegisterSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
```

- [x] **Step 2: Write the failing login test**

`tests/integration/login.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import { login, registerPatient, changePassword, normalisePhone } from "@/server/auth/login";
import { hashPassword } from "@/server/auth/password";
import { resolveSession } from "@/server/auth/session";
import { RATE_LIMIT_MAX_ATTEMPTS } from "@/lib/constants";

const META = { ipAddress: "127.0.0.1", userAgent: "vitest" };

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function makeStaff(over: { status?: "active" | "inactive"; mustReset?: boolean } = {}) {
  return testPrisma.user.create({
    data: {
      name: "Dr Staff",
      email: "staff@example.com",
      phone: "+2348010000001",
      passwordHash: await hashPassword("correct1horse"),
      role: "therapist",
      status: over.status ?? "active",
      mustResetPassword: over.mustReset ?? false,
    },
  });
}

describe("normalisePhone", () => {
  it("converts every accepted format to E.164", () => {
    expect(normalisePhone("08031234567")).toBe("+2348031234567");
    expect(normalisePhone("2348031234567")).toBe("+2348031234567");
    expect(normalisePhone("+2348031234567")).toBe("+2348031234567");
    expect(normalisePhone(" 0803 123 4567 ")).toBe("+2348031234567");
  });
});

describe("login", () => {
  it("succeeds by email and returns a working session token", async () => {
    const user = await makeStaff();
    const result = await login({ identifier: "staff@example.com", password: "correct1horse" }, META);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe(user.id);
      expect(await resolveSession(result.token)).not.toBeNull();
    }
  });

  it("succeeds by phone in local format", async () => {
    await makeStaff();
    const result = await login({ identifier: "08010000001", password: "correct1horse" }, META);
    expect(result.ok).toBe(true);
  });

  it("is case-insensitive on email", async () => {
    await makeStaff();
    const result = await login({ identifier: "STAFF@example.com", password: "correct1horse" }, META);
    expect(result.ok).toBe(true);
  });

  it("rejects a wrong password with invalid_credentials", async () => {
    await makeStaff();
    const result = await login({ identifier: "staff@example.com", password: "wrong1pass" }, META);
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("returns invalid_credentials for an unknown identifier, not a distinct error", async () => {
    const result = await login({ identifier: "ghost@example.com", password: "whatever1" }, META);
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("rejects a deactivated account", async () => {
    await makeStaff({ status: "inactive" });
    const result = await login({ identifier: "staff@example.com", password: "correct1horse" }, META);
    expect(result).toEqual({ ok: false, reason: "account_inactive" });
  });

  it("rejects a soft-deleted account as invalid credentials", async () => {
    const user = await makeStaff();
    await testPrisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
    const result = await login({ identifier: "staff@example.com", password: "correct1horse" }, META);
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("throttles after too many failures and reports retryAfterSeconds", async () => {
    await makeStaff();
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
      await login({ identifier: "staff@example.com", password: "wrong1pass" }, META);
    }

    const result = await login({ identifier: "staff@example.com", password: "correct1horse" }, META);
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "rate_limited") {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    } else {
      throw new Error("expected rate_limited");
    }
  });

  it("clears the throttle bucket after a successful login", async () => {
    await makeStaff();
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS - 1; i++) {
      await login({ identifier: "staff@example.com", password: "wrong1pass" }, META);
    }
    expect((await login({ identifier: "staff@example.com", password: "correct1horse" }, META)).ok).toBe(true);
    expect(await testPrisma.loginAttempt.count()).toBe(0);
  });

  it("records lastLoginAt and audits success and failure", async () => {
    await makeStaff();
    await login({ identifier: "staff@example.com", password: "wrong1pass" }, META);
    await login({ identifier: "staff@example.com", password: "correct1horse" }, META);

    const user = await testPrisma.user.findFirstOrThrow();
    expect(user.lastLoginAt).not.toBeNull();

    const actions = (await testPrisma.auditLog.findMany()).map((a) => a.action);
    expect(actions).toContain("login_failure");
    expect(actions).toContain("login_success");
  });

  it("surfaces mustResetPassword so the caller can force a change", async () => {
    await makeStaff({ mustReset: true });
    const result = await login({ identifier: "staff@example.com", password: "correct1horse" }, META);
    expect(result.ok && result.user.mustResetPassword).toBe(true);
  });
});

describe("registerPatient", () => {
  it("creates a user, a linked patient record and a session", async () => {
    const result = await registerPatient(
      { fullName: "Ada Obi", phone: "08031234567", email: "ada@example.com", password: "newpass1" },
      META,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const user = await testPrisma.user.findFirstOrThrow({ where: { role: "patient" } });
    expect(user.phone).toBe("+2348031234567");

    const patient = await testPrisma.patient.findFirstOrThrow();
    expect(patient.userId).toBe(user.id);
    expect(patient.status).toBe("registered");
    expect(patient.patientCode).toMatch(/^TP-\d{5}$/);

    expect(await resolveSession(result.token)).not.toBeNull();
  });

  it("claims an existing walk-in lead with the same phone instead of duplicating", async () => {
    const lead = await testPrisma.patient.create({
      data: {
        patientCode: "TP-00001",
        fullName: "Ada Obi",
        phone: "+2348031234567",
        status: "lead",
      },
    });

    const result = await registerPatient(
      { fullName: "Ada Obi", phone: "08031234567", password: "newpass1" },
      META,
    );
    expect(result.ok).toBe(true);

    expect(await testPrisma.patient.count()).toBe(1);
    const claimed = await testPrisma.patient.findUniqueOrThrow({ where: { id: lead.id } });
    expect(claimed.status).toBe("registered");
    expect(claimed.userId).not.toBeNull();
  });

  it("refuses when the phone already belongs to a login", async () => {
    await registerPatient({ fullName: "Ada Obi", phone: "08031234567", password: "newpass1" }, META);
    const again = await registerPatient(
      { fullName: "Someone Else", phone: "08031234567", password: "newpass1" },
      META,
    );
    expect(again).toEqual({ ok: false, reason: "phone_taken" });
  });

  it("issues sequential patient codes", async () => {
    await registerPatient({ fullName: "One", phone: "08031234567", password: "newpass1" }, META);
    await registerPatient({ fullName: "Two", phone: "08039999999", password: "newpass1" }, META);

    const codes = (await testPrisma.patient.findMany({ orderBy: { createdAt: "asc" } })).map(
      (p) => p.patientCode,
    );
    expect(codes).toEqual(["TP-00001", "TP-00002"]);
  });
});

describe("changePassword", () => {
  it("changes the password, clears mustResetPassword and revokes other sessions", async () => {
    const user = await makeStaff({ mustReset: true });
    const first = await login({ identifier: "staff@example.com", password: "correct1horse" }, META);
    expect(first.ok).toBe(true);

    const result = await changePassword(
      user.id,
      { currentPassword: "correct1horse", newPassword: "brandnew1" },
      META,
    );
    expect(result).toEqual({ ok: true });

    const updated = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.mustResetPassword).toBe(false);

    // All sessions are revoked, so the old token must no longer resolve.
    if (first.ok) expect(await resolveSession(first.token)).toBeNull();

    expect((await login({ identifier: "staff@example.com", password: "brandnew1" }, META)).ok).toBe(true);
  });

  it("refuses when the current password is wrong", async () => {
    const user = await makeStaff();
    const result = await changePassword(
      user.id,
      { currentPassword: "notit1234", newPassword: "brandnew1" },
      META,
    );
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("audits the change", async () => {
    const user = await makeStaff();
    await changePassword(user.id, { currentPassword: "correct1horse", newPassword: "brandnew1" }, META);
    const actions = (await testPrisma.auditLog.findMany()).map((a) => a.action);
    expect(actions).toContain("password_changed");
  });
});
```

- [x] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/integration/login.test.ts`
Expected: FAIL — cannot resolve `@/server/auth/login`.

- [x] **Step 4: Implement the login module**

`src/server/auth/login.ts`:

```ts
import "server-only";
import { prisma } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, revokeAllSessions, type SessionUser } from "@/server/auth/session";
import { checkRateLimit, clearAttempts, recordFailedAttempt } from "@/server/auth/rate-limit";
import { audit } from "@/server/audit";
import type { ChangePasswordInput, PatientRegisterInput } from "@/lib/zod/auth";

export type RequestMeta = { ipAddress?: string | null; userAgent?: string | null };

export type LoginOutcome =
  | { ok: true; token: string; user: SessionUser }
  | { ok: false; reason: "invalid_credentials" }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number }
  | { ok: false; reason: "account_inactive" };

export type RegisterOutcome =
  | { ok: true; token: string; user: SessionUser }
  | { ok: false; reason: "phone_taken" };

export type ChangePasswordOutcome = { ok: true } | { ok: false; reason: "invalid_credentials" };

/** Accepts 0803…, 234803… and +234803…, always stores E.164. */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+234")) return digits;
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function toSessionUser(u: {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  role: SessionUser["role"];
  mustResetPassword: boolean;
}): SessionUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    mustResetPassword: u.mustResetPassword,
  };
}

/**
 * Staff log in with email or phone; patients with phone. One function handles
 * both, because the only difference is which column matches.
 *
 * An unknown identifier and a wrong password both return `invalid_credentials`
 * so the response cannot be used to enumerate accounts.
 */
export async function login(
  input: { identifier: string; password: string },
  meta: RequestMeta = {},
): Promise<LoginOutcome> {
  const identifier = input.identifier.trim();

  const limit = await checkRateLimit(identifier);
  if (!limit.allowed) {
    await audit({
      userId: null,
      action: "login_failure",
      ipAddress: meta.ipAddress,
      metadata: { identifier, reason: "rate_limited" },
    });
    return { ok: false, reason: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds };
  }

  const asEmail = identifier.toLowerCase();
  const asPhone = normalisePhone(identifier);

  const user = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [{ email: asEmail }, { phone: asPhone }],
    },
  });

  if (!user) {
    await recordFailedAttempt(identifier, meta.ipAddress);
    await audit({
      userId: null,
      action: "login_failure",
      ipAddress: meta.ipAddress,
      metadata: { identifier, reason: "unknown_identifier" },
    });
    return { ok: false, reason: "invalid_credentials" };
  }

  if (!(await verifyPassword(user.passwordHash, input.password))) {
    await recordFailedAttempt(identifier, meta.ipAddress);
    await audit({
      userId: user.id,
      action: "login_failure",
      entityType: "user",
      entityId: user.id,
      ipAddress: meta.ipAddress,
      metadata: { identifier, reason: "bad_password" },
    });
    return { ok: false, reason: "invalid_credentials" };
  }

  // Checked after the password so a deactivated account cannot be probed.
  if (user.status !== "active") {
    await audit({
      userId: user.id,
      action: "login_failure",
      entityType: "user",
      entityId: user.id,
      ipAddress: meta.ipAddress,
      metadata: { identifier, reason: "inactive" },
    });
    return { ok: false, reason: "account_inactive" };
  }

  await clearAttempts(identifier);

  const token = await createSession(user.id, meta);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({
    userId: user.id,
    action: "login_success",
    entityType: "user",
    entityId: user.id,
    ipAddress: meta.ipAddress,
  });

  return { ok: true, token, user: toSessionUser(user) };
}

/**
 * Generates the next TP-00001-style code (PRD-06's searchable "patient ID").
 * Runs inside the caller's transaction so two concurrent registrations cannot
 * collide on the same code.
 */
async function nextPatientCode(tx: {
  patient: { count: (args?: unknown) => Promise<number> };
}): Promise<string> {
  const count = await tx.patient.count();
  return `TP-${String(count + 1).padStart(5, "0")}`;
}

export async function registerPatient(
  input: PatientRegisterInput,
  meta: RequestMeta = {},
): Promise<RegisterOutcome> {
  const phone = normalisePhone(input.phone);
  const email = input.email && input.email.length > 0 ? input.email.trim().toLowerCase() : null;

  const existingUser = await prisma.user.findFirst({ where: { phone, deletedAt: null } });
  if (existingUser) return { ok: false, reason: "phone_taken" };

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { name: input.fullName.trim(), email, phone, passwordHash, role: "patient" },
    });

    // PRD-01 §3.1: a front-desk walk-in record is claimed rather than duplicated.
    const lead = await tx.patient.findFirst({
      where: { phone, userId: null, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });

    if (lead) {
      await tx.patient.update({
        where: { id: lead.id },
        data: {
          userId: created.id,
          status: "registered",
          fullName: input.fullName.trim(),
          email: email ?? lead.email,
        },
      });
    } else {
      await tx.patient.create({
        data: {
          patientCode: await nextPatientCode(tx),
          userId: created.id,
          fullName: input.fullName.trim(),
          phone,
          email,
          status: "registered",
        },
      });
    }

    return created;
  });

  const token = await createSession(user.id, meta);
  await audit({
    userId: user.id,
    action: "account_created",
    entityType: "user",
    entityId: user.id,
    ipAddress: meta.ipAddress,
    metadata: { role: "patient", self_registered: true },
  });

  return { ok: true, token, user: toSessionUser(user) };
}

/**
 * Revokes every session on success, including the caller's. A password change is
 * the one moment where forcing a fresh login everywhere is the correct
 * behaviour, and it is what makes a compromised session recoverable.
 */
export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  meta: RequestMeta = {},
): Promise<ChangePasswordOutcome> {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) return { ok: false, reason: "invalid_credentials" };

  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    return { ok: false, reason: "invalid_credentials" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.newPassword), mustResetPassword: false },
  });
  await revokeAllSessions(user.id);
  await audit({
    userId: user.id,
    action: "password_changed",
    entityType: "user",
    entityId: user.id,
    ipAddress: meta.ipAddress,
  });

  return { ok: true };
}
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/integration/login.test.ts`
Expected: PASS, 19 tests.

- [x] **Step 6: Commit**

```bash
git add src/lib/zod/auth.ts src/server/auth/login.ts tests/integration/login.test.ts
git commit -m "feat: add login, patient registration and password change

Login accepts email or phone, normalises Nigerian numbers to E.164, and
returns the same invalid_credentials reason for an unknown identifier as for
a wrong password so responses cannot enumerate accounts. Deactivated
accounts are only reported after the password check, for the same reason.

Registration claims an existing walk-in lead with a matching phone rather
than duplicating the patient, per PRD-01 3.1, and issues sequential
TP-00001 codes inside the transaction.

Password change revokes every session, which is what makes a compromised
session recoverable."
```

---

## Task 8: Provider interfaces and the seed

**Files:**
- Create: `src/server/providers/types.ts`, `src/server/providers/local.ts`, `src/server/providers/index.ts`
- Create: `prisma/seed.ts`
- Create: `tests/integration/seed.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 3), `hashPassword` (Task 3), constants (Task 1)
- Produces:
  - `src/server/providers/types.ts` exports the interfaces `MessageProvider` (`send(msg: OutboundMessage): Promise<SendResult>`), `StorageProvider` (`put(key, body, contentType): Promise<{ url: string }>`, `signedUrl(key, ttlSeconds): Promise<string>`), `PaymentProvider` (`createCheckout(input): Promise<{ redirectUrl: string; reference: string }>`, `verifyWebhook(rawBody, signature): boolean`)
  - `src/server/providers/index.ts` exports `messageProvider`, `storageProvider`, `paymentProvider` — the local implementations in Foundation
  - `prisma/seed.ts` is executable via `npm run db:seed` and is idempotent

Vendors are pinned as intent (Paystack, Termii, Cloudflare R2) but no live account is needed in Foundation (spec §3.9). Only the interfaces and local implementations exist here; real adapters arrive in sub-projects 7 and 8.

- [x] **Step 1: Define the provider interfaces**

`src/server/providers/types.ts`:

```ts
import type { NotificationChannel } from "@/generated/prisma/client";

export type OutboundMessage = {
  channel: NotificationChannel;
  recipient: string;
  body: string;
  subject?: string;
};

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; retryable: boolean };

/** Termii (SMS + WhatsApp) and an email provider implement this in sub-project 8. */
export interface MessageProvider {
  readonly name: string;
  send(message: OutboundMessage): Promise<SendResult>;
}

/** Cloudflare R2 implements this in sub-project 6. Objects are private by default (PRD-12 §2). */
export interface StorageProvider {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<{ url: string }>;
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export type CheckoutInput = {
  invoiceId: string;
  amountKobo: number;
  email: string;
  callbackUrl: string;
};

/** Paystack implements this in sub-project 7. */
export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: CheckoutInput): Promise<{ redirectUrl: string; reference: string }>;
  verifyWebhook(rawBody: string, signature: string): boolean;
}
```

- [x] **Step 2: Implement the local development providers**

`src/server/providers/local.ts`:

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import type {
  CheckoutInput,
  MessageProvider,
  OutboundMessage,
  PaymentProvider,
  SendResult,
  StorageProvider,
} from "./types";

/**
 * Logs instead of sending. Keeps Foundation and the whole test suite free of
 * Termii credentials and per-message cost (spec §3.9).
 */
export const localMessageProvider: MessageProvider = {
  name: "local-log",
  async send(message: OutboundMessage): Promise<SendResult> {
    console.info("[message:local]", {
      channel: message.channel,
      recipient: message.recipient,
      body: message.body.slice(0, 120),
    });
    return { ok: true, providerMessageId: `local-${randomUUID()}` };
  },
};

const UPLOAD_ROOT = path.join(process.cwd(), ".uploads");

/** Writes under .uploads/, which is gitignored. Replaced by R2 in sub-project 6. */
export const localStorageProvider: StorageProvider = {
  name: "local-fs",
  async put(key, body, _contentType) {
    const target = path.join(UPLOAD_ROOT, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    return { url: `/api/files/${key}` };
  },
  async signedUrl(key, _ttlSeconds) {
    // No signing locally; the route handler enforces access instead.
    return `/api/files/${key}`;
  },
  async delete(key) {
    await unlink(path.join(UPLOAD_ROOT, key)).catch(() => undefined);
  },
};

/** Throws rather than pretending to work, so a missing gateway is obvious. */
export const localPaymentProvider: PaymentProvider = {
  name: "local-disabled",
  async createCheckout(_input: CheckoutInput) {
    throw new Error(
      "Online payments are not configured. Record the payment manually, or enable the gateway in sub-project 7.",
    );
  },
  verifyWebhook() {
    return false;
  },
};
```

`src/server/providers/index.ts`:

```ts
import "server-only";
import { localMessageProvider, localPaymentProvider, localStorageProvider } from "./local";
import type { MessageProvider, PaymentProvider, StorageProvider } from "./types";

/**
 * Foundation wires the local implementations. Sub-projects 6, 7 and 8 swap these
 * for Cloudflare R2, Paystack and Termii by changing only this file.
 */
export const messageProvider: MessageProvider = localMessageProvider;
export const storageProvider: StorageProvider = localStorageProvider;
export const paymentProvider: PaymentProvider = localPaymentProvider;

export type { MessageProvider, PaymentProvider, StorageProvider } from "./types";
```

Append to `.gitignore`:

```
# Local file storage stand-in for object storage
.uploads/
```

- [x] **Step 3: Write the failing seed test**

`tests/integration/seed.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { testPrisma, truncateAll } from "../helpers/db";

beforeAll(async () => {
  await truncateAll();
  // Runs against TEST_DATABASE_URL, which tests/setup.ts has already put in DATABASE_URL.
  execFileSync("npx", ["tsx", "prisma/seed.ts"], {
    stdio: "pipe",
    env: { ...process.env },
    shell: true,
  });
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("seed", () => {
  it("creates one admin, two therapists and one receptionist", async () => {
    expect(await testPrisma.user.count({ where: { role: "admin" } })).toBe(1);
    expect(await testPrisma.user.count({ where: { role: "therapist" } })).toBe(2);
    expect(await testPrisma.user.count({ where: { role: "receptionist" } })).toBe(1);
  });

  it("gives both therapists a staff profile", async () => {
    expect(await testPrisma.staffProfile.count()).toBe(2);
  });

  it("creates three patients, one of them an unlinked walk-in lead", async () => {
    expect(await testPrisma.patient.count()).toBe(3);
    const leads = await testPrisma.patient.findMany({ where: { userId: null } });
    expect(leads).toHaveLength(1);
    expect(leads[0]!.status).toBe("lead");
  });

  it("creates the six PRD-02 services with durations, prices and slugs", async () => {
    const services = await testPrisma.service.findMany({ orderBy: { sortOrder: "asc" } });
    expect(services).toHaveLength(6);
    expect(services[0]!.slug).toBe("orthopedic-musculoskeletal-physiotherapy");
    for (const s of services) {
      expect(s.defaultDurationMinutes).toBeGreaterThan(0);
      expect(Number(s.defaultPrice)).toBeGreaterThan(0);
      expect(s.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("creates the clinic settings singleton with Lagos opening hours", async () => {
    const settings = await testPrisma.clinicSettings.findMany();
    expect(settings).toHaveLength(1);
    expect(settings[0]!.id).toBe(1);
    expect(settings[0]!.showClinicalToPatients).toBe(false);
    expect(settings[0]!.reminderLeadHours).toEqual([24, 2]);
    expect(Object.keys(settings[0]!.openingHours as object)).toContain("monday");
  });

  it("creates the five notification templates", async () => {
    const templates = await testPrisma.notificationTemplate.findMany();
    expect(templates).toHaveLength(5);
    const types = templates.map((t) => t.type).sort();
    expect(types).toEqual(["cancellation", "confirmation", "payment", "reminder", "reschedule"]);
    for (const t of templates) {
      expect(t.templateText).toContain("{{patient_name}}");
    }
  });

  it("forces a password reset on every seeded staff account", async () => {
    const staff = await testPrisma.user.findMany({
      where: { role: { in: ["admin", "therapist", "receptionist"] } },
    });
    expect(staff).toHaveLength(4);
    for (const s of staff) expect(s.mustResetPassword).toBe(true);
  });

  it("stores hashed passwords, never plaintext", async () => {
    const users = await testPrisma.user.findMany();
    for (const u of users) {
      expect(u.passwordHash.startsWith("$argon2id$")).toBe(true);
    }
  });

  it("is idempotent — a second run does not duplicate anything", async () => {
    execFileSync("npx", ["tsx", "prisma/seed.ts"], { stdio: "pipe", env: { ...process.env }, shell: true });

    expect(await testPrisma.user.count()).toBe(6);
    expect(await testPrisma.patient.count()).toBe(3);
    expect(await testPrisma.service.count()).toBe(6);
    expect(await testPrisma.clinicSettings.count()).toBe(1);
    expect(await testPrisma.notificationTemplate.count()).toBe(5);
    expect(await testPrisma.staffProfile.count()).toBe(2);
  });
});
```

- [x] **Step 4: Run the test to verify it fails**

Run: `npx vitest run tests/integration/seed.test.ts`
Expected: FAIL — `prisma/seed.ts` does not exist.

- [x] **Step 5: Implement the seed**

`prisma/seed.ts`:

```ts
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";

const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "changeme1";
const staffPassword = process.env.SEED_STAFF_PASSWORD ?? "changeme1";
const patientPassword = process.env.SEED_PATIENT_PASSWORD ?? "changeme1";

/** PRD-02 §2.2, with durations and prices from PRD-06 §6. */
const SERVICES = [
  { name: "Orthopedic/Musculoskeletal Physiotherapy", minutes: 45, price: "15000.00" },
  { name: "Sports Injury Rehabilitation", minutes: 60, price: "20000.00" },
  { name: "Neurological Rehabilitation", minutes: 60, price: "25000.00" },
  { name: "Pediatric Physiotherapy", minutes: 45, price: "18000.00" },
  { name: "Post-Surgery Rehabilitation", minutes: 60, price: "22000.00" },
  { name: "Pain Management", minutes: 45, price: "15000.00" },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** PRD-08 §3. Placeholders are interpolated by sub-project 8. */
const TEMPLATES = [
  {
    type: "confirmation" as const,
    channel: "whatsapp" as const,
    text: "Hello {{patient_name}}, your {{service}} appointment with {{therapist}} is confirmed for {{date}} at {{time}}. — TetaPhysio",
  },
  {
    type: "reminder" as const,
    channel: "whatsapp" as const,
    text: "Reminder: {{patient_name}}, you have a {{service}} appointment on {{date}} at {{time}}. Reply to reschedule. — TetaPhysio",
  },
  {
    type: "reschedule" as const,
    channel: "whatsapp" as const,
    text: "Hello {{patient_name}}, your appointment has been moved to {{date}} at {{time}}. — TetaPhysio",
  },
  {
    type: "cancellation" as const,
    channel: "whatsapp" as const,
    text: "Hello {{patient_name}}, your appointment on {{date}} at {{time}} has been cancelled. Call us to rebook. — TetaPhysio",
  },
  {
    type: "payment" as const,
    channel: "whatsapp" as const,
    text: "Thank you {{patient_name}}. We received {{amount}} on {{date}}. Outstanding balance: {{balance}}. — TetaPhysio",
  },
];

const OPENING_HOURS = {
  monday: { open: "08:00", close: "17:00" },
  tuesday: { open: "08:00", close: "17:00" },
  wednesday: { open: "08:00", close: "17:00" },
  thursday: { open: "08:00", close: "17:00" },
  friday: { open: "08:00", close: "17:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: null,
};

async function main() {
  // Every write is an upsert on a natural key, so re-running changes nothing.
  const [adminHash, staffHash, patientHash] = await Promise.all([
    hash(adminPassword, ARGON2_OPTIONS),
    hash(staffPassword, ARGON2_OPTIONS),
    hash(patientPassword, ARGON2_OPTIONS),
  ]);

  const admin = await prisma.user.upsert({
    where: { phone: "+2348000000001" },
    update: {},
    create: {
      name: "Clinic Admin",
      email: "admin@tetaphysio.ng",
      phone: "+2348000000001",
      passwordHash: adminHash,
      role: "admin",
      mustResetPassword: true,
    },
  });

  const therapistSeeds = [
    {
      phone: "+2348000000002",
      name: "Dr. Chidera Okonkwo",
      email: "chidera@tetaphysio.ng",
      title: "Senior Physiotherapist",
      qualifications: "BPT, MSc Sports Physiotherapy",
      bio: "Specialises in sports injury rehabilitation and post-surgical recovery.",
    },
    {
      phone: "+2348000000003",
      name: "Dr. Aisha Bello",
      email: "aisha@tetaphysio.ng",
      title: "Physiotherapist",
      qualifications: "BPT, Certificate in Neurological Rehabilitation",
      bio: "Focuses on neurological and paediatric physiotherapy.",
    },
  ];

  for (const [index, seed] of therapistSeeds.entries()) {
    const therapist = await prisma.user.upsert({
      where: { phone: seed.phone },
      update: {},
      create: {
        name: seed.name,
        email: seed.email,
        phone: seed.phone,
        passwordHash: staffHash,
        role: "therapist",
        mustResetPassword: true,
      },
    });

    await prisma.staffProfile.upsert({
      where: { userId: therapist.id },
      update: {},
      create: {
        userId: therapist.id,
        title: seed.title,
        qualifications: seed.qualifications,
        bio: seed.bio,
        publicVisible: true,
        canViewAllPatients: false,
        sortOrder: index,
      },
    });
  }

  await prisma.user.upsert({
    where: { phone: "+2348000000004" },
    update: {},
    create: {
      name: "Front Desk",
      email: "reception@tetaphysio.ng",
      phone: "+2348000000004",
      passwordHash: staffHash,
      role: "receptionist",
      mustResetPassword: true,
    },
  });

  // Two registered patients with logins, and one walk-in lead with no user row —
  // which is what exercises the nullable patients.user_id relationship.
  const patientSeeds = [
    { phone: "+2348020000001", name: "Ada Obi", email: "ada@example.com" },
    { phone: "+2348020000002", name: "Emeka Nwosu", email: "emeka@example.com" },
  ];

  for (const [index, seed] of patientSeeds.entries()) {
    const user = await prisma.user.upsert({
      where: { phone: seed.phone },
      update: {},
      create: {
        name: seed.name,
        email: seed.email,
        phone: seed.phone,
        passwordHash: patientHash,
        role: "patient",
      },
    });

    await prisma.patient.upsert({
      where: { patientCode: `TP-0000${index + 1}` },
      update: {},
      create: {
        patientCode: `TP-0000${index + 1}`,
        userId: user.id,
        fullName: seed.name,
        phone: seed.phone,
        email: seed.email,
        status: "registered",
        consentGiven: true,
        consentDate: new Date(),
      },
    });
  }

  await prisma.patient.upsert({
    where: { patientCode: "TP-00003" },
    update: {},
    create: {
      patientCode: "TP-00003",
      fullName: "Ngozi Walk-In",
      phone: "+2348020000003",
      status: "lead",
    },
  });

  for (const [index, service] of SERVICES.entries()) {
    const slug = slugify(service.name);
    await prisma.service.upsert({
      where: { slug },
      update: {},
      create: {
        name: service.name,
        slug,
        description: `${service.name} delivered by our licensed physiotherapists.`,
        defaultDurationMinutes: service.minutes,
        defaultPrice: service.price,
        active: true,
        sortOrder: index,
      },
    });
  }

  await prisma.clinicSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      clinicName: "TetaPhysio",
      tagline: "Movement is medicine",
      contactPhone: "+2348000000000",
      contactWhatsapp: "+2348000000000",
      contactEmail: "hello@tetaphysio.ng",
      address: "Lagos, Nigeria",
      openingHours: OPENING_HOURS,
      bookingLeadTimeHours: 0,
      rescheduleCutoffHours: 2,
      cancellationCutoffHours: 2,
      reminderLeadHours: [24, 2],
      showClinicalToPatients: false,
      onlinePaymentsEnabled: false,
      receptionistSeesRevenue: false,
      therapistSeesOwnStats: true,
    },
  });

  for (const template of TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: { type_channel: { type: template.type, channel: template.channel } },
      update: {},
      create: {
        type: template.type,
        channel: template.channel,
        templateText: template.text,
        active: true,
      },
    });
  }

  console.info("Seed complete.");
  console.info(`  Admin login: admin@tetaphysio.ng (password from SEED_ADMIN_PASSWORD)`);
  console.info(`  Admin id: ${admin.id}`);
  console.info("  All staff accounts must change password on first login.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [x] **Step 6: Run the seed against the dev database**

Run: `npm run db:seed`
Expected: `Seed complete.` and the admin login details.

Run it a second time. Expected: same output, no unique-constraint error.

- [x] **Step 7: Run the seed test**

Run: `npx vitest run tests/integration/seed.test.ts`
Expected: PASS, 9 tests.

- [x] **Step 8: Commit**

```bash
git add src/server/providers prisma/seed.ts tests/integration/seed.test.ts .gitignore
git commit -m "feat: add provider interfaces and idempotent seed

Payment, message and storage providers sit behind interfaces with local
implementations, so Foundation and the test suite need no Termii, Paystack
or R2 credentials. Swapping in real vendors touches only providers/index.ts.

Seed creates 4 staff, 3 patients (one an unlinked walk-in lead), the 6
PRD-02 services, the clinic settings singleton with Lagos hours, and the 5
notification templates. Every write is an upsert on a natural key, so
re-running is safe. Staff accounts are seeded with mustResetPassword."
```

---

## Task 9: Auth API routes and middleware

**Files:**
- Create: `src/app/api/auth/login/route.ts`, `src/app/api/auth/portal-login/route.ts`, `src/app/api/auth/register/route.ts`, `src/app/api/auth/logout/route.ts`, `src/app/api/auth/change-password/route.ts`, `src/app/api/auth/me/route.ts`
- Create: `src/server/http.ts`, `src/middleware.ts`

**Interfaces:**
- Consumes: `login`/`registerPatient`/`changePassword` (Task 7), session helpers (Task 4), `requireSession` (Task 6), Zod schemas (Task 7)
- Produces:
  - `src/server/http.ts` exports `jsonError(status: number, message: string, extra?: Record<string, unknown>): Response`, `requestMeta(req: Request): RequestMeta`, `handleAuthError(error: unknown): Response`
  - Endpoints: `POST /api/auth/login`, `POST /api/auth/portal-login`, `POST /api/auth/register`, `POST /api/auth/logout`, `POST /api/auth/change-password`, `GET /api/auth/me`

- [x] **Step 1: Create the HTTP helpers**

`src/server/http.ts`:

```ts
import "server-only";
import { NextResponse } from "next/server";
import { ForbiddenError, UnauthenticatedError } from "@/server/auth/rbac";
import type { RequestMeta } from "@/server/auth/login";

export function jsonError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/**
 * Trusts x-forwarded-for only for its first hop, which is what a single reverse
 * proxy in front of the app produces.
 */
export function requestMeta(req: Request): RequestMeta {
  const forwarded = req.headers.get("x-forwarded-for");
  return {
    ipAddress: forwarded?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent"),
  };
}

/** Maps guard errors to responses so every handler can use one catch. */
export function handleAuthError(error: unknown): NextResponse {
  if (error instanceof UnauthenticatedError) return jsonError(401, error.message);
  if (error instanceof ForbiddenError) return jsonError(403, error.message);
  console.error("[api] unhandled error", error);
  return jsonError(500, "Something went wrong");
}
```

- [x] **Step 2: Implement the staff login route**

`src/app/api/auth/login/route.ts`:

```ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { login } from "@/server/auth/login";
import { sessionCookieOptions } from "@/server/auth/session";
import { staffLoginSchema } from "@/lib/zod/auth";
import { jsonError, requestMeta } from "@/server/http";

export async function POST(req: Request) {
  const parsed = staffLoginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "Enter your email or phone and your password");
  }

  const result = await login(parsed.data, requestMeta(req));

  if (!result.ok) {
    if (result.reason === "rate_limited") {
      return NextResponse.json(
        { error: "Too many failed attempts. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
      );
    }
    if (result.reason === "account_inactive") {
      return jsonError(403, "This account has been deactivated. Contact your administrator.");
    }
    return jsonError(401, "Incorrect login details");
  }

  const { name, ...cookieOptions } = sessionCookieOptions();
  (await cookies()).set(name, result.token, cookieOptions);

  return NextResponse.json({
    user: {
      id: result.user.id,
      name: result.user.name,
      role: result.user.role,
      mustResetPassword: result.user.mustResetPassword,
    },
    redirectTo: result.user.mustResetPassword ? "/reset-password" : "/staff",
  });
}
```

- [x] **Step 3: Implement the patient login route**

`src/app/api/auth/portal-login/route.ts`:

```ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { login } from "@/server/auth/login";
import { sessionCookieOptions } from "@/server/auth/session";
import { patientLoginSchema } from "@/lib/zod/auth";
import { jsonError, requestMeta } from "@/server/http";

export async function POST(req: Request) {
  const parsed = patientLoginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Enter your phone number and password");
  }

  const result = await login(
    { identifier: parsed.data.phone, password: parsed.data.password },
    requestMeta(req),
  );

  if (!result.ok) {
    if (result.reason === "rate_limited") {
      return NextResponse.json(
        { error: "Too many failed attempts. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
      );
    }
    if (result.reason === "account_inactive") {
      return jsonError(403, "This account is not active. Please call the clinic.");
    }
    return jsonError(401, "Incorrect phone number or password");
  }

  // A staff member must not enter through the patient portal.
  if (result.user.role !== "patient") {
    return jsonError(403, "Please use the staff login page");
  }

  const { name, ...cookieOptions } = sessionCookieOptions();
  (await cookies()).set(name, result.token, cookieOptions);

  return NextResponse.json({
    user: { id: result.user.id, name: result.user.name, role: result.user.role },
    redirectTo: "/portal",
  });
}
```

- [x] **Step 4: Implement register, logout, change-password and me**

`src/app/api/auth/register/route.ts`:

```ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { registerPatient } from "@/server/auth/login";
import { sessionCookieOptions } from "@/server/auth/session";
import { patientRegisterSchema } from "@/lib/zod/auth";
import { jsonError, requestMeta } from "@/server/http";

export async function POST(req: Request) {
  const parsed = patientRegisterSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Check the details you entered");
  }

  const result = await registerPatient(parsed.data, requestMeta(req));

  if (!result.ok) {
    return jsonError(409, "An account already exists for that phone number. Try logging in.");
  }

  const { name, ...cookieOptions } = sessionCookieOptions();
  (await cookies()).set(name, result.token, cookieOptions);

  return NextResponse.json({ user: { id: result.user.id, name: result.user.name }, redirectTo: "/portal" });
}
```

`src/app/api/auth/logout/route.ts`:

```ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { revokeSession, sessionCookieOptions } from "@/server/auth/session";
import { getCurrentUser } from "@/server/auth/rbac";
import { audit } from "@/server/audit";
import { requestMeta } from "@/server/http";
import { env } from "@/lib/env";

export async function POST(req: Request) {
  const jar = await cookies();
  const token = jar.get(env.SESSION_COOKIE_NAME)?.value;
  const user = await getCurrentUser();

  if (token) await revokeSession(token);
  if (user) {
    await audit({
      userId: user.id,
      action: "logout",
      entityType: "user",
      entityId: user.id,
      ipAddress: requestMeta(req).ipAddress,
    });
  }

  const { name, ...cookieOptions } = sessionCookieOptions();
  jar.set(name, "", { ...cookieOptions, maxAge: 0 });

  return NextResponse.json({ ok: true, redirectTo: "/" });
}
```

`src/app/api/auth/change-password/route.ts`:

```ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { changePassword } from "@/server/auth/login";
import { createSession, sessionCookieOptions } from "@/server/auth/session";
import { requireSession } from "@/server/auth/rbac";
import { changePasswordSchema } from "@/lib/zod/auth";
import { handleAuthError, jsonError, requestMeta } from "@/server/http";

export async function POST(req: Request) {
  try {
    const user = await requireSession();

    const parsed = changePasswordSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(400, parsed.error.issues[0]?.message ?? "Check the details you entered");
    }

    const meta = requestMeta(req);
    const result = await changePassword(user.id, parsed.data, meta);
    if (!result.ok) return jsonError(400, "Your current password is incorrect");

    // changePassword revoked every session, including this one. Issue a fresh
    // session so the user is not bounced to the login screen on success.
    const token = await createSession(user.id, meta);
    const { name, ...cookieOptions } = sessionCookieOptions();
    (await cookies()).set(name, token, cookieOptions);

    return NextResponse.json({
      ok: true,
      redirectTo: user.role === "patient" ? "/portal" : "/staff",
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
```

`src/app/api/auth/me/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/rbac";
import { handleAuthError } from "@/server/http";

export async function GET() {
  try {
    const user = await requireSession();
    return NextResponse.json({ user });
  } catch (error) {
    return handleAuthError(error);
  }
}
```

- [x] **Step 5: Implement middleware**

`src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap redirect for requests with no session cookie. It deliberately does NOT
 * authorize: middleware runs on the edge runtime and cannot reach Prisma, so the
 * real decision happens in requireSession/requireRole (spec §5.3). A forged
 * cookie gets past this and is then rejected server-side.
 */
const COOKIE = process.env.SESSION_COOKIE_NAME ?? "tp_session";

export function middleware(req: NextRequest) {
  if (req.cookies.has(COOKIE)) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  const loginPath = pathname.startsWith("/portal") ? "/portal/login" : "/login";
  const url = new URL(loginPath, req.url);
  url.searchParams.set("next", `${pathname}${search}`);

  return NextResponse.redirect(url);
}

/**
 * `/portal/login` and `/portal/register` must NOT match, or an unauthenticated
 * visitor would be redirected to the page they are already on. The negative
 * lookahead excludes them.
 */
export const config = {
  matcher: ["/staff/:path*", "/portal", "/portal/((?!login|register).*)", "/reset-password"],
};
```

- [x] **Step 6: Verify the build compiles**

Run: `npm run typecheck && npx next build`
Expected: both pass. The build output lists the six `/api/auth/*` routes as dynamic (`ƒ`) and shows `ƒ Proxy (Middleware)`.

- [x] **Step 7: Commit**

```bash
git add src/server/http.ts src/middleware.ts src/app/api
git commit -m "feat: add auth API routes and middleware

Six endpoints: staff login, portal login, register, logout, change-password
and me. Rate-limited responses carry Retry-After. Portal login rejects staff
roles so the two entry points stay separate.

change-password issues a fresh session after revoking all of them, so a
successful change does not bounce the user to the login screen.

Middleware only redirects requests with no cookie; it never authorizes,
because the edge runtime cannot reach Prisma. A forged cookie passes
middleware and is rejected by requireSession server-side."
```

---

## Task 10: Auth screens

**Files:**
- Create: `src/components/AuthForm.tsx`, `src/components/FormField.tsx`
- Create: `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/portal/login/page.tsx`, `src/app/(auth)/portal/register/page.tsx`, `src/app/(auth)/reset-password/page.tsx`

**Interfaces:**
- Consumes: the auth endpoints (Task 9)
- Produces:
  - `src/components/FormField.tsx` exports `FormField({ label, name, type, autoComplete, required, hint }: FormFieldProps)`
  - `src/components/AuthForm.tsx` exports `AuthForm({ title, subtitle, endpoint, fields, submitLabel, footer }: AuthFormProps)` where `fields: FormFieldProps[]` and `endpoint: string`

One client component drives all four screens: each posts a flat JSON body to an endpoint and follows `redirectTo`. No design system yet (spec §6) — plain Tailwind.

- [x] **Step 1: Create the form field component**

`src/components/FormField.tsx`:

```tsx
export type FormFieldProps = {
  label: string;
  name: string;
  type?: "text" | "email" | "tel" | "password";
  autoComplete?: string;
  required?: boolean;
  hint?: string;
};

export function FormField({
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  hint,
}: FormFieldProps) {
  const hintId = hint ? `${name}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1">
      {/* Explicit label/input association, not a placeholder — placeholders
          disappear on focus and are not announced reliably. */}
      <label htmlFor={name} className="text-sm font-medium text-gray-800">
        {label}
        {!required && <span className="ml-1 font-normal text-gray-500">(optional)</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        aria-describedby={hintId}
        className="rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
      {hint && (
        <p id={hintId} className="text-xs text-gray-500">
          {hint}
        </p>
      )}
    </div>
  );
}
```

- [x] **Step 2: Create the shared auth form**

`src/components/AuthForm.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { FormField, type FormFieldProps } from "./FormField";

export type AuthFormProps = {
  title: string;
  subtitle?: string;
  endpoint: string;
  fields: FormFieldProps[];
  submitLabel: string;
  footer?: ReactNode;
};

export function AuthForm({ title, subtitle, endpoint, fields, submitLabel, footer }: AuthFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const body = Object.fromEntries(new FormData(event.currentTarget));

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string; redirectTo?: string };

      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      // Server decides the destination, so the client cannot land somewhere it
      // is not allowed to be.
      router.push(data.redirectTo ?? "/");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        {fields.map((field) => (
          <FormField key={field.name} {...field} />
        ))}

        {/* aria-live so a screen reader announces the error without a focus move. */}
        <div aria-live="polite" role="status">
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-700 px-4 py-2 text-base font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-60"
        >
          {submitting ? "Please wait…" : submitLabel}
        </button>
      </form>

      {footer && <div className="mt-4 text-sm text-gray-600">{footer}</div>}
    </div>
  );
}
```

- [x] **Step 3: Create the auth route-group layout**

`src/app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      {children}
    </div>
  );
}
```

- [x] **Step 4: Create the four screens**

`src/app/(auth)/login/page.tsx`:

```tsx
import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Staff login — TetaPhysio" };

export default function StaffLoginPage() {
  return (
    <AuthForm
      title="Staff login"
      subtitle="For therapists, front desk and administrators."
      endpoint="/api/auth/login"
      submitLabel="Log in"
      fields={[
        {
          label: "Email or phone number",
          name: "identifier",
          type: "text",
          autoComplete: "username",
        },
        { label: "Password", name: "password", type: "password", autoComplete: "current-password" },
      ]}
      footer={
        <p>
          Are you a patient?{" "}
          <Link className="text-blue-700 underline" href="/portal/login">
            Use the patient portal
          </Link>
        </p>
      }
    />
  );
}
```

`src/app/(auth)/portal/login/page.tsx`:

```tsx
import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Patient login — TetaPhysio" };

export default function PortalLoginPage() {
  return (
    <AuthForm
      title="Patient login"
      subtitle="Manage your appointments and payments."
      endpoint="/api/auth/portal-login"
      submitLabel="Log in"
      fields={[
        {
          label: "Phone number",
          name: "phone",
          type: "tel",
          autoComplete: "tel",
          hint: "The number you gave the clinic, e.g. 08031234567",
        },
        { label: "Password", name: "password", type: "password", autoComplete: "current-password" },
      ]}
      footer={
        <p>
          New here?{" "}
          <Link className="text-blue-700 underline" href="/portal/register">
            Create an account
          </Link>
        </p>
      }
    />
  );
}
```

`src/app/(auth)/portal/register/page.tsx`:

```tsx
import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Create an account — TetaPhysio" };

export default function PortalRegisterPage() {
  return (
    <AuthForm
      title="Create your account"
      subtitle="If you have visited the clinic before, use the same phone number and we will link your records."
      endpoint="/api/auth/register"
      submitLabel="Create account"
      fields={[
        { label: "Full name", name: "fullName", type: "text", autoComplete: "name" },
        {
          label: "Phone number",
          name: "phone",
          type: "tel",
          autoComplete: "tel",
          hint: "e.g. 08031234567",
        },
        { label: "Email", name: "email", type: "email", autoComplete: "email", required: false },
        {
          label: "Password",
          name: "password",
          type: "password",
          autoComplete: "new-password",
          hint: "At least 8 characters, including a number",
        },
      ]}
      footer={
        <p>
          Already have an account?{" "}
          <Link className="text-blue-700 underline" href="/portal/login">
            Log in
          </Link>
        </p>
      }
    />
  );
}
```

`src/app/(auth)/reset-password/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/server/auth/rbac";

export const metadata = { title: "Change your password — TetaPhysio" };

export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AuthForm
      title="Choose a new password"
      subtitle={
        user.mustResetPassword
          ? "Your account was created with a temporary password. Set your own to continue."
          : "Update the password on your account."
      }
      endpoint="/api/auth/change-password"
      submitLabel="Save password"
      fields={[
        {
          label: "Current password",
          name: "currentPassword",
          type: "password",
          autoComplete: "current-password",
        },
        {
          label: "New password",
          name: "newPassword",
          type: "password",
          autoComplete: "new-password",
          hint: "At least 8 characters, including a number",
        },
      ]}
    />
  );
}
```

- [x] **Step 5: Verify the build**

Run: `npm run typecheck && npm run lint && npx next build`
Expected: all pass; `/login`, `/portal/login`, `/portal/register` and `/reset-password` appear in the route list.

- [x] **Step 6: Manually confirm the screens render**

Run: `npm run dev`, then open `http://localhost:3000/login` and `http://localhost:3000/portal/register`.
Expected: labelled fields, visible focus rings, and a submit button. Submitting empty fields shows a server error message in the live region rather than a blank failure.

Stop the dev server.

- [x] **Step 7: Commit**

```bash
git add src/components src/app/\(auth\)
git commit -m "feat: add staff login, patient login, registration and reset screens

One client component drives all four forms: posts flat JSON, reads the
server-supplied redirectTo, and announces errors in an aria-live region.
Real labels rather than placeholders, and visible focus states.

The server decides the post-login destination, so the client cannot navigate
somewhere it is not allowed to be."
```

---

## Task 11: Role-aware shells and forced password reset

**Files:**
- Create: `src/lib/nav.ts`, `src/components/NavShell.tsx`, `src/components/LogoutButton.tsx`
- Create: `src/app/(staff)/layout.tsx`, `src/app/(staff)/staff/page.tsx`, `src/app/(portal)/layout.tsx`, `src/app/(portal)/portal/page.tsx`
- Create: `tests/unit/nav.test.ts`

**Interfaces:**
- Consumes: `requireSession`, `requireRole` (Task 6)
- Produces:
  - `src/components/NavShell.tsx` exports `NavShell({ user, links, children }: { user: SessionUser; links: NavLink[]; children: ReactNode })` and `type NavLink = { href: string; label: string; available: boolean; note?: string }`
  - `src/lib/nav.ts` exports `staffLinksFor(role: UserRole): NavLink[]` and `portalLinks(): NavLink[]`

Navigation is derived from role in a pure function, so it can be unit-tested without rendering.

- [x] **Step 1: Write the failing navigation test**

`tests/integration/nav.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { staffLinksFor, portalLinks } from "@/lib/nav";

describe("staff navigation", () => {
  it("gives a therapist schedule and patients but no staff or settings", () => {
    const labels = staffLinksFor("therapist").map((l) => l.label);
    expect(labels).toContain("My schedule");
    expect(labels).toContain("My patients");
    expect(labels).not.toContain("Staff");
    expect(labels).not.toContain("Clinic settings");
    expect(labels).not.toContain("Reports");
  });

  it("gives a receptionist appointments, patients and payments but no clinical notes", () => {
    const labels = staffLinksFor("receptionist").map((l) => l.label);
    expect(labels).toContain("Appointments");
    expect(labels).toContain("Patients");
    expect(labels).toContain("Payments");
    expect(labels).not.toContain("Clinical notes");
    expect(labels).not.toContain("Staff");
  });

  it("gives an admin everything", () => {
    const labels = staffLinksFor("admin").map((l) => l.label);
    for (const expected of [
      "Dashboard",
      "Appointments",
      "Patients",
      "Payments",
      "Staff",
      "Reports",
      "Clinic settings",
    ]) {
      expect(labels).toContain(expected);
    }
  });

  it("gives a patient role no staff navigation at all", () => {
    expect(staffLinksFor("patient")).toHaveLength(0);
  });

  it("marks links whose sub-project has not shipped as unavailable with a note", () => {
    const links = staffLinksFor("admin");
    const unavailable = links.filter((l) => !l.available);
    expect(unavailable.length).toBeGreaterThan(0);
    for (const link of unavailable) {
      expect(link.note).toBeTruthy();
    }
  });

  it("gives the patient portal its four sections", () => {
    const labels = portalLinks().map((l) => l.label);
    expect(labels).toEqual(["Dashboard", "Appointments", "My profile", "Payments"]);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/nav.test.ts`
Expected: FAIL — cannot resolve `@/lib/nav`.

- [x] **Step 3: Implement the navigation model**

`src/lib/nav.ts`:

```ts
import type { UserRole } from "@/generated/prisma/client";

export type NavLink = {
  href: string;
  label: string;
  /** False until the sub-project that builds the destination has shipped. */
  available: boolean;
  note?: string;
};

/**
 * Mirrors the PRD-01 permission matrix. This is navigation only — it is not a
 * security boundary. Hiding a link does not protect the route; requireRole does
 * (spec §5.3).
 */
export function staffLinksFor(role: UserRole): NavLink[] {
  if (role === "patient") return [];

  const dashboard: NavLink = { href: "/staff", label: "Dashboard", available: true };

  const therapist: NavLink[] = [
    { href: "/staff/schedule", label: "My schedule", available: false, note: "Sub-project 3" },
    { href: "/staff/patients", label: "My patients", available: false, note: "Sub-project 6" },
  ];

  const reception: NavLink[] = [
    { href: "/staff/appointments", label: "Appointments", available: false, note: "Sub-project 3" },
    { href: "/staff/patients", label: "Patients", available: false, note: "Sub-project 10" },
    { href: "/staff/payments", label: "Payments", available: false, note: "Sub-project 7" },
  ];

  const adminOnly: NavLink[] = [
    { href: "/staff/staff", label: "Staff", available: false, note: "Sub-project 10" },
    { href: "/staff/reports", label: "Reports", available: false, note: "Sub-project 9" },
    { href: "/staff/settings", label: "Clinic settings", available: false, note: "Sub-project 2" },
  ];

  switch (role) {
    case "therapist":
      return [dashboard, ...therapist];
    case "receptionist":
      return [dashboard, ...reception];
    case "admin":
      return [dashboard, ...reception, ...adminOnly];
  }
}

export function portalLinks(): NavLink[] {
  return [
    { href: "/portal", label: "Dashboard", available: true },
    { href: "/portal/appointments", label: "Appointments", available: false, note: "Sub-project 5" },
    { href: "/portal/profile", label: "My profile", available: false, note: "Sub-project 5" },
    { href: "/portal/payments", label: "Payments", available: false, note: "Sub-project 7" },
  ];
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/nav.test.ts`
Expected: PASS, 6 tests.

- [x] **Step 5: Create the logout button and the shell component**

Logout must be a client component: the endpoint returns JSON with `redirectTo`, which a plain HTML form POST cannot follow.

`src/components/LogoutButton.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className="text-sm text-blue-700 underline hover:text-blue-900 disabled:opacity-60"
    >
      {busy ? "Logging out…" : "Log out"}
    </button>
  );
}
```

`src/components/NavShell.tsx`:

```tsx
import Link from "next/link";
import type { NavLink } from "@/lib/nav";
import type { SessionUser } from "@/server/auth/session";
import { LogoutButton } from "./LogoutButton";

const ROLE_LABELS: Record<SessionUser["role"], string> = {
  admin: "Administrator",
  therapist: "Therapist",
  receptionist: "Front desk",
  patient: "Patient",
};

export function NavShell({
  user,
  links,
  children,
}: {
  user: SessionUser;
  links: NavLink[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-gray-200 bg-white md:w-64 md:border-b-0 md:border-r">
        <div className="p-4">
          <p className="text-lg font-semibold text-gray-900">TetaPhysio</p>
          <p className="mt-1 truncate text-sm text-gray-700">{user.name}</p>
          <p className="text-xs text-gray-500">{ROLE_LABELS[user.role]}</p>
        </div>

        <nav aria-label="Main navigation" className="px-2 pb-4">
          <ul className="flex flex-col gap-1">
            {links.map((link) =>
              link.available ? (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="block rounded-md px-3 py-2 text-sm text-gray-800 hover:bg-gray-100"
                  >
                    {link.label}
                  </Link>
                </li>
              ) : (
                <li key={link.href}>
                  {/* Rendered but disabled, so the shape of the finished app is
                      visible without pretending the page exists. */}
                  <span
                    aria-disabled="true"
                    title={`Coming in ${link.note}`}
                    className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-gray-400"
                  >
                    {link.label}
                    <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase">
                      soon
                    </span>
                  </span>
                </li>
              ),
            )}
          </ul>
        </nav>

        <div className="border-t border-gray-200 p-4">
          <LogoutButton />
        </div>
      </aside>

      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

- [x] **Step 6: Create the two shells and their dashboards**

`src/app/(staff)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { NavShell } from "@/components/NavShell";
import { getCurrentUser } from "@/server/auth/rbac";
import { staffLinksFor } from "@/lib/nav";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) redirect("/login");
  // A patient reaching a staff route is sent to their own portal, not shown a 403.
  if (user.role === "patient") redirect("/portal");
  // Forced change before anything else renders (PRD-01 §3.2).
  if (user.mustResetPassword) redirect("/reset-password");

  return (
    <NavShell user={user} links={staffLinksFor(user.role)}>
      {children}
    </NavShell>
  );
}
```

`src/app/(staff)/staff/page.tsx`:

```tsx
import { requireRole } from "@/server/auth/rbac";

export const metadata = { title: "Dashboard — TetaPhysio" };

export default async function StaffDashboardPage() {
  // Redundant with the layout guard by design: a route must not depend on a
  // layout for its authorization.
  const user = await requireRole("admin", "therapist", "receptionist");

  return (
    <section>
      <h1 className="text-2xl font-semibold text-gray-900">Welcome, {user.name}</h1>
      <p className="mt-2 max-w-prose text-gray-700">
        Signed in as <strong>{user.role}</strong>. The operational screens arrive with their
        sub-projects — appointments and the calendar in sub-project 3, clinical documentation in
        sub-project 6, billing in sub-project 7.
      </p>
    </section>
  );
}
```

`src/app/(portal)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { NavShell } from "@/components/NavShell";
import { getCurrentUser } from "@/server/auth/rbac";
import { portalLinks } from "@/lib/nav";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) redirect("/portal/login");
  if (user.role !== "patient") redirect("/staff");
  if (user.mustResetPassword) redirect("/reset-password");

  return (
    <NavShell user={user} links={portalLinks()}>
      {children}
    </NavShell>
  );
}
```

`src/app/(portal)/portal/page.tsx`:

```tsx
import { requireRole } from "@/server/auth/rbac";

export const metadata = { title: "My dashboard — TetaPhysio" };

export default async function PortalDashboardPage() {
  const user = await requireRole("patient");

  return (
    <section>
      <h1 className="text-2xl font-semibold text-gray-900">Hello, {user.name}</h1>
      <p className="mt-2 max-w-prose text-gray-700">
        Your appointments, treatment information and payments appear here once those sections are
        built (sub-projects 5 and 7).
      </p>
    </section>
  );
}
```

- [x] **Step 7: Verify the build and run the whole suite**

Run: `npm run typecheck && npm run lint && npx next build && npm test`
Expected: build passes; every test file passes.

- [x] **Step 8: Commit**

```bash
git add src/lib/nav.ts src/components src/app/\(staff\) src/app/\(portal\)
git commit -m "feat: add role-aware staff and portal shells

Navigation is a pure function of role, unit-tested against the PRD-01
matrix, so a therapist never sees Staff or Clinic settings. Unbuilt
destinations render disabled with the sub-project that delivers them, which
shows the shape of the finished app without pretending pages exist.

Both layouts force a password change before anything else renders, and each
page re-checks its own role rather than trusting the layout."
```

---

## Task 12: End-to-end login journeys

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/login.spec.ts`
- Modify: `.gitignore` (Playwright artefacts already covered by Task 1)

**Interfaces:**
- Consumes: every prior task — this is the acceptance gate
- Produces: no application code

Playwright runs against a real built server and the seeded dev database, so this catches integration failures the Vitest suite cannot see (cookie attributes, middleware redirects, hydration errors).

- [x] **Step 1: Install the browser**

Run: `npx playwright install chromium`
Expected: downloads Chromium. Only Chromium is needed; the target audience is Android Chrome, and cross-browser coverage is not what this suite is for.

- [x] **Step 2: Create the Playwright config**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Serial: every test shares one seeded database, so parallel runs would race.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // The primary target is a mid-range Android phone (PRD-04 FR4).
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npx next start -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [x] **Step 3: Write the E2E suite**

`tests/e2e/login.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

// Matches prisma/seed.ts. SEED_* env vars default to "changeme1".
const STAFF_PASSWORD = process.env.SEED_STAFF_PASSWORD ?? "changeme1";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme1";
const PATIENT_PASSWORD = process.env.SEED_PATIENT_PASSWORD ?? "changeme1";

async function staffLogin(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email or phone number").fill(identifier);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test.describe("staff authentication", () => {
  test("admin logs in, is forced to change password, then reaches the dashboard", async ({ page }) => {
    await staffLogin(page, "admin@tetaphysio.ng", ADMIN_PASSWORD);

    // Seeded staff carry mustResetPassword, so the change screen comes first.
    await expect(page).toHaveURL(/\/reset-password/);
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();

    await page.getByLabel("Current password").fill(ADMIN_PASSWORD);
    await page.getByLabel("New password").fill("AdminNew1pass");
    await page.getByRole("button", { name: "Save password" }).click();

    await expect(page).toHaveURL(/\/staff$/);
    await expect(page.getByRole("heading", { name: /Welcome, Clinic Admin/ })).toBeVisible();
  });

  test("admin sees every navigation section", async ({ page }) => {
    await staffLogin(page, "admin@tetaphysio.ng", "AdminNew1pass");
    await expect(page).toHaveURL(/\/staff$/);

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    for (const label of ["Dashboard", "Appointments", "Patients", "Payments", "Staff", "Reports", "Clinic settings"]) {
      await expect(nav.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("therapist sees only their own sections", async ({ page }) => {
    await staffLogin(page, "chidera@tetaphysio.ng", STAFF_PASSWORD);
    await page.getByLabel("Current password").fill(STAFF_PASSWORD);
    await page.getByLabel("New password").fill("TherapistNew1");
    await page.getByRole("button", { name: "Save password" }).click();

    await expect(page).toHaveURL(/\/staff$/);

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByText("My schedule", { exact: true })).toBeVisible();
    await expect(nav.getByText("My patients", { exact: true })).toBeVisible();
    await expect(nav.getByText("Staff", { exact: true })).toHaveCount(0);
    await expect(nav.getByText("Clinic settings", { exact: true })).toHaveCount(0);
  });

  test("receptionist sees payments but not staff administration", async ({ page }) => {
    await staffLogin(page, "reception@tetaphysio.ng", STAFF_PASSWORD);
    await page.getByLabel("Current password").fill(STAFF_PASSWORD);
    await page.getByLabel("New password").fill("ReceptionNew1");
    await page.getByRole("button", { name: "Save password" }).click();

    await expect(page).toHaveURL(/\/staff$/);

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByText("Payments", { exact: true })).toBeVisible();
    await expect(nav.getByText("Staff", { exact: true })).toHaveCount(0);
    await expect(nav.getByText("Reports", { exact: true })).toHaveCount(0);
  });

  test("wrong password shows an error and stays on the login page", async ({ page }) => {
    await staffLogin(page, "admin@tetaphysio.ng", "definitelywrong1");

    await expect(page.getByRole("status")).toContainText(/Incorrect login details/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test("logging out clears the session and blocks the dashboard", async ({ page }) => {
    await staffLogin(page, "admin@tetaphysio.ng", "AdminNew1pass");
    await expect(page).toHaveURL(/\/staff$/);

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL("/");

    await page.goto("/staff");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("patient authentication", () => {
  test("patient logs in and reaches their dashboard", async ({ page }) => {
    await page.goto("/portal/login");
    await page.getByLabel("Phone number").fill("08020000001");
    await page.getByLabel("Password").fill(PATIENT_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByRole("heading", { name: /Hello, Ada Obi/ })).toBeVisible();
  });

  test("patient navigation has no staff sections", async ({ page }) => {
    await page.goto("/portal/login");
    await page.getByLabel("Phone number").fill("08020000001");
    await page.getByLabel("Password").fill(PATIENT_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/portal$/);

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByText("Dashboard", { exact: true })).toBeVisible();
    await expect(nav.getByText("Staff", { exact: true })).toHaveCount(0);
    await expect(nav.getByText("Reports", { exact: true })).toHaveCount(0);
  });

  test("a patient cannot reach the staff area", async ({ page }) => {
    await page.goto("/portal/login");
    await page.getByLabel("Phone number").fill("08020000001");
    await page.getByLabel("Password").fill(PATIENT_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/portal$/);

    await page.goto("/staff");
    await expect(page).toHaveURL(/\/portal$/);
  });

  test("registration creates an account and lands in the portal", async ({ page }) => {
    const phone = `080${Date.now().toString().slice(-8)}`;

    await page.goto("/portal/register");
    await page.getByLabel("Full name").fill("Test Patient");
    await page.getByLabel("Phone number").fill(phone);
    await page.getByLabel("Password").fill("NewPatient1");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByRole("heading", { name: /Hello, Test Patient/ })).toBeVisible();
  });

  test("the session cookie is HttpOnly and SameSite=Lax", async ({ page, context }) => {
    await page.goto("/portal/login");
    await page.getByLabel("Phone number").fill("08020000001");
    await page.getByLabel("Password").fill(PATIENT_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/portal$/);

    const cookie = (await context.cookies()).find((c) => c.name === "tp_session");
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");
  });
});

test.describe("unauthenticated access", () => {
  test("protected routes redirect to the right login page", async ({ page }) => {
    await page.goto("/staff");
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/portal");
    await expect(page).toHaveURL(/\/portal\/login/);
  });

  test("the API returns 401 rather than data", async ({ request }) => {
    const response = await request.get("/api/auth/me");
    expect(response.status()).toBe(401);
  });
});
```

- [x] **Step 4: Reset the dev database so the seed state is clean**

Run: `npm run db:reset`
Expected: migrations reapplied, seed run. This matters because the E2E tests change seeded passwords.

- [x] **Step 5: Build and run the E2E suite**

Run: `npx next build && npx playwright test`
Expected: all tests pass on both the `chromium` and `mobile` projects.

If the password-change tests fail on a second run, that is expected — they mutate seeded passwords. Re-run `npm run db:reset` first. Note this in the commit message so it is not mistaken for flakiness later.

- [x] **Step 6: Commit**

```bash
git add playwright.config.ts tests/e2e
git commit -m "test: add end-to-end login journeys

Covers all four roles against a real built server and the seeded database:
forced password change on first staff login, role-correct navigation for
therapist, receptionist and admin, patient login and registration, logout
invalidating the session, cross-area access being redirected, and the
session cookie carrying HttpOnly and SameSite=Lax.

Runs on Desktop Chrome and Pixel 7, since a mid-range Android phone is the
primary target (PRD-04 FR4).

The suite mutates seeded passwords, so run npm run db:reset before a
re-run rather than treating a repeat failure as flakiness."
```

---

## Task 13: Verification and documentation

**Files:**
- Create: `README.md`
- Modify: `docs/superpowers/plans/2026-08-28-foundation.md` (tick completed boxes)

**Interfaces:**
- Consumes: everything
- Produces: no application code

- [x] **Step 1: Run the full verification sequence from a clean state**

```bash
npm run db:reset
npm run typecheck
npm run lint
npm run build
npm test
npx playwright test
```

Expected: every command exits 0. Record any failure and fix it before proceeding — this is the definition-of-done gate from spec §9.

- [x] **Step 2: Verify no secrets are committed**

```bash
git ls-files | grep -E "^\.env$" && echo "FAIL: .env is tracked" || echo "OK: .env not tracked"
git grep -i "thompson" -- . ':!*.md' && echo "FAIL: credential in tracked files" || echo "OK: no credential"
```

Expected: `OK` for both.

- [x] **Step 3: Confirm the database matches the spec**

```bash
"/c/Program Files/PostgreSQL/17/bin/psql.exe" -h localhost -p 5435 -U postgres -d teta_physio_dev \
  -c "SELECT count(*) AS tables FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations';" \
  -c "SELECT count(*) AS enums FROM pg_type WHERE typtype='e';" \
  -c "SELECT role, count(*) FROM users GROUP BY role ORDER BY role;"
```

Expected: 27 tables, 15 enums, and one row each for admin and receptionist, two therapists, two patients.

- [x] **Step 4: Write the README**

`README.md`:

````markdown
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
| `npm run db:reset` | Drop, re-migrate, re-seed |

## Architecture

Single Next.js 16 App Router deployable in ESM. Route handlers under `src/app/api` parse, authorize, delegate to services under `src/server`, and serialize. Prisma 7 with the `PrismaPg` driver adapter is the data layer.

Three route groups: `(public)`, `(portal)`, `(staff)`.

Authorization has three server-side layers:

1. `getCurrentUser()` — the only path to an authenticated user
2. `requireSession()` / `requireRole()` — throw, so an unchecked call fails closed
3. Service-layer ownership checks — row-level rules from the PRD-01 matrix

`src/middleware.ts` only redirects requests with no cookie. It never authorizes: the edge runtime cannot reach Prisma, so a forged cookie passes middleware and is rejected server-side.

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

## Documentation

- `doc/prd/` — the 13 original PRDs
- `docs/superpowers/specs/` — design specs, including the 11 resolved PRD contradictions
- `docs/superpowers/plans/` — implementation plans
````

- [x] **Step 5: Tick every completed checkbox in this plan**

Change `- [x]` to `- [x]` for all steps in tasks 1–13.

- [x] **Step 6: Commit**

```bash
git add README.md docs/superpowers/plans/2026-08-28-foundation.md
git commit -m "docs: add README and mark the Foundation plan complete

Records setup, seeded logins, the sub-project roadmap, the three-layer
authorization model, and the Prisma 7 gotchas that bite a v6-shaped setup."
```

---

## Definition of Done

From spec §9. Every item must be verified, not assumed:

1. `npm run build` completes with no TypeScript or lint errors.
2. `prisma migrate deploy` applies cleanly to an empty database.
3. `npm run db:seed` succeeds and is idempotent on a second run.
4. All four roles log in through a browser and see role-correct navigation.
5. A staff account with `mustResetPassword` is forced through `/reset-password` before reaching any other page.
6. The RBAC test suite passes.
7. The Playwright login journeys pass.
8. `.env` is gitignored; `.env.example` contains no real credentials.
9. `git log` shows the work committed alongside the design spec.

## Out of scope for Foundation

Do not build these, even if a related file is open: booking and the calendar (sub-project 3), clinical notes (6), billing (7), notifications, OTP login and password-reset-by-code (8), reports (9), the public marketing site (4), the Capacitor wrapper (11), the design system (deferred by decision), 2FA (PRD-01 defers to phase 2), and the patient anonymisation action (10 — Foundation provides only the `anonymisedAt` column and the audit action constant).


