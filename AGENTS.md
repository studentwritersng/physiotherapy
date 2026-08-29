# TetaPhysio — Agent Instructions

Physiotherapy clinic management platform for a single clinic in Nigeria. Read `docs/superpowers/specs/2026-08-28-foundation-design.md` before making architectural decisions; it records 11 resolved contradictions across the 13 PRDs in `doc/prd/`.

## UI work: use ui-ux-pro-max first

**Before building or restyling any dashboard, page, or component, run the `ui-ux-pro-max` skill.** This is not optional. It settles the visual system — palette, typography, layout pattern, anti-patterns — before any markup gets written.

```bash
python "C:/Users/Teta/.opencode/skills/ui-ux-pro-max/scripts/search.py" "<query>" --design-system -p "TetaPhysio"
python "C:/Users/Teta/.opencode/skills/ui-ux-pro-max/scripts/search.py" "<query>" --stack nextjs
```

Use `python`, not `python3`, on this machine (Python 3.12.0). Stack is `nextjs`; do not pass `--stack shadcn` or `react-native`.

### The design system for this project

Generated for "healthcare clinic physiotherapy staff dashboard". Treat these as the project's decisions, not suggestions.

**Style: Accessible & Ethical** — the skill's recommendation for healthcare. High contrast, 16px+ body text, keyboard navigable, WCAG AAA, semantic HTML. Rated Excellent for performance, which matters because PRD-04 FR4 targets low-end Android.

**Palette** (calm cyan + health green), as CSS custom properties:

| Token | Value |
|---|---|
| `--color-primary` | `#0891B2` |
| `--color-on-primary` | `#FFFFFF` |
| `--color-secondary` | `#22D3EE` |
| `--color-accent` | `#059669` |
| `--color-background` | `#ECFEFF` |
| `--color-foreground` | `#164E63` |
| `--color-muted` | `#E8F1F6` |
| `--color-border` | `#A5F3FC` |
| `--color-destructive` | `#DC2626` |
| `--color-ring` | `#0891B2` |

**Typography: Fira Sans** for UI, **Fira Code** for tabular and numeric data (appointment times, amounts, patient codes). Chosen for dashboards and admin panels.

**Required effects:** focus rings 3–4px, ARIA labels, skip links, 44×44px minimum touch targets, `prefers-reduced-motion` respected.

**Avoid:** bright neon colours, motion-heavy animation, AI purple/pink gradients.

### Pre-delivery checklist for every UI change

- [ ] No emojis as icons — use SVG (Heroicons or Lucide)
- [ ] `cursor-pointer` on every clickable element
- [ ] Hover states with 150–300ms transitions
- [ ] Text contrast at least 4.5:1 in light mode
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Checked at 375px, 768px, 1024px and 1440px

## Styling stack: Tailwind only

Tailwind CSS v4, CSS-first configuration (`@import "tailwindcss"` in `src/app/globals.css`). Design tokens are CSS custom properties in `@theme`.

**Do not add shadcn/ui, Radix, or `class-variance-authority`.** This is a deliberate decision: shadcn's non-interactive primitives are plain Tailwind anyway, and each Radix package adds 8–20KB gzip of client JS. PRD-00 §2 requires avoiding heavy client bundles.

Where an accessible interactive component is genuinely needed (modal, combobox), build it with native HTML first — `<dialog>`, `<details>`, `<select>` — and only reach for a library if native cannot do it. Raise it before adding the dependency.

Watch bundle size in two specific places: charts in sub-project 9 (prefer server-rendered SVG over Recharts, which is ~100KB gzip) and any date-picker temptation in sub-project 3.

## Architecture

Single Next.js 16 App Router deployable, ESM (`"type": "module"`).

- Route handlers under `src/app/api` parse, authorize, delegate to `src/server/**`, serialize. No business logic in handlers.
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

- Windows. PostgreSQL 17 on **port 5435**, user `postgres`, trust auth. Databases `teta_physio_dev` and `teta_physio_test`. Production is Neon (`sslmode=require`, plus `DIRECT_URL` for migrations).
- psql: `"/c/Program Files/PostgreSQL/17/bin/psql.exe"`
- `npm install` takes ~14 minutes on this machine (Defender scanning). Do not run it casually.
- Verify with `npx tsc --noEmit`, `npx eslint .`, `npx next build`, `npx vitest run`, `npx playwright test`.

## Sub-projects

Foundation (schema, auth, RBAC, security, shells) is sub-project 1 of 11. The staff and portal dashboards currently in `(staff)` and `(portal)` are deliberate placeholders — real screens arrive in sub-projects 3, 5, 7, 9 and 10. Each sub-project gets its own spec, plan, and implementation cycle under `docs/superpowers/`.
