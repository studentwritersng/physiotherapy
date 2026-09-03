# TetaPhysio — Agent Instructions

Physiotherapy clinic management platform for a single clinic in Nigeria. Read `docs/superpowers/specs/2026-08-28-foundation-design.md` before making architectural decisions; it records 11 resolved contradictions across the 13 PRDs in `doc/prd/`.

## The design system is `doc/clinic-dashboard.html`

**That file is the visual reference for this platform. Read it before building any UI.** It is a working, dependency-free mockup: CSS custom properties, hand-rolled SVG, one small script. Everything below is extracted from it.

Two themes, both fully specified in the file: `:root` holds dark, `html[data-theme="light"]` holds light. **Light is the default for this project** — set `data-theme="light"` on `<html>` and let the toggle switch to dark.

### Palette

Deep jade-green and ivory, with four accent hues. Names come from the mockup; keep them.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ink` | `#FBF7EE` | `#0A1D18` | Page background |
| `--ink-2` | `#F3EDDF` | `#0E2620` | Sidebar gradient top |
| `--surface` | `#FFFFFF` | `#122C25` | Cards, panels |
| `--surface-2` | `#F6F1E4` | `#183931` | Nested cards |
| `--surface-3` | `#EFE7D2` | `#1E453A` | Deepest surface |
| `--ivory` | `#16302A` | `#F5EFE3` | Primary text |
| `--ivory-dim` | `rgba(22,48,42,0.64)` | `rgba(245,239,227,0.62)` | Secondary text |
| `--ivory-faint` | `rgba(22,48,42,0.42)` | `rgba(245,239,227,0.38)` | Tertiary text |
| `--jade` | `#1E9C73` | `#33C793` | Primary action, success |
| `--gold` | `#B87517` | `#F0A83B` | In-progress, warning |
| `--orchid` | `#AD3D6D` | `#D9598E` | Destructive, negative trend |
| `--sky` | `#25839F` | `#5FB8D6` | Informational |
| `--line` | `rgba(20,40,32,0.10)` | `rgba(245,239,227,0.08)` | Borders |

Each accent has a `-dim` variant for pill and badge backgrounds. Radii: `--radius-lg` 22px, `--radius-md` 14px, `--radius-sm` 9px.

### Typography

**Fraunces** (serif, `opsz` variable) for display: page headings, panel titles, KPI values, brand name, pull quotes. Set `font-feature-settings:'ss01'`. **Space Grotesk** for everything else. Tabular figures via `font-variant-numeric: tabular-nums` on times, amounts and percentages.

### Signature elements — use these, do not reinvent

- **Goniometer KPI dials.** A semicircular arc gauge with tick marks and a needle, mirroring the instrument physiotherapists use to measure joint range of motion. `buildGoniometer()` in the mockup is the reference implementation. This is the project's standard KPI component; sub-project 9's reports reuse it.
- **Collapsible sidebar**, 264px expanded, 84px collapsed, with labels that animate to zero width.
- **Radial gradient page wash** — two large soft tints over `--ink`.
- **Status pills** in `-dim` backgrounds: jade confirmed, gold in-progress, sky arrived, neutral done.
- **Dashed row separators** in timelines, solid elsewhere.
- **Card entry animation**, staggered 40ms, wrapped in `prefers-reduced-motion: no-preference`.

### Non-negotiable UI checks

- Light theme is the default; the dark toggle must work
- No emojis as icons — inline SVG with `stroke="currentColor"`
- `cursor-pointer` on every clickable element
- `:focus-visible` outline 2px `--jade`, offset 3px
- 44×44px minimum touch targets
- Text contrast at least 4.5:1 **verified**, not assumed — the deep-green palette needs checking, not trusting
- `prefers-reduced-motion` respected
- Checked at 375px, 620px, 1180px and 1440px, the mockup's own breakpoints

## Styling stack: Tailwind only

Tailwind CSS v4, CSS-first configuration. The mockup's custom properties become `@theme` tokens in `src/app/globals.css`; both theme blocks are plain CSS.

**Do not add shadcn/ui, Radix, or `class-variance-authority`.** Each Radix package costs 8–20KB gzip of client JS, and PRD-00 §2 requires avoiding heavy client bundles. The mockup proves the whole design works with zero dependencies.

Where an accessible interactive component is needed, use native HTML first — `<dialog>`, `<details>`, `<select>`, `<input type="time">`. Raise it before adding any dependency.

Charts are hand-rolled SVG, as in the mockup. Do not add Recharts (~100KB gzip).

## Verification: keep it fast

Slow feedback is a real cost. Per-change, run only what the change can break:

```bash
npx tsc --noEmit                       # ~30s — always
npx vitest run tests/unit/foo.test.ts  # ~5s  — the file you touched
```

Reserve the expensive commands for the end of a work slice, not every task:

```bash
npx eslint . && npx next build && npx vitest run && npx playwright test   # ~4 min
```

`npx next build` almost never catches what `tsc --noEmit` did not. Do not run it per task.

**Never run `npm install` casually** — it takes ~14 minutes here because Defender scans every extracted file.

## Architecture

Single Next.js 16 App Router deployable, ESM (`"type": "module"`).

- Route handlers under `src/app/api` parse, authorize, delegate to `src/server/**`, serialize. No business logic in handlers.
- Admin form mutations use Server Actions; the `/api/auth/*` handlers stay REST because the Capacitor app and Playwright consume them.
- Route groups: `(auth)`, `(public)`, `(portal)`, `(staff)`.
- Authorization is three server-side layers: `getCurrentUser()` is the only path to a user; `requireSession()`/`requireRole()` throw so an unchecked call fails closed; service-layer ownership checks hold the row-level rules. Navigation visibility is not a security boundary.
- `src/middleware.ts` only redirects requests with no cookie. It never authorizes — the edge runtime cannot reach Prisma.

## Non-negotiables

- **Prisma 7:** import from `@/generated/prisma/client`, never `@prisma/client`. A `PrismaPg` driver adapter is mandatory. `.env` is not auto-loaded — entry points outside Next.js need `import "dotenv/config"`.
- **Exact dependency versions.** No `^` or `~` in `package.json`.
- **Enum values are `snake_case`** (`in_session`, `no_show`). Display casing is a UI concern.
- **`timestamptz` for all timestamps, `Decimal(12,2)` for money, `@db.Uuid` for IDs.**
- **Timezone is `Africa/Lagos`**, from `TIMEZONE` in `src/lib/constants.ts`. Never hardcode it elsewhere.
- **Soft-delete filters live in the service module** for that entity, never inline in a route handler.
- **Never commit secrets.** `.env` is gitignored; `.env.example` holds placeholders only.

## Environment

- Windows. PostgreSQL 17 on **port 5435**, user `postgres`, trust auth. Databases `teta_physio_dev` and `teta_physio_test`. Production is Neon (`sslmode=require`, plus `DIRECT_URL` for migrations); Neon DNS resolution intermittently fails on first attempt — retry before diagnosing.
- psql: `"/c/Program Files/PostgreSQL/17/bin/psql.exe"`

## Design principles for every UI slice

The `clinic-dashboard.html` mockup is one execution of one named style recipe. To keep future iterations coherent, every design-heavy sub-project starts with the **three-line brief formula** (from `doc/dream-design-team-kit.html`):

1. **WHO IT'S FOR** — one sentence, one audience. A page for everyone converges to the average.
2. **HOW IT SHOULD FEEL** — name a recipe from the 25 ("quiet luxury, warm-dark restraint" is what the mockup is). A named recipe carries a palette, a typeface, a spacing system and signature moves; "modern and clean" carries nothing.
3. **ONE THING TO AVOID** — one explicit ban. Single named anti-goals steer harder than five vague goals.

The 3 banned default AI looks (cream + serif + terracotta / near-black + acid-green / broadsheet hairline editorial) are banned as **defaults**, not as choices — any of them chosen on purpose is fine, but never shipped by accident.

Motion follows the **two-school rule**: Emil Kowalski's restraint for product UI (sub-300ms animations, never default easing) for the patient portal and dashboards; Meng To's cinema for the marketing scroll (GSAP + Lenis + pinned sections) for the public site. Buttons and menus are not a film; the story section is not a form.

Before approving any UI slice, run the **self-check**: the page must look like the chosen recipe and must not look like any of the banned defaults. Compare against `doc/clinic-dashboard.html` for parity of craft.

## Sub-projects

Foundation (schema, auth, RBAC, security, shells) is sub-project 1 of 11 and is complete. Sub-project 2 is clinic configuration. The staff and portal dashboards in place now are placeholders — the real dashboard, built to `doc/clinic-dashboard.html`, arrives with sub-projects 3, 9 and 10. Each sub-project gets its own spec, plan, and implementation cycle under `docs/superpowers/`.
