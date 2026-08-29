# Clinic Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the four admin-only clinic configuration screens (settings, services, therapist availability, content) and the service layer that sub-project 3's booking engine will consume.

**Architecture:** Server Actions handle mutations; framework-agnostic service modules under `src/server/services` hold the rules; a single Zod schema guards the `openingHours` JSON column on both read and write. The availability resolution function is pure — no database handle, no clock — so sub-project 3 gets a contract it can trust and test.

**Tech Stack:** Next.js 16 App Router (Server Actions, `useActionState`), React 19.2.8, TypeScript 5.9.3, Prisma 7.10.0 + `@prisma/adapter-pg`, PostgreSQL 17, Zod 4.4.3, Tailwind CSS 4.3.3, Vitest 4.1.11, Playwright 1.62.1.

**Spec:** `docs/superpowers/specs/2026-08-29-clinic-config-design.md`. Read it before starting. Section references below (§3.2, §4.1) point into it.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **No migration.** `clinic_settings`, `services`, `therapist_availability` and `testimonials` all exist. If you think you need a schema change, stop and re-read the spec — you do not.
- **Prisma client import is `@/generated/prisma/client`.** Never `@prisma/client`.
- **ESM only.** `"type": "module"`. No `require()`.
- **Do NOT run `npm install`.** It takes ~14 minutes on this machine. Every dependency this plan needs is already installed.
- **Exact dependency versions.** No `^` or `~`. Add no new dependencies.
- **All times in this slice are `HH:MM` wall-clock strings, `Africa/Lagos`.** Zero-padded, 24-hour, so `"09:00" < "17:00"` compares correctly as strings. Never construct a `Date` for window arithmetic. Converting to `timestamptz` instants is sub-project 3's job (spec §4.2).
- **`TIMEZONE` comes from `src/lib/constants.ts`.** Never hardcode `"Africa/Lagos"` anywhere else.
- **Soft-delete and active filters live in the service module** for that entity, never inline in an action or a page. Follow the `notDeleted` pattern in `src/server/services/patient.ts:12`.
- **Every Server Action calls `await requireRole("admin")` first**, before parsing input. It throws, so an unchecked call fails closed.
- **Design tokens only.** After Task 1, use `bg-primary`, `text-foreground`, `border-border` and friends. No raw `gray-*` or `blue-*` utilities in new code.
- **Accessibility is not optional:** real `<label htmlFor>` (never a placeholder as a label), visible focus rings, `aria-describedby` for hints and errors, 44×44px minimum touch targets, SVG icons not emoji.
- **Verify with** `npx tsc --noEmit`, `npx eslint .`, `npx next build`, `npx vitest run`, `npx playwright test`.
- **Commit after every task**, Conventional Commit prefixes.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/app/globals.css` | Tailwind import + `@theme` token block + font imports |
| `src/lib/slug.ts` | `slugify` — shared by the seed and the service catalog |
| `src/lib/zod/clinic.ts` | All clinic-config schemas: opening hours, settings, service, availability, testimonial |
| `src/lib/time.ts` | Pure `HH:MM` window arithmetic: parse, compare, subtract, intersect, merge |
| `src/server/services/clinic-settings.ts` | Singleton read/update; parses `openingHours` both directions |
| `src/server/services/service-catalog.ts` | Service CRUD, slug collision handling, activate/deactivate, reorder |
| `src/server/services/availability.ts` | Availability row CRUD + `resolveAvailability` |
| `src/server/services/testimonial.ts` | Testimonial CRUD and publish toggle |
| `src/server/action-state.ts` | `ActionState` type and the `toFieldErrors` / `actionOk` helpers |
| `src/components/FormField.tsx` | Extended with `error`, `defaultValue`, `time`/`number`/`url` types |
| `src/components/SubmitButton.tsx` | Pending state via `useFormStatus` |
| `src/components/FormStatus.tsx` | Success/error banner in an `aria-live` region |
| `src/app/(staff)/staff/settings/layout.tsx` | Tab strip shared by the four screens |
| `src/app/(staff)/staff/settings/page.tsx` + `actions.ts` | Clinic settings screen |
| `src/app/(staff)/staff/settings/OpeningHoursEditor.tsx` | Seven-day editor, client component |
| `src/app/(staff)/staff/settings/services/page.tsx` + `actions.ts` | Services screen |
| `src/app/(staff)/staff/settings/availability/page.tsx` + `actions.ts` | Availability screen |
| `src/app/(staff)/staff/settings/content/page.tsx` + `actions.ts` | About content + testimonials |
| `src/lib/nav.ts` | Flip Clinic settings to `available: true` |

---

## Task 1: Design tokens and typography

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/FormField.tsx`, `src/components/AuthForm.tsx`, `src/components/NavShell.tsx`, `src/components/LogoutButton.tsx`
- Modify: `src/app/page.tsx`, `src/app/(auth)/layout.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: Tailwind utility classes derived from the `@theme` tokens — `bg-primary`, `text-on-primary`, `bg-background`, `text-foreground`, `bg-muted`, `border-border`, `bg-destructive`, `ring-ring`, `bg-accent`. Also `font-sans` (Fira Sans) and `font-mono` (Fira Code).

The palette and typography are recorded in `AGENTS.md` as project decisions, generated by `ui-ux-pro-max` for a healthcare clinic dashboard. This task lands them and retro-fits the Foundation auth screens, which currently use raw `gray-*` and `blue-*`.

- [ ] **Step 1: Write the token block into `globals.css`**

```css
@import "tailwindcss";

/*
 * Design tokens from AGENTS.md — the ui-ux-pro-max "Accessible & Ethical"
 * palette for a healthcare clinic dashboard. Calm cyan plus health green.
 * Tailwind v4 is CSS-first: names under @theme become utilities, so
 * --color-primary yields bg-primary, text-primary, border-primary.
 */
@theme {
  --color-primary: #0891b2;
  --color-on-primary: #ffffff;
  --color-secondary: #22d3ee;
  --color-accent: #059669;
  --color-background: #ecfeff;
  --color-foreground: #164e63;
  --color-muted: #e8f1f6;
  --color-border: #a5f3fc;
  --color-destructive: #dc2626;
  --color-ring: #0891b2;

  --font-sans:
    "Fira Sans", ui-sans-serif, system-ui, sans-serif;
  /* Fira Code for tabular and numeric data: times, prices, durations,
     patient codes. Its digits align in a column; Fira Sans's do not. */
  --font-mono: "Fira Code", ui-monospace, monospace;
}

/* PRD-04 FR4 targets low-end Android, and the AGENTS.md checklist requires
   prefers-reduced-motion be respected. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: Load the fonts in the root layout**

Modify `src/app/layout.tsx`. Use `next/font/google`, not a CSS `@import` — it self-hosts the files, so there is no third-party request on the critical path and no layout shift.

```tsx
import "./globals.css";
import type { Metadata } from "next";
import { Fira_Sans, Fira_Code } from "next/font/google";

const firaSans = Fira_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-fira-sans",
  display: "swap",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-fira-code",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TetaPhysio",
  description: "Physiotherapy clinic management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${firaSans.variable} ${firaCode.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Point the theme fonts at the loaded variables**

In `globals.css`, replace the two font lines inside `@theme` so Tailwind's `font-sans` and `font-mono` resolve to what `next/font` actually loaded:

```css
  --font-sans: var(--font-fira-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-fira-code), ui-monospace, monospace;
```

- [ ] **Step 4: Retro-fit `FormField.tsx` onto the tokens and add the fields later tasks need**

```tsx
export type FormFieldProps = {
  label: string;
  name: string;
  type?: "text" | "email" | "tel" | "password" | "url" | "time" | "number" | "date";
  autoComplete?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  defaultValue?: string | number;
  min?: number;
  max?: number;
  step?: number;
  /** Tabular data — times, prices, durations — reads better in Fira Code. */
  mono?: boolean;
};

export function FormField({
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  hint,
  error,
  defaultValue,
  min,
  max,
  step,
  mono = false,
}: FormFieldProps) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1">
      {/* Explicit label/input association, not a placeholder — placeholders
          disappear on focus and are not announced reliably. */}
      <label htmlFor={name} className="text-sm font-medium text-foreground">
        {label}
        {!required && <span className="ml-1 font-normal opacity-70">(optional)</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={step}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={[
          "min-h-11 rounded-md border bg-white px-3 py-2 text-base text-foreground",
          "focus:outline-none focus:ring-3 focus:ring-ring",
          mono ? "font-mono" : "font-sans",
          error ? "border-destructive" : "border-border",
        ].join(" ")}
      />
      {hint && (
        <p id={hintId} className="text-xs opacity-70">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
```

`min-h-11` is 44px, the AGENTS.md touch-target minimum. `focus:ring-3` is the 3–4px focus ring the design system requires.

- [ ] **Step 5: Retro-fit the remaining Foundation components**

In `src/components/AuthForm.tsx`, replace the hardcoded utilities:

- the card wrapper `border-gray-200 bg-white` → `border-border bg-white`
- `text-gray-900` → `text-foreground`; `text-gray-600` → `opacity-80`
- the error banner `bg-red-50 text-red-800` → `bg-destructive/10 text-destructive`
- the submit button `bg-blue-700 hover:bg-blue-800 focus:ring-blue-300` → `bg-primary text-on-primary hover:opacity-90 focus:ring-3 focus:ring-ring`, and add `min-h-11 cursor-pointer transition-opacity duration-200`

In `src/components/NavShell.tsx`:

- `border-gray-200 bg-white` → `border-border bg-white`
- `text-gray-900` / `text-gray-700` → `text-foreground` / `text-foreground opacity-80`
- `text-gray-500` → `opacity-70`
- the active link `text-gray-800 hover:bg-gray-100` → `text-foreground hover:bg-muted`, plus `cursor-pointer transition-colors duration-150`
- the disabled span `text-gray-400` → `opacity-50`, and its badge `bg-gray-100` → `bg-muted`

In `src/components/LogoutButton.tsx` and `src/app/page.tsx`, `text-blue-700 hover:text-blue-900` → `text-primary hover:opacity-80`, plus `cursor-pointer`.

In `src/app/(auth)/layout.tsx`, `bg-gray-50` → `bg-background`.

- [ ] **Step 6: Verify no raw palette utilities remain**

Run: `grep -rnE "(gray|blue|red)-[0-9]{2,3}" src/ --include=*.tsx --include=*.ts`
Expected: no output.

- [ ] **Step 7: Verify build, typecheck and lint**

Run: `npx tsc --noEmit && npx eslint . && npx next build`
Expected: all three succeed.

- [ ] **Step 8: Verify the Foundation login journeys still pass**

Run: `npx playwright test --project=chromium`
Expected: 14 passed. The specs assert on accessible names and roles, not CSS classes, so restyling must not break them. If any fail, the markup structure changed — revert that part rather than editing the spec.

- [ ] **Step 9: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/components src/app/page.tsx "src/app/(auth)/layout.tsx"
git commit -m "feat: land the design system tokens

Adds the AGENTS.md palette and typography as a Tailwind v4 @theme block:
calm cyan and health green from ui-ux-pro-max's Accessible & Ethical style
for healthcare, plus Fira Sans for UI and Fira Code for tabular data.

Fonts load through next/font/google so they are self-hosted — no
third-party request on the critical path and no layout shift.

Retro-fits the Foundation auth screens off raw gray/blue utilities, adds
44px minimum touch targets and 3px focus rings, and respects
prefers-reduced-motion. The Playwright login journeys assert on roles and
accessible names, so they cover this restyle unchanged."
```

---

## Task 2: Slug helper and time arithmetic

**Files:**
- Create: `src/lib/slug.ts`, `src/lib/time.ts`
- Create: `tests/unit/slug.test.ts`, `tests/unit/time.test.ts`
- Modify: `prisma/seed.ts` (import the shared `slugify`, delete the private copy)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `src/lib/slug.ts` exports `slugify(name: string): string`
  - `src/lib/time.ts` exports `type TimeWindow = { start: string; end: string }`, `isValidTime(v: string): boolean`, `subtractWindows(from: TimeWindow[], blocks: TimeWindow[]): TimeWindow[]`, `intersectWindows(a: TimeWindow[], b: TimeWindow[]): TimeWindow[]`, `mergeWindows(windows: TimeWindow[]): TimeWindow[]`

These are the pure primitives Task 3's `resolveAvailability` composes. Getting them right in isolation is what makes that function trustworthy.

- [ ] **Step 1: Write the failing slug test**

`tests/unit/slug.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Sports Injury Rehabilitation")).toBe("sports-injury-rehabilitation");
  });

  it("collapses non-alphanumeric runs into a single hyphen", () => {
    expect(slugify("Orthopedic/Musculoskeletal Physiotherapy")).toBe(
      "orthopedic-musculoskeletal-physiotherapy",
    );
    expect(slugify("Pain   &   Management")).toBe("pain-management");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  Pain Management  ")).toBe("pain-management");
    expect(slugify("--Neuro--")).toBe("neuro");
  });

  it("keeps digits", () => {
    expect(slugify("Phase 2 Rehab")).toBe("phase-2-rehab");
  });

  it("returns an empty string when nothing survives", () => {
    expect(slugify("!!!")).toBe("");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/slug.test.ts`
Expected: FAIL — cannot resolve `@/lib/slug`.

- [ ] **Step 3: Implement `src/lib/slug.ts`**

```ts
/**
 * Shared by prisma/seed.ts and the service catalog. It lives here rather than in
 * either caller so the two cannot drift into producing different slugs for the
 * same service name, which would break the public service URLs in sub-project 4.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/slug.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Point the seed at the shared helper**

In `prisma/seed.ts`, delete the local `function slugify(...)` block and import it instead. The seed runs under `tsx` outside Next's module resolution, so it needs a relative path with the `.js` extension, matching how it already imports the Prisma client:

```ts
import { slugify } from "../src/lib/slug.js";
```

- [ ] **Step 6: Verify the seed still works and is still idempotent**

Run: `npx prisma db seed && npx prisma db seed`
Expected: `Seed complete.` twice, no unique-constraint error.

Then: `npx vitest run tests/integration/seed.test.ts`
Expected: PASS, 9 tests. The existing assertion that `services[0].slug === "orthopedic-musculoskeletal-physiotherapy"` proves the extracted helper behaves identically.

- [ ] **Step 7: Write the failing time-arithmetic test**

`tests/unit/time.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  intersectWindows,
  isValidTime,
  mergeWindows,
  subtractWindows,
  type TimeWindow,
} from "@/lib/time";

const w = (start: string, end: string): TimeWindow => ({ start, end });

describe("isValidTime", () => {
  it("accepts zero-padded 24-hour times", () => {
    expect(isValidTime("00:00")).toBe(true);
    expect(isValidTime("09:30")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidTime("9:30")).toBe(false);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("12:60")).toBe(false);
    expect(isValidTime("noon")).toBe(false);
    expect(isValidTime("")).toBe(false);
  });
});

describe("mergeWindows", () => {
  it("sorts by start", () => {
    expect(mergeWindows([w("13:00", "17:00"), w("08:00", "12:00")])).toEqual([
      w("08:00", "12:00"),
      w("13:00", "17:00"),
    ]);
  });

  it("merges overlapping windows", () => {
    expect(mergeWindows([w("08:00", "12:00"), w("11:00", "15:00")])).toEqual([w("08:00", "15:00")]);
  });

  it("merges windows that merely touch", () => {
    expect(mergeWindows([w("08:00", "12:00"), w("12:00", "17:00")])).toEqual([w("08:00", "17:00")]);
  });

  it("leaves a real gap alone", () => {
    expect(mergeWindows([w("08:00", "12:00"), w("13:00", "17:00")])).toHaveLength(2);
  });

  it("drops zero-length windows", () => {
    expect(mergeWindows([w("09:00", "09:00")])).toEqual([]);
  });

  it("returns an empty array unchanged", () => {
    expect(mergeWindows([])).toEqual([]);
  });
});

describe("subtractWindows", () => {
  it("returns the original when nothing is blocked", () => {
    expect(subtractWindows([w("08:00", "17:00")], [])).toEqual([w("08:00", "17:00")]);
  });

  it("splits a window when a block falls inside it", () => {
    expect(subtractWindows([w("08:00", "17:00")], [w("12:00", "13:00")])).toEqual([
      w("08:00", "12:00"),
      w("13:00", "17:00"),
    ]);
  });

  it("trims the front when a block overlaps the start", () => {
    expect(subtractWindows([w("08:00", "17:00")], [w("07:00", "10:00")])).toEqual([
      w("10:00", "17:00"),
    ]);
  });

  it("trims the back when a block overlaps the end", () => {
    expect(subtractWindows([w("08:00", "17:00")], [w("16:00", "20:00")])).toEqual([
      w("08:00", "16:00"),
    ]);
  });

  it("removes the window entirely when fully blocked", () => {
    expect(subtractWindows([w("08:00", "17:00")], [w("08:00", "17:00")])).toEqual([]);
    expect(subtractWindows([w("08:00", "17:00")], [w("06:00", "20:00")])).toEqual([]);
  });

  it("ignores a block that does not touch the window", () => {
    expect(subtractWindows([w("08:00", "12:00")], [w("13:00", "14:00")])).toEqual([
      w("08:00", "12:00"),
    ]);
  });

  it("applies several blocks", () => {
    expect(
      subtractWindows([w("08:00", "18:00")], [w("10:00", "11:00"), w("14:00", "15:00")]),
    ).toEqual([w("08:00", "10:00"), w("11:00", "14:00"), w("15:00", "18:00")]);
  });
});

describe("intersectWindows", () => {
  it("returns the overlap", () => {
    expect(intersectWindows([w("08:00", "17:00")], [w("09:00", "13:00")])).toEqual([
      w("09:00", "13:00"),
    ]);
  });

  it("truncates a window that runs past the other's end", () => {
    expect(intersectWindows([w("08:00", "20:00")], [w("08:00", "17:00")])).toEqual([
      w("08:00", "17:00"),
    ]);
  });

  it("returns empty when there is no overlap", () => {
    expect(intersectWindows([w("08:00", "12:00")], [w("13:00", "17:00")])).toEqual([]);
  });

  it("returns empty when either side is empty", () => {
    expect(intersectWindows([], [w("08:00", "17:00")])).toEqual([]);
    expect(intersectWindows([w("08:00", "17:00")], [])).toEqual([]);
  });

  it("intersects many against many", () => {
    expect(
      intersectWindows([w("08:00", "12:00"), w("13:00", "18:00")], [w("11:00", "15:00")]),
    ).toEqual([w("11:00", "12:00"), w("13:00", "15:00")]);
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `npx vitest run tests/unit/time.test.ts`
Expected: FAIL — cannot resolve `@/lib/time`.

- [ ] **Step 9: Implement `src/lib/time.ts`**

```ts
/**
 * Pure HH:MM window arithmetic, Africa/Lagos wall-clock (spec §4.2).
 *
 * Times are zero-padded 24-hour strings, so lexicographic comparison IS
 * chronological comparison: "09:00" < "17:00". That is why nothing here needs a
 * Date, and therefore why none of it can have a timezone bug. Converting a
 * window into real timestamptz instants belongs to sub-project 3.
 */

export type TimeWindow = { start: string; end: string };

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** Sorts, merges overlapping or touching windows, and drops zero-length ones. */
export function mergeWindows(windows: TimeWindow[]): TimeWindow[] {
  const sorted = windows
    .filter((wnd) => wnd.start < wnd.end)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  const merged: TimeWindow[] = [];
  for (const wnd of sorted) {
    const last = merged[merged.length - 1];
    // `<=` not `<`: 08:00-12:00 and 12:00-17:00 are one continuous window.
    if (last && wnd.start <= last.end) {
      if (wnd.end > last.end) last.end = wnd.end;
    } else {
      merged.push({ ...wnd });
    }
  }
  return merged;
}

/** Removes every blocked span from the given windows, splitting where needed. */
export function subtractWindows(from: TimeWindow[], blocks: TimeWindow[]): TimeWindow[] {
  const cleanBlocks = mergeWindows(blocks);

  let result = mergeWindows(from);
  for (const block of cleanBlocks) {
    const next: TimeWindow[] = [];
    for (const wnd of result) {
      // No overlap at all.
      if (block.end <= wnd.start || block.start >= wnd.end) {
        next.push(wnd);
        continue;
      }
      // Surviving piece before the block.
      if (wnd.start < block.start) next.push({ start: wnd.start, end: block.start });
      // Surviving piece after the block.
      if (block.end < wnd.end) next.push({ start: block.end, end: wnd.end });
    }
    result = next;
  }
  return mergeWindows(result);
}

/** Every overlapping span between the two sets. */
export function intersectWindows(a: TimeWindow[], b: TimeWindow[]): TimeWindow[] {
  const left = mergeWindows(a);
  const right = mergeWindows(b);

  const out: TimeWindow[] = [];
  for (const x of left) {
    for (const y of right) {
      const start = x.start > y.start ? x.start : y.start;
      const end = x.end < y.end ? x.end : y.end;
      if (start < end) out.push({ start, end });
    }
  }
  return mergeWindows(out);
}
```

- [ ] **Step 10: Run it to verify it passes**

Run: `npx vitest run tests/unit/time.test.ts`
Expected: PASS, 21 tests.

- [ ] **Step 11: Verify typecheck and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: both clean.

- [ ] **Step 12: Commit**

```bash
git add src/lib/slug.ts src/lib/time.ts tests/unit/slug.test.ts tests/unit/time.test.ts prisma/seed.ts
git commit -m "feat: add shared slugify and pure time-window arithmetic

slugify moves out of prisma/seed.ts into src/lib/slug.ts so the seed and the
service catalog cannot drift into different slugs for the same name, which
would break the public service URLs in sub-project 4.

src/lib/time.ts holds the primitives the availability resolver composes:
merge, subtract and intersect over HH:MM windows. Zero-padded 24-hour strings
compare chronologically as strings, so none of this constructs a Date and
none of it can have a timezone bug (spec 4.2).

Covers the cases most likely to be got wrong: a block splitting a window in
two, truncation at a boundary, and windows that merely touch being merged."
```

---

## Task 3: Zod schemas and the availability resolver

**Files:**
- Create: `src/lib/zod/clinic.ts`
- Create: `src/server/services/availability.ts`
- Create: `tests/unit/clinic-schema.test.ts`, `tests/unit/resolve-availability.test.ts`

**Interfaces:**
- Consumes: `TimeWindow`, `subtractWindows`, `intersectWindows`, `mergeWindows`, `isValidTime` (Task 2)
- Produces:
  - `src/lib/zod/clinic.ts` exports `dayHoursSchema`, `openingHoursSchema`, `type OpeningHours`, `type DayHours`, `DAY_KEYS`, `EMPTY_OPENING_HOURS`, `parseOpeningHours(value: unknown): OpeningHours`, `clinicSettingsSchema`, `serviceSchema`, `availabilitySchema`, `testimonialSchema`, and the inferred input types `ClinicSettingsInput`, `ServiceInput`, `AvailabilityInput`, `TestimonialInput`
  - `src/server/services/availability.ts` exports `resolveAvailability(date: string, rows: AvailabilityRow[], openingHours: OpeningHours): TimeWindow[]` and `type AvailabilityRow = Pick<TherapistAvailability, "dayOfWeek" | "specificDate" | "startTime" | "endTime" | "isBlocked">`

The resolver is the contract sub-project 3's booking engine depends on. It takes no database handle and reads no clock, so every branch is testable in isolation.

- [ ] **Step 1: Write the failing schema test**

`tests/unit/clinic-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DAY_KEYS,
  EMPTY_OPENING_HOURS,
  clinicSettingsSchema,
  openingHoursSchema,
  parseOpeningHours,
  serviceSchema,
  availabilitySchema,
  testimonialSchema,
} from "@/lib/zod/clinic";

const fullWeek = {
  monday: { open: "08:00", close: "17:00" },
  tuesday: { open: "08:00", close: "17:00" },
  wednesday: { open: "08:00", close: "17:00" },
  thursday: { open: "08:00", close: "17:00" },
  friday: { open: "08:00", close: "17:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: null,
};

describe("openingHoursSchema", () => {
  it("accepts a full week with a closed day", () => {
    const parsed = openingHoursSchema.parse(fullWeek);
    expect(parsed.sunday).toBeNull();
    expect(parsed.monday).toEqual({ open: "08:00", close: "17:00" });
  });

  it("lists all seven days in DAY_KEYS, Monday first", () => {
    expect(DAY_KEYS).toEqual([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]);
  });

  it("rejects a closing time before the opening time", () => {
    const bad = { ...fullWeek, monday: { open: "17:00", close: "08:00" } };
    expect(() => openingHoursSchema.parse(bad)).toThrow(/after/i);
  });

  it("rejects a closing time equal to the opening time", () => {
    const bad = { ...fullWeek, monday: { open: "09:00", close: "09:00" } };
    expect(() => openingHoursSchema.parse(bad)).toThrow(/after/i);
  });

  it("rejects times that are not zero-padded 24-hour", () => {
    for (const value of ["9:00", "24:00", "12:60", "morning"]) {
      const bad = { ...fullWeek, monday: { open: value, close: "17:00" } };
      expect(() => openingHoursSchema.parse(bad)).toThrow();
    }
  });

  it("rejects a week with a missing day", () => {
    const { sunday: _omitted, ...missing } = fullWeek;
    expect(() => openingHoursSchema.parse(missing)).toThrow();
  });
});

describe("parseOpeningHours", () => {
  it("parses a valid stored value", () => {
    expect(parseOpeningHours(fullWeek).saturday).toEqual({ open: "09:00", close: "14:00" });
  });

  it("falls back to all-closed for an empty object, so a fresh row renders", () => {
    expect(parseOpeningHours({})).toEqual(EMPTY_OPENING_HOURS);
    expect(parseOpeningHours(null)).toEqual(EMPTY_OPENING_HOURS);
  });

  it("throws on a value that is present but malformed", () => {
    // A hand-edited row must fail at this boundary, not deep inside the
    // booking engine (spec §3.1).
    expect(() => parseOpeningHours({ ...fullWeek, monday: { open: "08:00" } })).toThrow();
  });
});

describe("clinicSettingsSchema", () => {
  const valid = {
    clinicName: "TetaPhysio",
    tagline: "Movement is medicine",
    logoUrl: "",
    aboutContent: "",
    contactPhone: "08031234567",
    contactWhatsapp: "08031234567",
    contactEmail: "hello@tetaphysio.ng",
    address: "Lagos",
    bookingLeadTimeHours: "0",
    rescheduleCutoffHours: "2",
    cancellationCutoffHours: "2",
  };

  it("accepts valid input and coerces the numeric strings a FormData carries", () => {
    const parsed = clinicSettingsSchema.parse(valid);
    expect(parsed.rescheduleCutoffHours).toBe(2);
    expect(typeof parsed.rescheduleCutoffHours).toBe("number");
  });

  it("requires a clinic name", () => {
    expect(() => clinicSettingsSchema.parse({ ...valid, clinicName: "" })).toThrow();
  });

  it("rejects a negative cutoff", () => {
    expect(() => clinicSettingsSchema.parse({ ...valid, rescheduleCutoffHours: "-1" })).toThrow();
  });

  it("treats an empty optional string as absent rather than invalid", () => {
    const parsed = clinicSettingsSchema.parse({ ...valid, logoUrl: "", contactEmail: "" });
    expect(parsed.logoUrl).toBeNull();
    expect(parsed.contactEmail).toBeNull();
  });

  it("rejects a malformed logo URL when one is given", () => {
    expect(() => clinicSettingsSchema.parse({ ...valid, logoUrl: "not-a-url" })).toThrow();
  });
});

describe("serviceSchema", () => {
  const valid = {
    name: "Sports Injury Rehabilitation",
    description: "Recovery from sports injury",
    defaultDurationMinutes: "60",
    defaultPrice: "20000.00",
    imageUrl: "",
  };

  it("accepts valid input", () => {
    const parsed = serviceSchema.parse(valid);
    expect(parsed.defaultDurationMinutes).toBe(60);
    expect(parsed.defaultPrice).toBe("20000.00");
  });

  it("requires a name", () => {
    expect(() => serviceSchema.parse({ ...valid, name: " " })).toThrow();
  });

  it("rejects a duration of zero or less", () => {
    expect(() => serviceSchema.parse({ ...valid, defaultDurationMinutes: "0" })).toThrow();
  });

  it("rejects a duration that is not a whole number of minutes", () => {
    expect(() => serviceSchema.parse({ ...valid, defaultDurationMinutes: "45.5" })).toThrow();
  });

  it("rejects a negative price but allows zero", () => {
    expect(() => serviceSchema.parse({ ...valid, defaultPrice: "-1" })).toThrow();
    expect(serviceSchema.parse({ ...valid, defaultPrice: "0" }).defaultPrice).toBe("0");
  });

  it("rejects a price with more than two decimal places", () => {
    // The column is Decimal(12,2); a third decimal would be silently rounded.
    expect(() => serviceSchema.parse({ ...valid, defaultPrice: "100.123" })).toThrow();
  });
});

describe("availabilitySchema", () => {
  const recurring = {
    therapistId: "11111111-1111-1111-1111-111111111111",
    kind: "recurring",
    dayOfWeek: "1",
    startTime: "08:00",
    endTime: "17:00",
    isBlocked: "false",
  };

  const dated = {
    therapistId: "11111111-1111-1111-1111-111111111111",
    kind: "dated",
    specificDate: "2026-09-15",
    startTime: "09:00",
    endTime: "13:00",
    isBlocked: "true",
    reason: "Public holiday",
  };

  it("accepts a recurring window", () => {
    const parsed = availabilitySchema.parse(recurring);
    expect(parsed.dayOfWeek).toBe(1);
    expect(parsed.specificDate).toBeNull();
    expect(parsed.isBlocked).toBe(false);
  });

  it("accepts a dated block", () => {
    const parsed = availabilitySchema.parse(dated);
    expect(parsed.specificDate).toBe("2026-09-15");
    expect(parsed.dayOfWeek).toBeNull();
    expect(parsed.isBlocked).toBe(true);
  });

  it("rejects an end time at or before the start time", () => {
    expect(() => availabilitySchema.parse({ ...recurring, endTime: "08:00" })).toThrow(/after/i);
    expect(() => availabilitySchema.parse({ ...recurring, endTime: "07:00" })).toThrow(/after/i);
  });

  it("rejects a day of week outside 0-6", () => {
    expect(() => availabilitySchema.parse({ ...recurring, dayOfWeek: "7" })).toThrow();
    expect(() => availabilitySchema.parse({ ...recurring, dayOfWeek: "-1" })).toThrow();
  });

  it("requires a date when the kind is dated", () => {
    const { specificDate: _omitted, ...noDate } = dated;
    expect(() => availabilitySchema.parse(noDate)).toThrow();
  });

  it("requires a day of week when the kind is recurring", () => {
    const { dayOfWeek: _omitted, ...noDay } = recurring;
    expect(() => availabilitySchema.parse(noDay)).toThrow();
  });

  it("rejects a therapistId that is not a uuid", () => {
    expect(() => availabilitySchema.parse({ ...recurring, therapistId: "nope" })).toThrow();
  });
});

describe("testimonialSchema", () => {
  it("accepts valid input", () => {
    const parsed = testimonialSchema.parse({
      patientName: "Ada O.",
      content: "The team got me walking again.",
      published: "true",
    });
    expect(parsed.published).toBe(true);
  });

  it("requires a name and content", () => {
    expect(() => testimonialSchema.parse({ patientName: "", content: "x", published: "false" })).toThrow();
    expect(() => testimonialSchema.parse({ patientName: "Ada", content: " ", published: "false" })).toThrow();
  });

  it("defaults published to false when the checkbox is absent", () => {
    expect(testimonialSchema.parse({ patientName: "Ada", content: "Great" }).published).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/clinic-schema.test.ts`
Expected: FAIL — cannot resolve `@/lib/zod/clinic`.

- [ ] **Step 3: Implement `src/lib/zod/clinic.ts`**

Note the `checkbox` and `numeric` helpers: a `FormData` gives every value as a string, and an unchecked checkbox is absent entirely rather than `"false"`.

```ts
import { z } from "zod";
import { isValidTime } from "@/lib/time";

/** Monday first — the clinic week starts Monday, and the editor renders in this order. */
export const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type DayKey = (typeof DAY_KEYS)[number];

const timeString = z.string().refine(isValidTime, "Use HH:MM, 24-hour");

/** null means the clinic is closed that day (spec §3.1). */
export const dayHoursSchema = z
  .object({ open: timeString, close: timeString })
  .refine((d) => d.close > d.open, { message: "Closing time must be after opening time" })
  .nullable();

export const openingHoursSchema = z.object({
  monday: dayHoursSchema,
  tuesday: dayHoursSchema,
  wednesday: dayHoursSchema,
  thursday: dayHoursSchema,
  friday: dayHoursSchema,
  saturday: dayHoursSchema,
  sunday: dayHoursSchema,
});

export type DayHours = z.infer<typeof dayHoursSchema>;
export type OpeningHours = z.infer<typeof openingHoursSchema>;

export const EMPTY_OPENING_HOURS: OpeningHours = {
  monday: null,
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
};

/**
 * The only way to read the openingHours JSON column (spec §3.1). Parsing on read
 * as well as write means a hand-edited row fails here, at the boundary, rather
 * than deep inside sub-project 3's slot generation.
 *
 * An empty object or null is the Prisma column default, so it degrades to
 * all-closed and the settings form renders instead of throwing.
 */
export function parseOpeningHours(value: unknown): OpeningHours {
  if (value === null || value === undefined) return EMPTY_OPENING_HOURS;
  if (typeof value === "object" && Object.keys(value as object).length === 0) {
    return EMPTY_OPENING_HOURS;
  }
  return openingHoursSchema.parse(value);
}

/** A FormData value is always a string; "" means the user left an optional field blank. */
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable();

const optionalUrl = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .refine((v) => v === null || z.string().url().safeParse(v).success, "Enter a valid URL");

const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .refine((v) => v === null || z.string().email().safeParse(v).success, "Enter a valid email");

/** An unchecked HTML checkbox is absent from FormData, not "false". */
const checkbox = z
  .union([z.literal("true"), z.literal("on"), z.literal("false"), z.undefined()])
  .transform((v) => v === "true" || v === "on");

const wholeNumber = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => /^-?\d+$/.test(v), `${label} must be a whole number`)
    .transform(Number)
    .refine((n) => n >= min && n <= max, `${label} must be between ${min} and ${max}`);

export const clinicSettingsSchema = z.object({
  clinicName: z.string().trim().min(1, "Clinic name is required"),
  tagline: optionalText,
  logoUrl: optionalUrl,
  aboutContent: optionalText,
  contactPhone: optionalText,
  contactWhatsapp: optionalText,
  contactEmail: optionalEmail,
  address: optionalText,
  bookingLeadTimeHours: wholeNumber("Booking lead time", 0, 168),
  rescheduleCutoffHours: wholeNumber("Reschedule cutoff", 0, 168),
  cancellationCutoffHours: wholeNumber("Cancellation cutoff", 0, 168),
});

export const serviceSchema = z.object({
  name: z.string().trim().min(1, "Service name is required"),
  description: optionalText,
  defaultDurationMinutes: wholeNumber("Duration", 5, 480),
  /**
   * Kept as a string all the way to Prisma, which accepts a decimal string for a
   * Decimal(12,2) column. Going through a JS number would risk a float artefact
   * on a money value.
   */
  defaultPrice: z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Enter an amount like 15000 or 15000.00"),
  imageUrl: optionalUrl,
});

export const availabilitySchema = z
  .object({
    therapistId: z.string().uuid("Choose a therapist"),
    kind: z.enum(["recurring", "dated"]),
    dayOfWeek: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v === undefined || v === "" ? null : Number(v))),
    specificDate: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v === undefined || v === "" ? null : v)),
    startTime: timeString,
    endTime: timeString,
    isBlocked: checkbox,
    reason: optionalText.optional().transform((v) => v ?? null),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "End time must be after the start time",
    path: ["endTime"],
  })
  .refine((v) => v.kind !== "recurring" || (v.dayOfWeek !== null && v.dayOfWeek >= 0 && v.dayOfWeek <= 6), {
    message: "Choose a day of the week",
    path: ["dayOfWeek"],
  })
  .refine((v) => v.kind !== "dated" || (v.specificDate !== null && /^\d{4}-\d{2}-\d{2}$/.test(v.specificDate)), {
    message: "Choose a date",
    path: ["specificDate"],
  })
  // A row is either recurring or dated, never both — the resolver's precedence
  // rule depends on being able to tell them apart (spec §3.2).
  .transform((v) => ({
    ...v,
    dayOfWeek: v.kind === "recurring" ? v.dayOfWeek : null,
    specificDate: v.kind === "dated" ? v.specificDate : null,
  }));

export const testimonialSchema = z.object({
  patientName: z.string().trim().min(1, "Name is required"),
  content: z.string().trim().min(1, "Testimonial text is required"),
  published: checkbox,
});

export type ClinicSettingsInput = z.infer<typeof clinicSettingsSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
export type AvailabilityInput = z.infer<typeof availabilitySchema>;
export type TestimonialInput = z.infer<typeof testimonialSchema>;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/clinic-schema.test.ts`
Expected: PASS, 26 tests.

- [ ] **Step 5: Write the failing resolver test**

`tests/unit/resolve-availability.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveAvailability, type AvailabilityRow } from "@/server/services/availability";
import type { OpeningHours } from "@/lib/zod/clinic";

/** 2026-09-15 is a Tuesday; getUTCDay() returns 2. */
const TUESDAY = "2026-09-15";
const WEDNESDAY = "2026-09-16";

const openWeek: OpeningHours = {
  monday: { open: "08:00", close: "17:00" },
  tuesday: { open: "08:00", close: "17:00" },
  wednesday: { open: "08:00", close: "17:00" },
  thursday: { open: "08:00", close: "17:00" },
  friday: { open: "08:00", close: "17:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: null,
};

function recurring(dayOfWeek: number, startTime: string, endTime: string, isBlocked = false): AvailabilityRow {
  return { dayOfWeek, specificDate: null, startTime, endTime, isBlocked };
}

function dated(date: string, startTime: string, endTime: string, isBlocked = false): AvailabilityRow {
  return { dayOfWeek: null, specificDate: new Date(`${date}T00:00:00.000Z`), startTime, endTime, isBlocked };
}

describe("resolveAvailability", () => {
  it("returns the recurring window on a matching weekday", () => {
    const rows = [recurring(2, "09:00", "13:00")];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([{ start: "09:00", end: "13:00" }]);
  });

  it("returns nothing on a weekday with no recurring row", () => {
    const rows = [recurring(2, "09:00", "13:00")];
    expect(resolveAvailability(WEDNESDAY, rows, openWeek)).toEqual([]);
  });

  it("returns nothing when the therapist has no rows at all", () => {
    expect(resolveAvailability(TUESDAY, [], openWeek)).toEqual([]);
  });

  it("lets a dated row override the recurring pattern entirely", () => {
    // Spec §3.2: the recurring 09:00-13:00 is discarded, not merged.
    const rows = [recurring(2, "09:00", "13:00"), dated(TUESDAY, "14:00", "16:00")];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([{ start: "14:00", end: "16:00" }]);
  });

  it("yields nothing when a dated blocked row covers a normally-working day", () => {
    const rows = [recurring(2, "09:00", "13:00"), dated(TUESDAY, "00:00", "23:59", true)];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([]);
  });

  it("leaves other dates untouched when a dated row exists", () => {
    const rows = [recurring(2, "09:00", "13:00"), recurring(3, "09:00", "13:00"), dated(TUESDAY, "14:00", "16:00")];
    expect(resolveAvailability(WEDNESDAY, rows, openWeek)).toEqual([{ start: "09:00", end: "13:00" }]);
  });

  it("splits a window when a recurring block falls inside it", () => {
    const rows = [recurring(2, "08:00", "17:00"), recurring(2, "12:00", "13:00", true)];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([
      { start: "08:00", end: "12:00" },
      { start: "13:00", end: "17:00" },
    ]);
  });

  it("truncates a window that runs past closing time", () => {
    const rows = [recurring(2, "08:00", "20:00")];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([{ start: "08:00", end: "17:00" }]);
  });

  it("truncates a window that starts before opening time", () => {
    const rows = [recurring(2, "06:00", "12:00")];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([{ start: "08:00", end: "12:00" }]);
  });

  it("returns nothing when the clinic is closed, however available the therapist", () => {
    const rows = [recurring(0, "09:00", "17:00")]; // Sunday
    expect(resolveAvailability("2026-09-20", rows, openWeek)).toEqual([]);
  });

  it("merges two adjacent recurring windows", () => {
    const rows = [recurring(2, "08:00", "12:00"), recurring(2, "12:00", "16:00")];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([{ start: "08:00", end: "16:00" }]);
  });

  it("keeps a genuine gap between two windows", () => {
    const rows = [recurring(2, "08:00", "11:00"), recurring(2, "14:00", "17:00")];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([
      { start: "08:00", end: "11:00" },
      { start: "14:00", end: "17:00" },
    ]);
  });

  it("applies a dated block only against dated open windows", () => {
    const rows = [dated(TUESDAY, "08:00", "17:00"), dated(TUESDAY, "12:00", "13:00", true)];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([
      { start: "08:00", end: "12:00" },
      { start: "13:00", end: "17:00" },
    ]);
  });

  it("returns nothing when a dated row is blocked-only, with no open window", () => {
    const rows = [dated(TUESDAY, "12:00", "13:00", true)];
    expect(resolveAvailability(TUESDAY, rows, openWeek)).toEqual([]);
  });

  it("respects the shorter Saturday opening hours", () => {
    const rows = [recurring(6, "08:00", "18:00")];
    expect(resolveAvailability("2026-09-19", rows, openWeek)).toEqual([
      { start: "09:00", end: "14:00" },
    ]);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/unit/resolve-availability.test.ts`
Expected: FAIL — cannot resolve `@/server/services/availability`.

- [ ] **Step 7: Implement the resolver in `src/server/services/availability.ts`**

Write only the pure part now; the CRUD functions arrive in Task 5. Do **not** add `import "server-only"` to this file — the resolver is imported by a unit test, and although `vitest.config.ts` aliases `server-only` away, keeping this module free of it makes the purity explicit.

```ts
import type { TherapistAvailability } from "@/generated/prisma/client";
import { DAY_KEYS, type OpeningHours } from "@/lib/zod/clinic";
import { intersectWindows, mergeWindows, subtractWindows, type TimeWindow } from "@/lib/time";

/** Only the fields the resolver reads, so callers can pass a partial select. */
export type AvailabilityRow = Pick<
  TherapistAvailability,
  "dayOfWeek" | "specificDate" | "startTime" | "endTime" | "isBlocked"
>;

/**
 * `specific_date` is a Postgres DATE, which Prisma hands back as a Date at UTC
 * midnight. Reading it with getUTC* avoids the local-timezone shift that would
 * make `toISOString().slice(0, 10)` wrong for anyone west of UTC.
 */
function toDateKey(value: Date): string {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 0 = Sunday, matching Postgres EXTRACT(DOW) and JavaScript getUTCDay(). */
function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

function dayKeyOf(dateKey: string): (typeof DAY_KEYS)[number] {
  const weekday = weekdayOf(dateKey);
  // DAY_KEYS is Monday-first; getUTCDay is Sunday-first.
  const index = weekday === 0 ? 6 : weekday - 1;
  return DAY_KEYS[index]!;
}

function toWindow(row: AvailabilityRow): TimeWindow {
  return { start: row.startTime, end: row.endTime };
}

/**
 * A therapist's bookable windows on one date, in Africa/Lagos wall-clock.
 *
 * Pure: no database handle, no clock. This is the contract sub-project 3's
 * booking engine consumes, so it must be exhaustively testable (spec §4.1).
 *
 * Precedence, per spec §3.2: if ANY dated row matches the date, the recurring
 * rows are discarded entirely for that date. Within the winning set, blocked
 * windows subtract from open ones. The result is intersected with clinic
 * opening hours last, so a therapist can never be available while the clinic is
 * shut.
 *
 * @param dateKey YYYY-MM-DD
 */
export function resolveAvailability(
  dateKey: string,
  rows: AvailabilityRow[],
  openingHours: OpeningHours,
): TimeWindow[] {
  const clinicDay = openingHours[dayKeyOf(dateKey)];
  if (clinicDay === null) return [];

  const dated = rows.filter((r) => r.specificDate !== null && toDateKey(r.specificDate) === dateKey);

  const weekday = weekdayOf(dateKey);
  const recurring = rows.filter((r) => r.specificDate === null && r.dayOfWeek === weekday);

  const winning = dated.length > 0 ? dated : recurring;

  const open = winning.filter((r) => !r.isBlocked).map(toWindow);
  const blocked = winning.filter((r) => r.isBlocked).map(toWindow);

  const afterBlocks = subtractWindows(open, blocked);

  return mergeWindows(
    intersectWindows(afterBlocks, [{ start: clinicDay.open, end: clinicDay.close }]),
  );
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run tests/unit/resolve-availability.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 9: Verify typecheck, lint and the whole suite**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: all clean; the suite grows to 13 files.

- [ ] **Step 10: Commit**

```bash
git add src/lib/zod/clinic.ts src/server/services/availability.ts tests/unit/clinic-schema.test.ts tests/unit/resolve-availability.test.ts
git commit -m "feat: add clinic Zod schemas and the availability resolver

One schema guards the openingHours JSON column in both directions, so a
hand-edited row fails at the boundary rather than inside sub-project 3's slot
generation (spec 3.1). parseOpeningHours degrades an empty column to
all-closed so a fresh database renders the settings form instead of throwing.

resolveAvailability is pure — no database handle, no clock — because it is
the contract the booking engine will depend on. A dated row overrides the
recurring pattern entirely for that date, blocks subtract, and clinic opening
hours are intersected last so a therapist can never be available while the
clinic is shut (spec 3.2).

Prices stay decimal strings all the way to Prisma rather than passing through
a JS number, so a money value cannot pick up a float artefact."
```

---

## Task 4: Clinic settings and testimonial services

**Files:**
- Create: `src/server/services/clinic-settings.ts`, `src/server/services/testimonial.ts`
- Create: `tests/integration/clinic-settings.test.ts`, `tests/integration/testimonial.test.ts`

**Interfaces:**
- Consumes: `prisma` (`src/server/db.ts`), `parseOpeningHours`, `openingHoursSchema`, `EMPTY_OPENING_HOURS`, `type OpeningHours`, `type ClinicSettingsInput`, `type TestimonialInput` (Task 3)
- Produces:
  - `clinic-settings.ts` exports `type ClinicSettingsView`, `getClinicSettings(): Promise<ClinicSettingsView>`, `updateClinicSettings(input: ClinicSettingsInput): Promise<void>`, `updateOpeningHours(hours: OpeningHours): Promise<void>`
  - `testimonial.ts` exports `listTestimonials(): Promise<Testimonial[]>`, `listPublishedTestimonials(): Promise<Testimonial[]>`, `createTestimonial(input: TestimonialInput): Promise<void>`, `updateTestimonial(id: string, input: TestimonialInput): Promise<void>`, `setTestimonialPublished(id: string, published: boolean): Promise<void>`, `deleteTestimonial(id: string): Promise<void>`, `reorderTestimonials(ids: string[]): Promise<void>`

`ClinicSettingsView` is the row with `openingHours` replaced by the parsed type, so no consumer ever touches raw JSON:

```ts
export type ClinicSettingsView = Omit<ClinicSettings, "openingHours"> & {
  openingHours: OpeningHours;
};
```

- [ ] **Step 1: Write the failing clinic-settings test**

`tests/integration/clinic-settings.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import {
  getClinicSettings,
  updateClinicSettings,
  updateOpeningHours,
} from "@/server/services/clinic-settings";
import { EMPTY_OPENING_HOURS, type OpeningHours } from "@/lib/zod/clinic";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

const hours: OpeningHours = {
  monday: { open: "08:00", close: "17:00" },
  tuesday: { open: "08:00", close: "17:00" },
  wednesday: { open: "08:00", close: "17:00" },
  thursday: { open: "08:00", close: "17:00" },
  friday: { open: "08:00", close: "17:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: null,
};

const settingsInput = {
  clinicName: "TetaPhysio Lagos",
  tagline: "Movement is medicine",
  logoUrl: null,
  aboutContent: "We have served Lagos since 2019.",
  contactPhone: "08031234567",
  contactWhatsapp: "08031234567",
  contactEmail: "hello@tetaphysio.ng",
  address: "12 Awolowo Road, Ikoyi",
  bookingLeadTimeHours: 0,
  rescheduleCutoffHours: 2,
  cancellationCutoffHours: 2,
};

describe("clinic settings", () => {
  it("creates the singleton on first read rather than throwing", async () => {
    expect(await testPrisma.clinicSettings.count()).toBe(0);

    const settings = await getClinicSettings();

    expect(settings.id).toBe(1);
    expect(settings.openingHours).toEqual(EMPTY_OPENING_HOURS);
    expect(await testPrisma.clinicSettings.count()).toBe(1);
  });

  it("is idempotent on repeated reads — never a second row", async () => {
    await getClinicSettings();
    await getClinicSettings();
    expect(await testPrisma.clinicSettings.count()).toBe(1);
  });

  it("persists an update and reads it back", async () => {
    await updateClinicSettings(settingsInput);

    const settings = await getClinicSettings();
    expect(settings.clinicName).toBe("TetaPhysio Lagos");
    expect(settings.rescheduleCutoffHours).toBe(2);
    expect(settings.contactEmail).toBe("hello@tetaphysio.ng");
  });

  it("does not clobber opening hours when other settings change", async () => {
    await updateOpeningHours(hours);
    await updateClinicSettings(settingsInput);

    expect((await getClinicSettings()).openingHours).toEqual(hours);
  });

  it("round-trips opening hours through the JSON column", async () => {
    await updateOpeningHours(hours);

    const settings = await getClinicSettings();
    expect(settings.openingHours.monday).toEqual({ open: "08:00", close: "17:00" });
    expect(settings.openingHours.saturday).toEqual({ open: "09:00", close: "14:00" });
    expect(settings.openingHours.sunday).toBeNull();
  });

  it("rejects opening hours whose close precedes open", async () => {
    const bad = { ...hours, monday: { open: "17:00", close: "08:00" } } as OpeningHours;
    await expect(updateOpeningHours(bad)).rejects.toThrow();
  });

  it("throws on read when the stored JSON is malformed", async () => {
    await updateOpeningHours(hours);
    // Simulate a hand-edited row. Spec §3.1 requires this to fail at the
    // boundary, not silently inside the booking engine.
    await testPrisma.$executeRaw`
      UPDATE clinic_settings SET opening_hours = '{"monday":{"open":"08:00"}}'::jsonb WHERE id = 1
    `;

    await expect(getClinicSettings()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/integration/clinic-settings.test.ts`
Expected: FAIL — cannot resolve `@/server/services/clinic-settings`.

- [ ] **Step 3: Implement `src/server/services/clinic-settings.ts`**

```ts
import "server-only";
import type { ClinicSettings } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import {
  EMPTY_OPENING_HOURS,
  openingHoursSchema,
  parseOpeningHours,
  type ClinicSettingsInput,
  type OpeningHours,
} from "@/lib/zod/clinic";

/** The row with openingHours already parsed, so no consumer touches raw JSON. */
export type ClinicSettingsView = Omit<ClinicSettings, "openingHours"> & {
  openingHours: OpeningHours;
};

/** clinic_settings is a singleton pinned to id 1 (spec §4.3). */
const SINGLETON_ID = 1;

function toView(row: ClinicSettings): ClinicSettingsView {
  return { ...row, openingHours: parseOpeningHours(row.openingHours) };
}

/**
 * Upsert rather than findUniqueOrThrow, so a fresh database with no seed renders
 * an empty settings form instead of a 500 (spec §4.3).
 */
export async function getClinicSettings(): Promise<ClinicSettingsView> {
  const row = await prisma.clinicSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
  return toView(row);
}

export async function updateClinicSettings(input: ClinicSettingsInput): Promise<void> {
  // `create` omits openingHours deliberately: the column default applies on
  // insert, and an update must never touch it. Hours have their own writer.
  await prisma.clinicSettings.upsert({
    where: { id: SINGLETON_ID },
    update: input,
    create: { id: SINGLETON_ID, ...input },
  });
}

export async function updateOpeningHours(hours: OpeningHours): Promise<void> {
  // Validate before persisting, even though the action already parsed: this is
  // the service boundary, and a future caller might not have.
  const parsed = openingHoursSchema.parse(hours);

  await prisma.clinicSettings.upsert({
    where: { id: SINGLETON_ID },
    update: { openingHours: parsed },
    create: { id: SINGLETON_ID, openingHours: parsed },
  });
}

export { EMPTY_OPENING_HOURS };
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/integration/clinic-settings.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the failing testimonial test**

`tests/integration/testimonial.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import {
  createTestimonial,
  deleteTestimonial,
  listPublishedTestimonials,
  listTestimonials,
  reorderTestimonials,
  setTestimonialPublished,
  updateTestimonial,
} from "@/server/services/testimonial";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("testimonials", () => {
  it("creates one, unpublished by default", async () => {
    await createTestimonial({ patientName: "Ada O.", content: "Walking again.", published: false });

    const all = await listTestimonials();
    expect(all).toHaveLength(1);
    expect(all[0]!.published).toBe(false);
  });

  it("excludes unpublished ones from the published list", async () => {
    await createTestimonial({ patientName: "Ada O.", content: "Walking again.", published: false });
    await createTestimonial({ patientName: "Emeka N.", content: "Back pain gone.", published: true });

    expect(await listTestimonials()).toHaveLength(2);

    const published = await listPublishedTestimonials();
    expect(published).toHaveLength(1);
    expect(published[0]!.patientName).toBe("Emeka N.");
  });

  it("toggles published state", async () => {
    await createTestimonial({ patientName: "Ada O.", content: "Walking again.", published: false });
    const [row] = await listTestimonials();

    await setTestimonialPublished(row!.id, true);
    expect(await listPublishedTestimonials()).toHaveLength(1);

    await setTestimonialPublished(row!.id, false);
    expect(await listPublishedTestimonials()).toHaveLength(0);
  });

  it("updates name and content", async () => {
    await createTestimonial({ patientName: "Ada O.", content: "Walking again.", published: true });
    const [row] = await listTestimonials();

    await updateTestimonial(row!.id, {
      patientName: "Ada Obi",
      content: "I am walking again.",
      published: true,
    });

    const [updated] = await listTestimonials();
    expect(updated!.patientName).toBe("Ada Obi");
    expect(updated!.content).toBe("I am walking again.");
  });

  it("deletes one", async () => {
    await createTestimonial({ patientName: "Ada O.", content: "Walking again.", published: true });
    const [row] = await listTestimonials();

    await deleteTestimonial(row!.id);

    expect(await listTestimonials()).toHaveLength(0);
  });

  it("orders both lists by sortOrder", async () => {
    await createTestimonial({ patientName: "First", content: "A", published: true });
    await createTestimonial({ patientName: "Second", content: "B", published: true });
    await createTestimonial({ patientName: "Third", content: "C", published: true });

    const rows = await listTestimonials();
    expect(rows.map((r) => r.patientName)).toEqual(["First", "Second", "Third"]);

    await reorderTestimonials([rows[2]!.id, rows[0]!.id, rows[1]!.id]);

    expect((await listTestimonials()).map((r) => r.patientName)).toEqual([
      "Third",
      "First",
      "Second",
    ]);
    expect((await listPublishedTestimonials()).map((r) => r.patientName)).toEqual([
      "Third",
      "First",
      "Second",
    ]);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/integration/testimonial.test.ts`
Expected: FAIL — cannot resolve `@/server/services/testimonial`.

- [ ] **Step 7: Implement `src/server/services/testimonial.ts`**

```ts
import "server-only";
import type { Testimonial } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { TestimonialInput } from "@/lib/zod/clinic";

/** Newest last, so a freshly created testimonial appends rather than jumping the queue. */
const byOrder = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];

export async function listTestimonials(): Promise<Testimonial[]> {
  return prisma.testimonial.findMany({ orderBy: byOrder });
}

/** What the public site (sub-project 4) renders. */
export async function listPublishedTestimonials(): Promise<Testimonial[]> {
  return prisma.testimonial.findMany({ where: { published: true }, orderBy: byOrder });
}

export async function createTestimonial(input: TestimonialInput): Promise<void> {
  const count = await prisma.testimonial.count();
  await prisma.testimonial.create({ data: { ...input, sortOrder: count } });
}

export async function updateTestimonial(id: string, input: TestimonialInput): Promise<void> {
  await prisma.testimonial.update({ where: { id }, data: input });
}

export async function setTestimonialPublished(id: string, published: boolean): Promise<void> {
  await prisma.testimonial.update({ where: { id }, data: { published } });
}

export async function deleteTestimonial(id: string): Promise<void> {
  // A testimonial carries no clinical or financial history, so a hard delete is
  // correct here — unlike patients, services and appointments (PRD-06 FR2).
  await prisma.testimonial.delete({ where: { id } });
}

/** Persists the given order as sortOrder 0..n-1, in one transaction. */
export async function reorderTestimonials(ids: string[]): Promise<void> {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.testimonial.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run tests/integration/testimonial.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 9: Verify typecheck, lint and the whole suite**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: all clean; 15 files.

- [ ] **Step 10: Commit**

```bash
git add src/server/services/clinic-settings.ts src/server/services/testimonial.ts tests/integration/clinic-settings.test.ts tests/integration/testimonial.test.ts
git commit -m "feat: add clinic settings and testimonial services

getClinicSettings upserts the id-1 singleton rather than throwing, so a fresh
database with no seed renders an empty form instead of a 500 (spec 4.3). It
returns openingHours already parsed, so no consumer ever handles raw JSON.

updateClinicSettings deliberately never writes openingHours — hours have
their own writer, so saving contact details cannot clobber the schedule. A
test covers exactly that.

Another test corrupts the JSON column with raw SQL and asserts the read
throws, which is the guarantee spec 3.1 is buying.

Testimonials hard-delete, unlike patients and services: they carry no
clinical or financial history, so PRD-06 FR2's soft-delete rule does not
apply."
```

---

## Task 5: Service catalog and availability CRUD

**Files:**
- Create: `src/server/services/service-catalog.ts`
- Modify: `src/server/services/availability.ts` (append CRUD below the resolver)
- Create: `tests/integration/service-catalog.test.ts`, `tests/integration/availability.test.ts`

**Interfaces:**
- Consumes: `prisma`, `slugify` (Task 2), `type ServiceInput`, `type AvailabilityInput`, `parseOpeningHours` (Task 3), `resolveAvailability` (Task 3)
- Produces:
  - `service-catalog.ts` exports `listServices(): Promise<Service[]>`, `listActiveServices(): Promise<Service[]>`, `getService(id: string): Promise<Service | null>`, `getServiceBySlug(slug: string): Promise<Service | null>`, `createService(input: ServiceInput): Promise<Service>`, `updateService(id: string, input: ServiceInput): Promise<void>`, `setServiceActive(id: string, active: boolean): Promise<void>`, `reorderServices(ids: string[]): Promise<void>`
  - `availability.ts` additionally exports `listTherapists(): Promise<TherapistOption[]>`, `type TherapistOption = { id: string; name: string }`, `listAvailability(therapistId: string): Promise<TherapistAvailability[]>`, `createAvailability(input: AvailabilityInput): Promise<void>`, `deleteAvailability(id: string): Promise<void>`, `getAvailabilityForDate(therapistId: string, dateKey: string): Promise<TimeWindow[]>`

`getAvailabilityForDate` is the database-backed wrapper sub-project 3 will call: it loads the rows and the opening hours, then delegates to the pure `resolveAvailability`.

- [ ] **Step 1: Write the failing service-catalog test**

`tests/integration/service-catalog.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import {
  createService,
  getService,
  getServiceBySlug,
  listActiveServices,
  listServices,
  reorderServices,
  setServiceActive,
  updateService,
} from "@/server/services/service-catalog";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

const input = {
  name: "Sports Injury Rehabilitation",
  description: "Recovery from sports injury",
  defaultDurationMinutes: 60,
  defaultPrice: "20000.00",
  imageUrl: null,
};

describe("service catalog", () => {
  it("creates a service and derives its slug", async () => {
    const created = await createService(input);
    expect(created.slug).toBe("sports-injury-rehabilitation");
    expect(created.active).toBe(true);
    expect(created.defaultPrice.toString()).toBe("20000.00");
  });

  it("appends -2 when a slug already exists", async () => {
    await createService(input);
    const second = await createService(input);
    expect(second.slug).toBe("sports-injury-rehabilitation-2");

    const third = await createService(input);
    expect(third.slug).toBe("sports-injury-rehabilitation-3");
  });

  it("avoids a slug held by a soft-deleted row", async () => {
    const first = await createService(input);
    // slug is @unique at the database level, so a soft-deleted row still owns it.
    await testPrisma.service.update({ where: { id: first.id }, data: { deletedAt: new Date() } });

    const second = await createService(input);
    expect(second.slug).toBe("sports-injury-rehabilitation-2");
  });

  it("orders by sortOrder then name", async () => {
    await createService({ ...input, name: "Pain Management" });
    await createService({ ...input, name: "Neurological Rehabilitation" });

    expect((await listServices()).map((s) => s.name)).toEqual([
      "Pain Management",
      "Neurological Rehabilitation",
    ]);
  });

  it("persists a new order", async () => {
    const a = await createService({ ...input, name: "Alpha" });
    const b = await createService({ ...input, name: "Bravo" });
    const c = await createService({ ...input, name: "Charlie" });

    await reorderServices([c.id, a.id, b.id]);

    expect((await listServices()).map((s) => s.name)).toEqual(["Charlie", "Alpha", "Bravo"]);
  });

  it("excludes deactivated services from the active list but keeps them findable by id", async () => {
    const created = await createService(input);

    await setServiceActive(created.id, false);

    expect(await listActiveServices()).toHaveLength(0);
    expect(await listServices()).toHaveLength(1);
    // Historical appointments and invoices must still resolve the name (spec §3.3).
    expect((await getService(created.id))?.name).toBe("Sports Injury Rehabilitation");
  });

  it("reactivates a deactivated service", async () => {
    const created = await createService(input);
    await setServiceActive(created.id, false);
    await setServiceActive(created.id, true);
    expect(await listActiveServices()).toHaveLength(1);
  });

  it("excludes soft-deleted services from every read", async () => {
    const created = await createService(input);
    await testPrisma.service.update({ where: { id: created.id }, data: { deletedAt: new Date() } });

    expect(await listServices()).toHaveLength(0);
    expect(await listActiveServices()).toHaveLength(0);
    expect(await getService(created.id)).toBeNull();
    expect(await getServiceBySlug("sports-injury-rehabilitation")).toBeNull();
  });

  it("finds an active service by slug, for the public site", async () => {
    await createService(input);
    const found = await getServiceBySlug("sports-injury-rehabilitation");
    expect(found?.name).toBe("Sports Injury Rehabilitation");
  });

  it("updates a service without changing its slug", async () => {
    const created = await createService(input);

    await updateService(created.id, { ...input, name: "Sports Rehab", defaultPrice: "25000.00" });

    const updated = await getService(created.id);
    expect(updated?.name).toBe("Sports Rehab");
    expect(updated?.defaultPrice.toString()).toBe("25000.00");
    // The slug is a public URL (sub-project 4). Renaming must not break an
    // existing link.
    expect(updated?.slug).toBe("sports-injury-rehabilitation");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/integration/service-catalog.test.ts`
Expected: FAIL — cannot resolve `@/server/services/service-catalog`.

- [ ] **Step 3: Implement `src/server/services/service-catalog.ts`**

```ts
import "server-only";
import type { Service } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { slugify } from "@/lib/slug";
import type { ServiceInput } from "@/lib/zod/clinic";

/**
 * Soft-delete filter (spec §4.4). Prisma has no global filter, so it lives here
 * and every read in this module composes it. Never inline `deletedAt` in an
 * action or a page.
 */
const notDeleted = { deletedAt: null } as const;

const byOrder = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

export async function listServices(): Promise<Service[]> {
  return prisma.service.findMany({ where: notDeleted, orderBy: byOrder });
}

/** What the public site and the booking form show (spec §3.3). */
export async function listActiveServices(): Promise<Service[]> {
  return prisma.service.findMany({ where: { ...notDeleted, active: true }, orderBy: byOrder });
}

export async function getService(id: string): Promise<Service | null> {
  return prisma.service.findFirst({ where: { id, ...notDeleted } });
}

export async function getServiceBySlug(slug: string): Promise<Service | null> {
  return prisma.service.findFirst({ where: { slug, ...notDeleted } });
}

/**
 * `slug` is @unique at the database level, so a soft-deleted row still owns its
 * slug. The collision check therefore ignores `deletedAt` deliberately —
 * otherwise this would generate a slug that then fails to insert.
 */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "service";

  for (let suffix = 1; ; suffix++) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const taken = await prisma.service.findUnique({ where: { slug: candidate } });
    if (!taken) return candidate;
  }
}

export async function createService(input: ServiceInput): Promise<Service> {
  const count = await prisma.service.count();
  return prisma.service.create({
    data: { ...input, slug: await uniqueSlug(input.name), sortOrder: count },
  });
}

/**
 * Deliberately does not regenerate the slug. It is a public URL (sub-project 4),
 * so renaming a service must not break an existing link.
 */
export async function updateService(id: string, input: ServiceInput): Promise<void> {
  await prisma.service.update({ where: { id }, data: input });
}

/** PRD-06 FR2 prefers deactivation over deletion; the UI exposes only this (spec §3.3). */
export async function setServiceActive(id: string, active: boolean): Promise<void> {
  await prisma.service.update({ where: { id }, data: { active } });
}

export async function reorderServices(ids: string[]): Promise<void> {
  await prisma.$transaction(
    ids.map((id, index) => prisma.service.update({ where: { id }, data: { sortOrder: index } })),
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/integration/service-catalog.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Write the failing availability CRUD test**

`tests/integration/availability.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import {
  createAvailability,
  deleteAvailability,
  getAvailabilityForDate,
  listAvailability,
  listTherapists,
} from "@/server/services/availability";
import { updateOpeningHours } from "@/server/services/clinic-settings";
import type { OpeningHours } from "@/lib/zod/clinic";

const openWeek: OpeningHours = {
  monday: { open: "08:00", close: "17:00" },
  tuesday: { open: "08:00", close: "17:00" },
  wednesday: { open: "08:00", close: "17:00" },
  thursday: { open: "08:00", close: "17:00" },
  friday: { open: "08:00", close: "17:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: null,
};

/** 2026-09-15 is a Tuesday. */
const TUESDAY = "2026-09-15";

beforeEach(async () => {
  await truncateAll();
  await updateOpeningHours(openWeek);
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function makeTherapist(name: string, phone: string) {
  const user = await testPrisma.user.create({
    data: { name, phone, passwordHash: "x", role: "therapist" },
  });
  await testPrisma.staffProfile.create({ data: { userId: user.id } });
  return user;
}

describe("listTherapists", () => {
  it("returns active therapists only, by name", async () => {
    await makeTherapist("Dr. Zainab Yusuf", "+2348010000002");
    await makeTherapist("Dr. Adaeze Eze", "+2348010000001");
    await testPrisma.user.create({
      data: { name: "Front Desk", phone: "+2348010000003", passwordHash: "x", role: "receptionist" },
    });

    const therapists = await listTherapists();
    expect(therapists.map((t) => t.name)).toEqual(["Dr. Adaeze Eze", "Dr. Zainab Yusuf"]);
  });

  it("excludes a deactivated therapist", async () => {
    const t = await makeTherapist("Dr. Gone", "+2348010000004");
    await testPrisma.user.update({ where: { id: t.id }, data: { status: "inactive" } });
    expect(await listTherapists()).toHaveLength(0);
  });

  it("excludes a soft-deleted therapist", async () => {
    const t = await makeTherapist("Dr. Deleted", "+2348010000005");
    await testPrisma.user.update({ where: { id: t.id }, data: { deletedAt: new Date() } });
    expect(await listTherapists()).toHaveLength(0);
  });
});

describe("availability CRUD", () => {
  it("creates a recurring window", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");

    await createAvailability({
      therapistId: t.id,
      kind: "recurring",
      dayOfWeek: 2,
      specificDate: null,
      startTime: "09:00",
      endTime: "13:00",
      isBlocked: false,
      reason: null,
    });

    const rows = await listAvailability(t.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dayOfWeek).toBe(2);
    expect(rows[0]!.specificDate).toBeNull();
  });

  it("creates a dated block with a reason", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");

    await createAvailability({
      therapistId: t.id,
      kind: "dated",
      dayOfWeek: null,
      specificDate: TUESDAY,
      startTime: "00:00",
      endTime: "23:59",
      isBlocked: true,
      reason: "Annual leave",
    });

    const rows = await listAvailability(t.id);
    expect(rows[0]!.isBlocked).toBe(true);
    expect(rows[0]!.reason).toBe("Annual leave");
    expect(rows[0]!.specificDate).not.toBeNull();
  });

  it("scopes the list to one therapist", async () => {
    const a = await makeTherapist("Dr. A", "+2348010000001");
    const b = await makeTherapist("Dr. B", "+2348010000002");

    const base = {
      kind: "recurring" as const,
      dayOfWeek: 2,
      specificDate: null,
      startTime: "09:00",
      endTime: "13:00",
      isBlocked: false,
      reason: null,
    };
    await createAvailability({ ...base, therapistId: a.id });
    await createAvailability({ ...base, therapistId: b.id });

    expect(await listAvailability(a.id)).toHaveLength(1);
    expect(await listAvailability(b.id)).toHaveLength(1);
  });

  it("deletes a row", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    await createAvailability({
      therapistId: t.id,
      kind: "recurring",
      dayOfWeek: 2,
      specificDate: null,
      startTime: "09:00",
      endTime: "13:00",
      isBlocked: false,
      reason: null,
    });
    const [row] = await listAvailability(t.id);

    await deleteAvailability(row!.id);

    expect(await listAvailability(t.id)).toHaveLength(0);
  });
});

describe("getAvailabilityForDate", () => {
  it("intersects the recurring window with clinic hours", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    await createAvailability({
      therapistId: t.id,
      kind: "recurring",
      dayOfWeek: 2,
      specificDate: null,
      startTime: "06:00",
      endTime: "20:00",
      isBlocked: false,
      reason: null,
    });

    expect(await getAvailabilityForDate(t.id, TUESDAY)).toEqual([
      { start: "08:00", end: "17:00" },
    ]);
  });

  it("lets a dated row override the recurring pattern, end to end", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    await createAvailability({
      therapistId: t.id,
      kind: "recurring",
      dayOfWeek: 2,
      specificDate: null,
      startTime: "09:00",
      endTime: "13:00",
      isBlocked: false,
      reason: null,
    });
    await createAvailability({
      therapistId: t.id,
      kind: "dated",
      dayOfWeek: null,
      specificDate: TUESDAY,
      startTime: "14:00",
      endTime: "16:00",
      isBlocked: false,
      reason: "Clinic day",
    });

    expect(await getAvailabilityForDate(t.id, TUESDAY)).toEqual([
      { start: "14:00", end: "16:00" },
    ]);
  });

  it("returns nothing on a day the clinic is closed", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    await createAvailability({
      therapistId: t.id,
      kind: "recurring",
      dayOfWeek: 0,
      specificDate: null,
      startTime: "09:00",
      endTime: "17:00",
      isBlocked: false,
      reason: null,
    });

    expect(await getAvailabilityForDate(t.id, "2026-09-20")).toEqual([]);
  });

  it("returns nothing for a therapist with no rows", async () => {
    const t = await makeTherapist("Dr. A", "+2348010000001");
    expect(await getAvailabilityForDate(t.id, TUESDAY)).toEqual([]);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/integration/availability.test.ts`
Expected: FAIL — `createAvailability` is not exported.

- [ ] **Step 7: Append the CRUD functions to `src/server/services/availability.ts`**

Add these imports at the top of the existing file:

```ts
import { prisma } from "@/server/db";
import { getClinicSettings } from "@/server/services/clinic-settings";
import type { AvailabilityInput } from "@/lib/zod/clinic";
```

Then append below the existing `resolveAvailability`:

```ts
// ─────────────────── Database-backed operations ───────────────────
// Everything above this line is pure. Everything below touches the database.

export type TherapistOption = { id: string; name: string };

/** Only therapists who can actually be scheduled: active and not soft-deleted. */
export async function listTherapists(): Promise<TherapistOption[]> {
  return prisma.user.findMany({
    where: { role: "therapist", status: "active", deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listAvailability(therapistId: string): Promise<TherapistAvailability[]> {
  return prisma.therapistAvailability.findMany({
    where: { therapistId },
    orderBy: [
      { specificDate: "asc" },
      { dayOfWeek: "asc" },
      { startTime: "asc" },
    ],
  });
}

export async function createAvailability(input: AvailabilityInput): Promise<void> {
  await prisma.therapistAvailability.create({
    data: {
      therapistId: input.therapistId,
      dayOfWeek: input.dayOfWeek,
      // A DATE column: parse at UTC midnight so no local-timezone shift moves
      // the date by a day.
      specificDate: input.specificDate ? new Date(`${input.specificDate}T00:00:00.000Z`) : null,
      startTime: input.startTime,
      endTime: input.endTime,
      isBlocked: input.isBlocked,
      reason: input.reason,
    },
  });
}

export async function deleteAvailability(id: string): Promise<void> {
  // Availability carries no historical significance — a removed window is not a
  // record of anything — so a hard delete is correct (cf. PRD-06 FR2).
  await prisma.therapistAvailability.delete({ where: { id } });
}

/**
 * The database-backed wrapper sub-project 3's booking engine calls. It loads the
 * rows and the clinic's opening hours, then delegates to the pure resolver.
 */
export async function getAvailabilityForDate(
  therapistId: string,
  dateKey: string,
): Promise<TimeWindow[]> {
  const [rows, settings] = await Promise.all([
    listAvailability(therapistId),
    getClinicSettings(),
  ]);
  return resolveAvailability(dateKey, rows, settings.openingHours);
}
```

Note: `availability.ts` now imports `prisma`, so add `import "server-only"` at the very top of the file — the unit test only imports `resolveAvailability`, and `vitest.config.ts` already aliases `server-only` to an empty module, so the pure test keeps working.

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run tests/integration/availability.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 9: Confirm the pure resolver test still passes**

Run: `npx vitest run tests/unit/resolve-availability.test.ts`
Expected: PASS, 15 tests. If this now fails on the `server-only` import, the `vitest.config.ts` alias has been disturbed — restore it rather than removing the import.

- [ ] **Step 10: Verify typecheck, lint and the whole suite**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: all clean; 17 files.

- [ ] **Step 11: Commit**

```bash
git add src/server/services/service-catalog.ts src/server/services/availability.ts tests/integration/service-catalog.test.ts tests/integration/availability.test.ts
git commit -m "feat: add service catalog and availability CRUD

Slug collisions append -2, -3 and so on, checked WITHOUT the deletedAt filter
on purpose: slug is unique at the database level, so a soft-deleted row still
owns its slug and ignoring that would generate a slug that fails to insert.

updateService never regenerates the slug — it is a public URL in sub-project
4, so renaming a service must not break an existing link.

Deactivated services leave the active list but stay findable by id, so
historical appointments and invoices still resolve the name (spec 3.3).

getAvailabilityForDate is the database-backed wrapper the booking engine will
call: it loads rows plus opening hours and delegates to the pure resolver, so
the precedence logic has exactly one implementation."
```

---

## Task 6: Action state and form primitives

**Files:**
- Create: `src/server/action-state.ts`, `src/components/SubmitButton.tsx`, `src/components/FormStatus.tsx`, `src/components/Card.tsx`
- Create: `tests/unit/action-state.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `src/server/action-state.ts` exports `type ActionState`, `IDLE_STATE`, `actionOk(message: string): ActionState`, `actionFailed(message: string): ActionState`, `toFieldErrors(error: ZodError, message?: string): ActionState`
  - `src/components/SubmitButton.tsx` exports `SubmitButton({ children, variant }: { children: React.ReactNode; variant?: "primary" | "destructive" })`
  - `src/components/FormStatus.tsx` exports `FormStatus({ state }: { state: ActionState })`
  - `src/components/Card.tsx` exports `Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode })`

```ts
export type ActionState =
  | { ok: true; message: string }
  | { ok: false; message?: string; fieldErrors: Record<string, string> }
  | { ok: null };  // idle — nothing submitted yet
```

The third variant matters: `useActionState` needs an initial value, and without an explicit idle state the first render would show either a spurious success or a spurious error.

- [ ] **Step 1: Write the failing action-state test**

`tests/unit/action-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { actionFailed, actionOk, IDLE_STATE, toFieldErrors } from "@/server/action-state";

describe("action state", () => {
  it("has an idle state that is neither success nor failure", () => {
    expect(IDLE_STATE.ok).toBeNull();
  });

  it("builds a success state", () => {
    const state = actionOk("Settings saved");
    expect(state).toEqual({ ok: true, message: "Settings saved" });
  });

  it("builds a failure state with no field errors", () => {
    const state = actionFailed("Could not reach the database");
    expect(state.ok).toBe(false);
    if (state.ok === false) {
      expect(state.message).toBe("Could not reach the database");
      expect(state.fieldErrors).toEqual({});
    }
  });

  it("maps a ZodError onto field errors keyed by field name", () => {
    const schema = z.object({
      clinicName: z.string().min(1, "Clinic name is required"),
      rescheduleCutoffHours: z.number().min(0, "Must be zero or more"),
    });
    const result = schema.safeParse({ clinicName: "", rescheduleCutoffHours: -1 });
    expect(result.success).toBe(false);
    if (result.success) return;

    const state = toFieldErrors(result.error);
    expect(state.ok).toBe(false);
    if (state.ok === false) {
      expect(state.fieldErrors.clinicName).toBe("Clinic name is required");
      expect(state.fieldErrors.rescheduleCutoffHours).toBe("Must be zero or more");
    }
  });

  it("keeps the first error when a field has several", () => {
    const schema = z.object({
      name: z.string().min(5, "Too short").regex(/^[A-Z]/, "Must start with a capital"),
    });
    const result = schema.safeParse({ name: "ab" });
    if (result.success) return;

    const state = toFieldErrors(result.error);
    if (state.ok === false) {
      expect(state.fieldErrors.name).toBe("Too short");
    }
  });

  it("keys a nested path with dots so an editor can find it", () => {
    const schema = z.object({
      monday: z.object({ open: z.string().min(5, "Use HH:MM") }),
    });
    const result = schema.safeParse({ monday: { open: "9" } });
    if (result.success) return;

    const state = toFieldErrors(result.error);
    if (state.ok === false) {
      expect(state.fieldErrors["monday.open"]).toBe("Use HH:MM");
    }
  });

  it("carries a summary message alongside field errors", () => {
    const schema = z.object({ name: z.string().min(1, "Required") });
    const result = schema.safeParse({ name: "" });
    if (result.success) return;

    const state = toFieldErrors(result.error, "Check the highlighted fields");
    if (state.ok === false) {
      expect(state.message).toBe("Check the highlighted fields");
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/action-state.test.ts`
Expected: FAIL — cannot resolve `@/server/action-state`.

- [ ] **Step 3: Implement `src/server/action-state.ts`**

No `import "server-only"` here: `ActionState` is the type the client form components consume, so this module is deliberately shared.

```ts
import type { ZodError } from "zod";

/**
 * The value every Server Action returns and every form reads via useActionState.
 *
 * `ok: null` is the idle state. useActionState needs an initial value, and
 * without an explicit idle variant the first render would show a spurious
 * success or error banner.
 */
export type ActionState =
  | { ok: true; message: string }
  | { ok: false; message?: string; fieldErrors: Record<string, string> }
  | { ok: null };

export const IDLE_STATE: ActionState = { ok: null };

export function actionOk(message: string): ActionState {
  return { ok: true, message };
}

export function actionFailed(message: string): ActionState {
  return { ok: false, message, fieldErrors: {} };
}

/**
 * Flattens a ZodError into one message per field, so each renders next to the
 * input that caused it (spec §6.2 — inline validation, not a submit-only wall of
 * text). A nested path becomes dot-joined, e.g. "monday.open".
 */
export function toFieldErrors(error: ZodError, message?: string): ActionState {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    // First error per field wins; showing three at once on one input is noise.
    if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
  }

  return { ok: false, message, fieldErrors };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/action-state.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Create `SubmitButton.tsx`**

```tsx
"use client";

import { useFormStatus } from "react-dom";

/**
 * useFormStatus reads the pending state of the enclosing form, so this needs no
 * prop threading. PRD-04 FR4 targets slow connections, and spec §6.2 makes
 * submit feedback a High-severity requirement: never a click with no response.
 */
export function SubmitButton({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "destructive";
}) {
  const { pending } = useFormStatus();

  const palette =
    variant === "destructive"
      ? "bg-destructive text-white hover:opacity-90"
      : "bg-primary text-on-primary hover:opacity-90";

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`min-h-11 cursor-pointer rounded-md px-4 py-2 text-base font-medium transition-opacity duration-200 focus:outline-none focus:ring-3 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${palette}`}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
```

- [ ] **Step 6: Create `FormStatus.tsx`**

```tsx
import type { ActionState } from "@/server/action-state";

/**
 * Success and error banner. The aria-live region means a screen reader announces
 * the outcome without a focus move; role="status" is polite, so it does not
 * interrupt typing.
 *
 * Rendered even when idle so the live region exists in the DOM before the first
 * update — an aria-live region added at the same moment as its content is often
 * not announced.
 */
export function FormStatus({ state }: { state: ActionState }) {
  return (
    <div aria-live="polite" role="status">
      {state.ok === true && (
        <p className="rounded-md bg-accent/10 px-3 py-2 text-sm font-medium text-accent">
          {state.message}
        </p>
      )}
      {state.ok === false && state.message && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {state.message}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Create `Card.tsx`**

```tsx
/**
 * The one surface every settings section sits on. Semantic <section> with a real
 * heading, so the four screens have a navigable heading outline rather than a
 * pile of styled divs.
 */
export function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-white p-6">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-1 text-sm opacity-80">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
```

- [ ] **Step 8: Verify typecheck, lint and build**

Run: `npx tsc --noEmit && npx eslint . && npx next build`
Expected: all clean.

- [ ] **Step 9: Commit**

```bash
git add src/server/action-state.ts src/components/SubmitButton.tsx src/components/FormStatus.tsx src/components/Card.tsx tests/unit/action-state.test.ts
git commit -m "feat: add action state and form primitives

ActionState carries an explicit idle variant because useActionState needs an
initial value, and without it the first render would show a spurious success
or error banner.

toFieldErrors flattens a ZodError to one message per field, dot-joining nested
paths so the opening-hours editor can address monday.open. First error per
field wins — three messages on one input is noise.

SubmitButton reads useFormStatus rather than threading a pending prop.
FormStatus keeps its aria-live region mounted even when idle, since a region
added at the same moment as its content is often not announced."
```

---

## Task 7: Settings shell and the clinic settings screen

**Files:**
- Create: `src/app/(staff)/staff/settings/layout.tsx`, `src/app/(staff)/staff/settings/page.tsx`, `src/app/(staff)/staff/settings/actions.ts`, `src/app/(staff)/staff/settings/SettingsForm.tsx`, `src/app/(staff)/staff/settings/OpeningHoursEditor.tsx`
- Modify: `src/lib/nav.ts:35` (flip Clinic settings to `available: true`)

**Interfaces:**
- Consumes: `requireRole` (`src/server/auth/rbac.ts`), `getClinicSettings`, `updateClinicSettings`, `updateOpeningHours` (Task 4), `clinicSettingsSchema`, `openingHoursSchema`, `DAY_KEYS`, `type OpeningHours` (Task 3), `ActionState`, `IDLE_STATE`, `actionOk`, `actionFailed`, `toFieldErrors` (Task 6), `FormField`, `SubmitButton`, `FormStatus`, `Card` (Tasks 1, 6)
- Produces:
  - `actions.ts` exports `saveSettings(prev: ActionState, formData: FormData): Promise<ActionState>` and `saveOpeningHours(prev: ActionState, formData: FormData): Promise<ActionState>`
  - The route `/staff/settings`

- [ ] **Step 1: Create the tab-strip layout**

`src/app/(staff)/staff/settings/layout.tsx`:

```tsx
import Link from "next/link";
import { requireRole } from "@/server/auth/rbac";

const TABS = [
  { href: "/staff/settings", label: "Clinic" },
  { href: "/staff/settings/services", label: "Services" },
  { href: "/staff/settings/availability", label: "Availability" },
  { href: "/staff/settings/content", label: "Content" },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  // Layout guard AND a guard in every page. A page must not depend on its layout
  // for authorization — the same belt-and-braces rule Foundation applies.
  await requireRole("admin");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Clinic settings</h1>
        <p className="mt-1 max-w-prose text-sm opacity-80">
          Configuration that feeds the public website and the booking engine.
        </p>
      </header>

      <nav aria-label="Settings sections" className="border-b border-border">
        <ul className="flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-t-md px-4 py-2 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted focus:outline-none focus:ring-3 focus:ring-ring"
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {children}
    </div>
  );
}
```

- [ ] **Step 2: Write the Server Actions**

`src/app/(staff)/staff/settings/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/rbac";
import {
  updateClinicSettings,
  updateOpeningHours,
} from "@/server/services/clinic-settings";
import { clinicSettingsSchema, DAY_KEYS, openingHoursSchema } from "@/lib/zod/clinic";
import {
  actionFailed,
  actionOk,
  toFieldErrors,
  type ActionState,
} from "@/server/action-state";

export async function saveSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // Authorize BEFORE parsing. A "use server" export is a public endpoint whether
  // or not a form points at it; requireRole throws, so this fails closed.
  await requireRole("admin");

  const parsed = clinicSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  try {
    await updateClinicSettings(parsed.data);
  } catch {
    return actionFailed("Could not save. Check your connection and try again.");
  }

  revalidatePath("/staff/settings");
  return actionOk("Clinic details saved");
}

export async function saveOpeningHours(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("admin");

  // Seven checkboxes plus fourteen time inputs collapse into the nested shape
  // openingHoursSchema expects. An unchecked "open" box means closed that day.
  const shape = Object.fromEntries(
    DAY_KEYS.map((day) => {
      const isOpen = formData.get(`${day}-enabled`) !== null;
      if (!isOpen) return [day, null];
      return [
        day,
        {
          open: String(formData.get(`${day}-open`) ?? ""),
          close: String(formData.get(`${day}-close`) ?? ""),
        },
      ];
    }),
  );

  const parsed = openingHoursSchema.safeParse(shape);
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted times");

  try {
    await updateOpeningHours(parsed.data);
  } catch {
    return actionFailed("Could not save. Check your connection and try again.");
  }

  revalidatePath("/staff/settings");
  return actionOk("Opening hours saved");
}
```

- [ ] **Step 3: Create the settings form client component**

`src/app/(staff)/staff/settings/SettingsForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { FormField } from "@/components/FormField";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";
import type { ClinicSettingsView } from "@/server/services/clinic-settings";

export function SettingsForm({
  settings,
  action,
}: {
  settings: ClinicSettingsView;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Clinic name"
          name="clinicName"
          defaultValue={settings.clinicName}
          error={errors.clinicName}
        />
        <FormField
          label="Tagline"
          name="tagline"
          required={false}
          defaultValue={settings.tagline ?? ""}
          error={errors.tagline}
        />
        <FormField
          label="Logo URL"
          name="logoUrl"
          type="url"
          required={false}
          hint="Paste a link. File upload arrives with patient documents."
          defaultValue={settings.logoUrl ?? ""}
          error={errors.logoUrl}
        />
        <FormField
          label="Address"
          name="address"
          required={false}
          defaultValue={settings.address ?? ""}
          error={errors.address}
        />
        <FormField
          label="Phone"
          name="contactPhone"
          type="tel"
          required={false}
          mono
          defaultValue={settings.contactPhone ?? ""}
          error={errors.contactPhone}
        />
        <FormField
          label="WhatsApp"
          name="contactWhatsapp"
          type="tel"
          required={false}
          mono
          defaultValue={settings.contactWhatsapp ?? ""}
          error={errors.contactWhatsapp}
        />
        <FormField
          label="Email"
          name="contactEmail"
          type="email"
          required={false}
          defaultValue={settings.contactEmail ?? ""}
          error={errors.contactEmail}
        />
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium text-foreground">Booking rules</legend>
        <FormField
          label="Booking lead time (hours)"
          name="bookingLeadTimeHours"
          type="number"
          min={0}
          max={168}
          mono
          hint="0 means same-day booking is allowed."
          defaultValue={settings.bookingLeadTimeHours}
          error={errors.bookingLeadTimeHours}
        />
        <FormField
          label="Reschedule cutoff (hours)"
          name="rescheduleCutoffHours"
          type="number"
          min={0}
          max={168}
          mono
          defaultValue={settings.rescheduleCutoffHours}
          error={errors.rescheduleCutoffHours}
        />
        <FormField
          label="Cancellation cutoff (hours)"
          name="cancellationCutoffHours"
          type="number"
          min={0}
          max={168}
          mono
          defaultValue={settings.cancellationCutoffHours}
          error={errors.cancellationCutoffHours}
        />
      </fieldset>

      <FormStatus state={state} />

      <div>
        <SubmitButton>Save clinic details</SubmitButton>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Create the opening hours editor**

`src/app/(staff)/staff/settings/OpeningHoursEditor.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";
import { DAY_KEYS, type OpeningHours } from "@/lib/zod/clinic";

const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export function OpeningHoursEditor({
  openingHours,
  action,
}: {
  openingHours: OpeningHours;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  // Local state only so the time inputs can be disabled when a day is closed.
  // The submitted values still come from the form itself.
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(DAY_KEYS.map((day) => [day, openingHours[day] !== null])),
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {DAY_KEYS.map((day) => {
          const hours = openingHours[day];
          const isOpen = enabled[day] ?? false;
          const dayError = errors[day] ?? errors[`${day}.open`] ?? errors[`${day}.close`];

          return (
            <li key={day} className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-40 items-center gap-2">
                <input
                  id={`${day}-enabled`}
                  name={`${day}-enabled`}
                  type="checkbox"
                  checked={isOpen}
                  onChange={(e) => setEnabled((prev) => ({ ...prev, [day]: e.target.checked }))}
                  className="size-5 cursor-pointer accent-primary focus:outline-none focus:ring-3 focus:ring-ring"
                />
                <label htmlFor={`${day}-enabled`} className="cursor-pointer text-sm font-medium">
                  {DAY_LABELS[day]}
                </label>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={`${day}-open`} className="text-xs opacity-70">
                  Opens
                </label>
                {/* Native time input: a real picker on Android with zero JS,
                    which is what PRD-04 FR4's low-end target wants. */}
                <input
                  id={`${day}-open`}
                  name={`${day}-open`}
                  type="time"
                  defaultValue={hours?.open ?? "08:00"}
                  disabled={!isOpen}
                  aria-invalid={dayError ? true : undefined}
                  className="min-h-11 rounded-md border border-border bg-white px-3 py-2 font-mono text-base focus:outline-none focus:ring-3 focus:ring-ring disabled:opacity-50"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={`${day}-close`} className="text-xs opacity-70">
                  Closes
                </label>
                <input
                  id={`${day}-close`}
                  name={`${day}-close`}
                  type="time"
                  defaultValue={hours?.close ?? "17:00"}
                  disabled={!isOpen}
                  aria-invalid={dayError ? true : undefined}
                  className="min-h-11 rounded-md border border-border bg-white px-3 py-2 font-mono text-base focus:outline-none focus:ring-3 focus:ring-ring disabled:opacity-50"
                />
              </div>

              {!isOpen && <span className="pb-3 text-sm opacity-70">Closed</span>}
              {dayError && (
                <span className="pb-3 text-sm font-medium text-destructive">{dayError}</span>
              )}
            </li>
          );
        })}
      </ul>

      <FormStatus state={state} />

      <div>
        <SubmitButton>Save opening hours</SubmitButton>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Create the page**

`src/app/(staff)/staff/settings/page.tsx`:

```tsx
import { Card } from "@/components/Card";
import { requireRole } from "@/server/auth/rbac";
import { getClinicSettings } from "@/server/services/clinic-settings";
import { saveOpeningHours, saveSettings } from "./actions";
import { OpeningHoursEditor } from "./OpeningHoursEditor";
import { SettingsForm } from "./SettingsForm";

export const metadata = { title: "Clinic settings — TetaPhysio" };

export default async function ClinicSettingsPage() {
  await requireRole("admin");

  const settings = await getClinicSettings();

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="Clinic details"
        description="Shown on the public website and in patient messages."
      >
        <SettingsForm settings={settings} action={saveSettings} />
      </Card>

      <Card
        title="Opening hours"
        description="The booking engine offers no slot outside these hours, whatever a therapist's availability says."
      >
        <OpeningHoursEditor openingHours={settings.openingHours} action={saveOpeningHours} />
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Enable the navigation link**

In `src/lib/nav.ts:35`, change the Clinic settings entry:

```ts
    { href: "/staff/settings", label: "Clinic settings", available: true },
```

Drop the `note` — it only applies to unbuilt destinations.

- [ ] **Step 7: Verify the existing nav tests still pass**

Run: `npx vitest run tests/unit/nav.test.ts`
Expected: PASS, 6 tests. `nav.test.ts:45` requires at least one unavailable link, and five remain (Appointments, Patients, Payments, Staff, Reports).

- [ ] **Step 8: Verify typecheck, lint and build**

Run: `npx tsc --noEmit && npx eslint . && npx next build`
Expected: all clean. The route list gains `/staff/settings`.

- [ ] **Step 9: Smoke test the screen against a real server**

```bash
npm run db:seed
npx next start -p 3200 &
sleep 12
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3200/staff/settings
```

Expected: `307` redirecting to `/login` — the page is admin-only and this request has no cookie.

Kill the server:

```bash
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3200 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }"
```

- [ ] **Step 10: Commit**

```bash
git add "src/app/(staff)/staff/settings" src/lib/nav.ts
git commit -m "feat: add the clinic settings screen

Tab-strip layout for the four settings sections, plus the clinic details form
and the seven-day opening hours editor.

Both actions call requireRole('admin') before parsing input: a 'use server'
export is a public endpoint whether or not a form points at it, and
requireRole throws so an unchecked call fails closed. The layout guards too,
but each page re-checks rather than trusting it.

The hours editor uses native <input type=\"time\">, which gives a real picker
on Android with zero JavaScript — PRD-04 FR4's low-end target. Local state
only disables the inputs on a closed day; submitted values come from the form.

Clinic settings flips to available in the navigation. The existing nav test
still passes: it requires one unavailable link and five remain."
```

---

## Task 8: Services screen

**Files:**
- Create: `src/app/(staff)/staff/settings/services/page.tsx`, `src/app/(staff)/staff/settings/services/actions.ts`, `src/app/(staff)/staff/settings/services/ServiceForm.tsx`, `src/app/(staff)/staff/settings/services/ServiceList.tsx`

**Interfaces:**
- Consumes: `requireRole`, `listServices`, `createService`, `updateService`, `setServiceActive` (Task 5), `serviceSchema` (Task 3), action-state helpers (Task 6), `FormField`, `SubmitButton`, `FormStatus`, `Card`
- Produces:
  - `actions.ts` exports `addService(prev: ActionState, formData: FormData): Promise<ActionState>`, `editService(prev: ActionState, formData: FormData): Promise<ActionState>`, `toggleServiceActive(formData: FormData): Promise<void>`
  - The route `/staff/settings/services`

`toggleServiceActive` returns `void` rather than `ActionState`: it is a one-click action with no fields to validate, so it posts from a plain form and relies on `revalidatePath` to re-render.

- [ ] **Step 1: Write the Server Actions**

`src/app/(staff)/staff/settings/services/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/rbac";
import { createService, setServiceActive, updateService } from "@/server/services/service-catalog";
import { serviceSchema } from "@/lib/zod/clinic";
import { actionFailed, actionOk, toFieldErrors, type ActionState } from "@/server/action-state";

const SERVICES_PATH = "/staff/settings/services";

export async function addService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("admin");

  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  try {
    await createService(parsed.data);
  } catch {
    return actionFailed("Could not save the service. Try again.");
  }

  revalidatePath(SERVICES_PATH);
  return actionOk(`${parsed.data.name} added`);
}

export async function editService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  if (id.length === 0) return actionFailed("Missing service id");

  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  try {
    await updateService(id, parsed.data);
  } catch {
    return actionFailed("Could not save the service. Try again.");
  }

  revalidatePath(SERVICES_PATH);
  return actionOk(`${parsed.data.name} updated`);
}

/**
 * One-click, nothing to validate, so it returns void and posts from a plain
 * form. revalidatePath re-renders the list.
 */
export async function toggleServiceActive(formData: FormData): Promise<void> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const nextActive = formData.get("nextActive") === "true";
  if (id.length === 0) return;

  await setServiceActive(id, nextActive);
  revalidatePath(SERVICES_PATH);
}
```

- [ ] **Step 2: Create the service form**

`src/app/(staff)/staff/settings/services/ServiceForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { FormField } from "@/components/FormField";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";

export type ServiceFormValues = {
  id?: string;
  name: string;
  description: string;
  defaultDurationMinutes: number;
  defaultPrice: string;
  imageUrl: string;
};

export function ServiceForm({
  action,
  submitLabel,
  values,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  values?: ServiceFormValues;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {values?.id && <input type="hidden" name="id" value={values.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Service name"
          name="name"
          defaultValue={values?.name ?? ""}
          error={errors.name}
        />
        <FormField
          label="Image URL"
          name="imageUrl"
          type="url"
          required={false}
          defaultValue={values?.imageUrl ?? ""}
          error={errors.imageUrl}
        />
        <FormField
          label="Duration (minutes)"
          name="defaultDurationMinutes"
          type="number"
          min={5}
          max={480}
          step={5}
          mono
          defaultValue={values?.defaultDurationMinutes ?? 45}
          error={errors.defaultDurationMinutes}
        />
        <FormField
          label="Price (₦)"
          name="defaultPrice"
          mono
          hint="Naira, e.g. 15000 or 15000.00"
          defaultValue={values?.defaultPrice ?? "0"}
          error={errors.defaultPrice}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium text-foreground">
          Description <span className="font-normal opacity-70">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={values?.description ?? ""}
          className="rounded-md border border-border bg-white px-3 py-2 text-base focus:outline-none focus:ring-3 focus:ring-ring"
        />
      </div>

      <FormStatus state={state} />

      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Create the service list**

`src/app/(staff)/staff/settings/services/ServiceList.tsx`:

```tsx
import type { Service } from "@/generated/prisma/client";
import { SubmitButton } from "@/components/SubmitButton";
import { toggleServiceActive } from "./actions";

/**
 * A real <table> because this is tabular data — a screen reader announces row
 * and column relationships that a grid of divs cannot.
 */
export function ServiceList({ services }: { services: Service[] }) {
  if (services.length === 0) {
    return (
      <p className="text-sm opacity-80">
        No services yet. Add the first one below — it will appear on the public website and in the
        booking form.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Clinic services</caption>
        <thead>
          <tr className="border-b border-border text-left">
            <th scope="col" className="py-2 pr-4 font-semibold">Name</th>
            <th scope="col" className="py-2 pr-4 font-semibold">Duration</th>
            <th scope="col" className="py-2 pr-4 font-semibold">Price</th>
            <th scope="col" className="py-2 pr-4 font-semibold">Status</th>
            <th scope="col" className="py-2 font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {services.map((service) => (
            <tr key={service.id} className="border-b border-border">
              <th scope="row" className="py-3 pr-4 text-left font-medium">
                {service.name}
                <span className="block font-mono text-xs opacity-70">/{service.slug}</span>
              </th>
              <td className="py-3 pr-4 font-mono">{service.defaultDurationMinutes} min</td>
              <td className="py-3 pr-4 font-mono">₦{service.defaultPrice.toString()}</td>
              <td className="py-3 pr-4">
                {service.active ? (
                  <span className="rounded bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
                    Active
                  </span>
                ) : (
                  <span className="rounded bg-muted px-2 py-1 text-xs font-medium opacity-70">
                    Inactive
                  </span>
                )}
              </td>
              <td className="py-3">
                <form action={toggleServiceActive}>
                  <input type="hidden" name="id" value={service.id} />
                  <input type="hidden" name="nextActive" value={service.active ? "false" : "true"} />
                  <SubmitButton variant={service.active ? "destructive" : "primary"}>
                    {service.active ? "Deactivate" : "Activate"}
                  </SubmitButton>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Create the page**

`src/app/(staff)/staff/settings/services/page.tsx`:

```tsx
import { Card } from "@/components/Card";
import { requireRole } from "@/server/auth/rbac";
import { listServices } from "@/server/services/service-catalog";
import { addService, editService } from "./actions";
import { ServiceForm } from "./ServiceForm";
import { ServiceList } from "./ServiceList";

export const metadata = { title: "Services — TetaPhysio" };

export default async function ServicesPage() {
  await requireRole("admin");

  const services = await listServices();

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="Services"
        description="Deactivating a service hides it from the website and the booking form but keeps it on past appointments and invoices."
      >
        <ServiceList services={services} editAction={editService} />
      </Card>

      <Card title="Add a service" description="Duration and price become the booking defaults.">
        <ServiceForm action={addService} submitLabel="Add service" />
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Surface editing from the list**

PRD-06 §6 asks for add, edit and remove. Create and deactivate are covered; this adds edit without a second screen, using a native `<details>` disclosure — no JavaScript, and closed by default so the table stays scannable.

In `ServiceList.tsx`, change the signature and add an editing row. Replace the `export function ServiceList({ services }: { services: Service[] })` line with:

```tsx
export function ServiceList({
  services,
  editAction,
}: {
  services: Service[];
  editAction: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
```

Add these imports at the top:

```tsx
import type { ActionState } from "@/server/action-state";
import { ServiceForm } from "./ServiceForm";
```

Then, inside `<tbody>`, wrap each service in a fragment so the edit row follows its data row. Replace the single `<tr key={service.id}>` block with:

```tsx
            <Fragment key={service.id}>
              <tr className="border-b border-border">
                <th scope="row" className="py-3 pr-4 text-left font-medium">
                  {service.name}
                  <span className="block font-mono text-xs opacity-70">/{service.slug}</span>
                </th>
                <td className="py-3 pr-4 font-mono">{service.defaultDurationMinutes} min</td>
                <td className="py-3 pr-4 font-mono">₦{service.defaultPrice.toString()}</td>
                <td className="py-3 pr-4">
                  {service.active ? (
                    <span className="rounded bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
                      Active
                    </span>
                  ) : (
                    <span className="rounded bg-muted px-2 py-1 text-xs font-medium opacity-70">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="py-3">
                  <form action={toggleServiceActive}>
                    <input type="hidden" name="id" value={service.id} />
                    <input
                      type="hidden"
                      name="nextActive"
                      value={service.active ? "false" : "true"}
                    />
                    <SubmitButton variant={service.active ? "destructive" : "primary"}>
                      {service.active ? "Deactivate" : "Activate"}
                    </SubmitButton>
                  </form>
                </td>
              </tr>
              <tr className="border-b border-border">
                <td colSpan={5} className="py-2">
                  {/* Native <details>: a disclosure with zero client JS, closed by
                      default so the table stays scannable. */}
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-primary">
                      Edit {service.name}
                    </summary>
                    <div className="mt-3">
                      <ServiceForm
                        action={editAction}
                        submitLabel="Save changes"
                        values={{
                          id: service.id,
                          name: service.name,
                          description: service.description ?? "",
                          defaultDurationMinutes: service.defaultDurationMinutes,
                          defaultPrice: service.defaultPrice.toString(),
                          imageUrl: service.imageUrl ?? "",
                        }}
                      />
                    </div>
                  </details>
                </td>
              </tr>
            </Fragment>
```

Add `Fragment` to the React import at the top of the file:

```tsx
import { Fragment } from "react";
```

Note: `ServiceForm` renders `id` as a hidden input when `values.id` is present, which is what `editService` reads. Because several forms now share field names on one page, this is fine — each `<form>` scopes its own `FormData`.

- [ ] **Step 6: Verify typecheck, lint and build**

Run: `npx tsc --noEmit && npx eslint . && npx next build`
Expected: all clean. The route list gains `/staff/settings/services`.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(staff)/staff/settings/services"
git commit -m "feat: add the services screen

List with activate, deactivate and inline edit, plus a create form — PRD-06
6 asks for add, edit and remove, and per spec 3.3 'remove' is deactivation:
PRD-06 FR2 prefers it, and two similar-looking destructive actions on one
screen invite the wrong click.

Editing uses a native <details> disclosure, closed by default, so the table
stays scannable and the feature costs zero client JavaScript.

The list is a real table with scope-d headers and a caption, so a screen
reader announces row and column relationships. Duration, price and slug render
in Fira Code, which is what the mono token is for."
```

---

## Task 9: Availability screen

**Files:**
- Create: `src/app/(staff)/staff/settings/availability/page.tsx`, `src/app/(staff)/staff/settings/availability/actions.ts`, `src/app/(staff)/staff/settings/availability/AvailabilityForm.tsx`, `src/app/(staff)/staff/settings/availability/AvailabilityList.tsx`

**Interfaces:**
- Consumes: `requireRole`, `listTherapists`, `listAvailability`, `createAvailability`, `deleteAvailability` (Task 5), `availabilitySchema`, `DAY_KEYS` (Task 3), action-state helpers (Task 6)
- Produces:
  - `actions.ts` exports `addAvailability(prev: ActionState, formData: FormData): Promise<ActionState>` and `removeAvailability(formData: FormData): Promise<void>`
  - The route `/staff/settings/availability?therapist=<uuid>`

The therapist is selected via a search param rather than client state, so the server component can load that therapist's rows directly and the URL is shareable.

- [ ] **Step 1: Write the Server Actions**

`src/app/(staff)/staff/settings/availability/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/rbac";
import { createAvailability, deleteAvailability } from "@/server/services/availability";
import { availabilitySchema } from "@/lib/zod/clinic";
import { actionFailed, actionOk, toFieldErrors, type ActionState } from "@/server/action-state";

const AVAILABILITY_PATH = "/staff/settings/availability";

export async function addAvailability(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("admin");

  const parsed = availabilitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  try {
    await createAvailability(parsed.data);
  } catch {
    return actionFailed("Could not save. Try again.");
  }

  revalidatePath(AVAILABILITY_PATH);
  return actionOk(parsed.data.isBlocked ? "Block added" : "Availability added");
}

export async function removeAvailability(formData: FormData): Promise<void> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  if (id.length === 0) return;

  await deleteAvailability(id);
  revalidatePath(AVAILABILITY_PATH);
}
```

- [ ] **Step 2: Create the availability form**

`src/app/(staff)/staff/settings/availability/AvailabilityForm.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";

const WEEKDAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

export function AvailabilityForm({
  therapistId,
  action,
}: {
  therapistId: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  const [kind, setKind] = useState<"recurring" | "dated">("recurring");

  const inputClass =
    "min-h-11 rounded-md border border-border bg-white px-3 py-2 font-mono text-base focus:outline-none focus:ring-3 focus:ring-ring";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="therapistId" value={therapistId} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">Type</legend>
        <div className="flex flex-wrap gap-4">
          {(["recurring", "dated"] as const).map((option) => (
            <label key={option} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="kind"
                value={option}
                checked={kind === option}
                onChange={() => setKind(option)}
                className="size-5 cursor-pointer accent-primary focus:outline-none focus:ring-3 focus:ring-ring"
              />
              {option === "recurring" ? "Every week" : "A specific date"}
            </label>
          ))}
        </div>
      </fieldset>

      {kind === "recurring" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="dayOfWeek" className="text-sm font-medium text-foreground">
            Day of the week
          </label>
          <select id="dayOfWeek" name="dayOfWeek" className={inputClass} defaultValue="1">
            {WEEKDAYS.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
          {errors.dayOfWeek && (
            <p className="text-xs font-medium text-destructive">{errors.dayOfWeek}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor="specificDate" className="text-sm font-medium text-foreground">
            Date
          </label>
          <input id="specificDate" name="specificDate" type="date" className={inputClass} />
          {/* Spec §3.2 made this rule invisible unless the UI says it out loud. */}
          <p className="text-xs opacity-70">
            A dated entry replaces this therapist&apos;s weekly hours for that day entirely.
          </p>
          {errors.specificDate && (
            <p className="text-xs font-medium text-destructive">{errors.specificDate}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="startTime" className="text-sm font-medium text-foreground">
            From
          </label>
          <input
            id="startTime"
            name="startTime"
            type="time"
            defaultValue="08:00"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="endTime" className="text-sm font-medium text-foreground">
            To
          </label>
          <input
            id="endTime"
            name="endTime"
            type="time"
            defaultValue="17:00"
            className={inputClass}
            aria-invalid={errors.endTime ? true : undefined}
          />
          {errors.endTime && (
            <p className="text-xs font-medium text-destructive">{errors.endTime}</p>
          )}
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isBlocked"
          value="true"
          className="size-5 cursor-pointer accent-destructive focus:outline-none focus:ring-3 focus:ring-ring"
        />
        This is time off, not working hours
      </label>

      <div className="flex flex-col gap-1">
        <label htmlFor="reason" className="text-sm font-medium text-foreground">
          Reason <span className="font-normal opacity-70">(optional)</span>
        </label>
        <input
          id="reason"
          name="reason"
          type="text"
          placeholder="Annual leave"
          className="min-h-11 rounded-md border border-border bg-white px-3 py-2 text-base focus:outline-none focus:ring-3 focus:ring-ring"
        />
      </div>

      <FormStatus state={state} />

      <div>
        <SubmitButton>Add entry</SubmitButton>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Create the availability list**

`src/app/(staff)/staff/settings/availability/AvailabilityList.tsx`:

```tsx
import type { TherapistAvailability } from "@/generated/prisma/client";
import { SubmitButton } from "@/components/SubmitButton";
import { removeAvailability } from "./actions";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatDate(value: Date): string {
  // The column is a DATE, which Prisma returns at UTC midnight. Read it with
  // getUTC* or a westward local timezone shifts it by a day.
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function AvailabilityList({ rows }: { rows: TherapistAvailability[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm opacity-80">
        No hours set. This therapist will not appear as available for any booking until at least one
        entry exists.
      </p>
    );
  }

  const recurring = rows.filter((r) => r.specificDate === null);
  const dated = rows.filter((r) => r.specificDate !== null);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-sm font-semibold text-foreground">Every week</h3>
        {recurring.length === 0 ? (
          <p className="mt-2 text-sm opacity-70">No weekly hours.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {recurring.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
              >
                <span className="min-w-24 text-sm font-medium">{DAY_NAMES[row.dayOfWeek ?? 0]}</span>
                <span className="font-mono text-sm">
                  {row.startTime}–{row.endTime}
                </span>
                {row.isBlocked && (
                  <span className="rounded bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
                    Time off
                  </span>
                )}
                {row.reason && <span className="text-sm opacity-70">{row.reason}</span>}
                <form action={removeAvailability} className="ml-auto">
                  <input type="hidden" name="id" value={row.id} />
                  <SubmitButton variant="destructive">Remove</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-foreground">Specific dates</h3>
        {dated.length === 0 ? (
          <p className="mt-2 text-sm opacity-70">No dated entries.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {dated.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
              >
                <span className="min-w-28 font-mono text-sm font-medium">
                  {formatDate(row.specificDate!)}
                </span>
                <span className="font-mono text-sm">
                  {row.startTime}–{row.endTime}
                </span>
                {row.isBlocked ? (
                  <span className="rounded bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
                    Time off
                  </span>
                ) : (
                  <span className="rounded bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
                    Working
                  </span>
                )}
                {/* Spec §3.2: without this the precedence rule is invisible. */}
                <span className="text-xs opacity-70">Replaces weekly hours</span>
                {row.reason && <span className="text-sm opacity-70">{row.reason}</span>}
                <form action={removeAvailability} className="ml-auto">
                  <input type="hidden" name="id" value={row.id} />
                  <SubmitButton variant="destructive">Remove</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Create the page**

`src/app/(staff)/staff/settings/availability/page.tsx`:

```tsx
import Link from "next/link";
import { Card } from "@/components/Card";
import { requireRole } from "@/server/auth/rbac";
import { listAvailability, listTherapists } from "@/server/services/availability";
import { addAvailability } from "./actions";
import { AvailabilityForm } from "./AvailabilityForm";
import { AvailabilityList } from "./AvailabilityList";

export const metadata = { title: "Therapist availability — TetaPhysio" };

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ therapist?: string }>;
}) {
  await requireRole("admin");

  const [{ therapist: requested }, therapists] = await Promise.all([
    searchParams,
    listTherapists(),
  ]);

  if (therapists.length === 0) {
    return (
      <Card title="Therapist availability">
        <p className="text-sm opacity-80">
          No active therapists yet. Staff accounts are created in a later sub-project; until then the
          seeded therapists are the ones available.
        </p>
      </Card>
    );
  }

  // Selection lives in the URL rather than client state, so this server
  // component can load the rows directly and the link is shareable.
  const selected = therapists.find((t) => t.id === requested) ?? therapists[0]!;
  const rows = await listAvailability(selected.id);

  return (
    <div className="flex flex-col gap-6">
      <Card title="Therapist" description="Choose whose hours to edit.">
        <ul className="flex flex-wrap gap-2">
          {therapists.map((therapist) => {
            const isSelected = therapist.id === selected.id;
            return (
              <li key={therapist.id}>
                <Link
                  href={`/staff/settings/availability?therapist=${therapist.id}`}
                  aria-current={isSelected ? "true" : undefined}
                  className={`inline-flex min-h-11 cursor-pointer items-center rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-3 focus:ring-ring ${
                    isSelected
                      ? "bg-primary text-on-primary"
                      : "border border-border text-foreground hover:bg-muted"
                  }`}
                >
                  {therapist.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card
        title={`${selected.name}'s hours`}
        description="Clinic opening hours are applied on top of these, so no slot is ever offered while the clinic is shut."
      >
        <AvailabilityList rows={rows} />
      </Card>

      <Card title="Add an entry">
        <AvailabilityForm therapistId={selected.id} action={addAvailability} />
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Verify typecheck, lint and build**

Run: `npx tsc --noEmit && npx eslint . && npx next build`
Expected: all clean. The route list gains `/staff/settings/availability`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(staff)/staff/settings/availability"
git commit -m "feat: add the therapist availability screen

Weekly hours and dated exceptions in two separate lists, because they behave
differently: spec 3.2 makes a dated entry replace the weekly pattern for that
day entirely. Every dated row therefore renders a 'Replaces weekly hours'
note — without it the precedence rule is invisible and an admin would be
surprised by a therapist vanishing from the booking calendar.

Therapist selection lives in a search param, not client state, so the server
component loads that therapist's rows directly and the URL is shareable.

Dates are read with getUTC* throughout: specificDate is a Postgres DATE that
Prisma returns at UTC midnight, and a local read would shift it by a day."
```

---

## Task 10: Content screen

**Files:**
- Create: `src/app/(staff)/staff/settings/content/page.tsx`, `src/app/(staff)/staff/settings/content/actions.ts`, `src/app/(staff)/staff/settings/content/AboutForm.tsx`, `src/app/(staff)/staff/settings/content/TestimonialForm.tsx`, `src/app/(staff)/staff/settings/content/TestimonialList.tsx`

**Interfaces:**
- Consumes: `requireRole`, `getClinicSettings`, `updateClinicSettings` (Task 4), `listTestimonials`, `createTestimonial`, `setTestimonialPublished`, `deleteTestimonial` (Task 4), `testimonialSchema` (Task 3), action-state helpers (Task 6)
- Produces:
  - `actions.ts` exports `saveAbout(prev: ActionState, formData: FormData): Promise<ActionState>`, `addTestimonial(prev: ActionState, formData: FormData): Promise<ActionState>`, `toggleTestimonialPublished(formData: FormData): Promise<void>`, `removeTestimonial(formData: FormData): Promise<void>`
  - The route `/staff/settings/content`

- [ ] **Step 1: Write the Server Actions**

`src/app/(staff)/staff/settings/content/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/rbac";
import { getClinicSettings, updateClinicSettings } from "@/server/services/clinic-settings";
import {
  createTestimonial,
  deleteTestimonial,
  setTestimonialPublished,
} from "@/server/services/testimonial";
import { testimonialSchema } from "@/lib/zod/clinic";
import { actionFailed, actionOk, toFieldErrors, type ActionState } from "@/server/action-state";

const CONTENT_PATH = "/staff/settings/content";

export async function saveAbout(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("admin");

  const raw = String(formData.get("aboutContent") ?? "").trim();

  try {
    // aboutContent is one field on the settings singleton, so read the current
    // row and write it back with only that value changed. Sending a partial
    // object would blank the other columns.
    const current = await getClinicSettings();
    await updateClinicSettings({
      clinicName: current.clinicName,
      tagline: current.tagline,
      logoUrl: current.logoUrl,
      aboutContent: raw.length === 0 ? null : raw,
      contactPhone: current.contactPhone,
      contactWhatsapp: current.contactWhatsapp,
      contactEmail: current.contactEmail,
      address: current.address,
      bookingLeadTimeHours: current.bookingLeadTimeHours,
      rescheduleCutoffHours: current.rescheduleCutoffHours,
      cancellationCutoffHours: current.cancellationCutoffHours,
    });
  } catch {
    return actionFailed("Could not save. Try again.");
  }

  revalidatePath(CONTENT_PATH);
  return actionOk("About content saved");
}

export async function addTestimonial(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("admin");

  const parsed = testimonialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error, "Check the highlighted fields");

  try {
    await createTestimonial(parsed.data);
  } catch {
    return actionFailed("Could not save the testimonial. Try again.");
  }

  revalidatePath(CONTENT_PATH);
  return actionOk("Testimonial added");
}

export async function toggleTestimonialPublished(formData: FormData): Promise<void> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const nextPublished = formData.get("nextPublished") === "true";
  if (id.length === 0) return;

  await setTestimonialPublished(id, nextPublished);
  revalidatePath(CONTENT_PATH);
}

export async function removeTestimonial(formData: FormData): Promise<void> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  if (id.length === 0) return;

  await deleteTestimonial(id);
  revalidatePath(CONTENT_PATH);
}
```

- [ ] **Step 2: Create the about form**

`src/app/(staff)/staff/settings/content/AboutForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";

export function AboutForm({
  aboutContent,
  action,
}: {
  aboutContent: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="aboutContent" className="text-sm font-medium text-foreground">
          About the clinic
        </label>
        <textarea
          id="aboutContent"
          name="aboutContent"
          rows={8}
          defaultValue={aboutContent}
          aria-describedby="aboutContent-hint"
          className="rounded-md border border-border bg-white px-3 py-2 text-base focus:outline-none focus:ring-3 focus:ring-ring"
        />
        <p id="aboutContent-hint" className="text-xs opacity-70">
          Plain text. Shown on the public About page.
        </p>
      </div>

      <FormStatus state={state} />

      <div>
        <SubmitButton>Save about content</SubmitButton>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Create the testimonial form**

`src/app/(staff)/staff/settings/content/TestimonialForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { FormField } from "@/components/FormField";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";

export function TestimonialForm({
  action,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField
        label="Patient name"
        name="patientName"
        hint="Use initials or a first name only — a full name needs the patient's consent."
        error={errors.patientName}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="content" className="text-sm font-medium text-foreground">
          Testimonial
        </label>
        <textarea
          id="content"
          name="content"
          rows={4}
          aria-invalid={errors.content ? true : undefined}
          className="rounded-md border border-border bg-white px-3 py-2 text-base focus:outline-none focus:ring-3 focus:ring-ring"
        />
        {errors.content && (
          <p className="text-xs font-medium text-destructive">{errors.content}</p>
        )}
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="published"
          value="true"
          className="size-5 cursor-pointer accent-primary focus:outline-none focus:ring-3 focus:ring-ring"
        />
        Publish immediately
      </label>

      <FormStatus state={state} />

      <div>
        <SubmitButton>Add testimonial</SubmitButton>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Create the testimonial list**

`src/app/(staff)/staff/settings/content/TestimonialList.tsx`:

```tsx
import type { Testimonial } from "@/generated/prisma/client";
import { SubmitButton } from "@/components/SubmitButton";
import { removeTestimonial, toggleTestimonialPublished } from "./actions";

export function TestimonialList({ testimonials }: { testimonials: Testimonial[] }) {
  if (testimonials.length === 0) {
    return <p className="text-sm opacity-80">No testimonials yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {testimonials.map((testimonial) => (
        <li key={testimonial.id} className="rounded-md border border-border p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-foreground">
              {testimonial.patientName}
            </span>
            {testimonial.published ? (
              <span className="rounded bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
                Published
              </span>
            ) : (
              <span className="rounded bg-muted px-2 py-1 text-xs font-medium opacity-70">
                Draft
              </span>
            )}
          </div>

          <blockquote className="mt-2 text-sm opacity-90">{testimonial.content}</blockquote>

          <div className="mt-3 flex flex-wrap gap-2">
            <form action={toggleTestimonialPublished}>
              <input type="hidden" name="id" value={testimonial.id} />
              <input
                type="hidden"
                name="nextPublished"
                value={testimonial.published ? "false" : "true"}
              />
              <SubmitButton>{testimonial.published ? "Unpublish" : "Publish"}</SubmitButton>
            </form>

            <form action={removeTestimonial}>
              <input type="hidden" name="id" value={testimonial.id} />
              <SubmitButton variant="destructive">Delete</SubmitButton>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Create the page**

`src/app/(staff)/staff/settings/content/page.tsx`:

```tsx
import { Card } from "@/components/Card";
import { requireRole } from "@/server/auth/rbac";
import { getClinicSettings } from "@/server/services/clinic-settings";
import { listTestimonials } from "@/server/services/testimonial";
import { addTestimonial, saveAbout } from "./actions";
import { AboutForm } from "./AboutForm";
import { TestimonialForm } from "./TestimonialForm";
import { TestimonialList } from "./TestimonialList";

export const metadata = { title: "Website content — TetaPhysio" };

export default async function ContentPage() {
  await requireRole("admin");

  const [settings, testimonials] = await Promise.all([getClinicSettings(), listTestimonials()]);

  return (
    <div className="flex flex-col gap-6">
      <Card title="About content" description="Feeds the public About page.">
        <AboutForm aboutContent={settings.aboutContent ?? ""} action={saveAbout} />
      </Card>

      <Card
        title="Testimonials"
        description="Only published testimonials appear on the website."
      >
        <TestimonialList testimonials={testimonials} />
      </Card>

      <Card title="Add a testimonial">
        <TestimonialForm action={addTestimonial} />
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Verify typecheck, lint and build**

Run: `npx tsc --noEmit && npx eslint . && npx next build`
Expected: all clean. The route list gains `/staff/settings/content`.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(staff)/staff/settings/content"
git commit -m "feat: add the website content screen

About text plus testimonial create, publish, unpublish and delete. Only
published testimonials reach the public site, so a draft can be entered and
reviewed before it appears.

saveAbout reads the settings row and writes it back with only aboutContent
changed. updateClinicSettings takes the full object, so sending a partial one
would blank the other columns — worth naming because it is a live footgun.

The name field's hint asks for initials or a first name: a full name in a
public testimonial needs the patient's consent, which the platform does not
track."
```

---

## Task 11: End-to-end journeys and final verification

**Files:**
- Create: `tests/e2e/clinic-config.spec.ts`
- Modify: `tests/e2e/helpers/db.ts` (add `resetClinicConfig`)
- Modify: `README.md` (mark sub-project 2 done)
- Modify: `docs/superpowers/plans/2026-08-29-clinic-config.md` (tick every box)

**Interfaces:**
- Consumes: everything
- Produces: `tests/e2e/helpers/db.ts` additionally exports `resetClinicConfig(): Promise<void>`

Like the Foundation suite, every test arms its own precondition so the `mobile` project does not replay specs against state `chromium` already changed, and no run needs `npm run db:reset` first.

- [ ] **Step 1: Add the reset helper**

Append to `tests/e2e/helpers/db.ts`:

```ts
/**
 * Clears the rows the clinic-config journeys create, so each test starts from a
 * known state and the chromium and mobile projects do not interfere.
 *
 * The six seeded services are left in place — the seed owns them and deleting one
 * would break the seed-count assertions in tests/integration/seed.test.ts. Any
 * service a test created is removed, and the edit test's price change is reverted
 * by restoring the seeded values.
 */
export async function resetClinicConfig(): Promise<void> {
  await prisma.testimonial.deleteMany({});
  await prisma.therapistAvailability.deleteMany({});

  // Reactivate anything a deactivate test switched off.
  await prisma.service.updateMany({ where: { active: false }, data: { active: true } });

  // Remove services a create test added. The seed's six carry sortOrder 0-5, and
  // createService sets sortOrder to the current row count, so anything from 6 up
  // came from a test.
  await prisma.service.deleteMany({ where: { sortOrder: { gte: 6 } } });

  // Restore the seeded price the edit test changes.
  await prisma.service.updateMany({
    where: { slug: "pain-management" },
    data: { defaultPrice: "15000.00", defaultDurationMinutes: 45, name: "Pain Management" },
  });
}
```

- [ ] **Step 2: Write the E2E spec**

`tests/e2e/clinic-config.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { armPatientAccount, armStaffAccount, disconnect, resetClinicConfig } from "./helpers/db";

const STAFF_PASSWORD = process.env.SEED_STAFF_PASSWORD ?? "changeme1";
const PATIENT_PASSWORD = process.env.SEED_PATIENT_PASSWORD ?? "changeme1";

const ADMIN_EMAIL = "admin@tetaphysio.ng";
const THERAPIST_EMAIL = "chidera@tetaphysio.ng";
const RECEPTION_EMAIL = "reception@tetaphysio.ng";
const PATIENT_PHONE = "08020000001";

const ADMIN_PASSWORD = "SettingsAdmin1";

/** Logs in as an admin who is already past the forced password change. */
async function loginAsAdmin(page: Page) {
  await armStaffAccount(ADMIN_EMAIL, ADMIN_PASSWORD, false);
  await page.goto("/login");
  await page.getByLabel("Email or phone number").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/staff$/);
}

test.beforeEach(async () => {
  await resetClinicConfig();
});

test.afterAll(async () => {
  await disconnect();
});

test.describe("clinic settings", () => {
  test("admin reaches settings from the navigation", async ({ page }) => {
    await loginAsAdmin(page);

    await page.getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Clinic settings" })
      .click();

    await expect(page).toHaveURL(/\/staff\/settings$/);
    await expect(page.getByRole("heading", { name: "Clinic settings", level: 1 })).toBeVisible();
  });

  test("saving clinic details shows a success message and persists", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings");

    await page.getByLabel("Clinic name").fill("TetaPhysio Ikoyi");
    await page.getByLabel("Tagline").fill("Movement is medicine");
    await page.getByRole("button", { name: "Save clinic details" }).click();

    await expect(page.getByRole("status")).toContainText(/saved/i);

    await page.reload();
    await expect(page.getByLabel("Clinic name")).toHaveValue("TetaPhysio Ikoyi");
  });

  test("an invalid cutoff is rejected with an inline error", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings");

    // Bypass the number input's own min so the server-side rule is what fails.
    await page.getByLabel("Reschedule cutoff (hours)").evaluate((el) => {
      (el as HTMLInputElement).removeAttribute("min");
      (el as HTMLInputElement).value = "-5";
    });
    await page.getByRole("button", { name: "Save clinic details" }).click();

    await expect(page.getByRole("status")).toContainText(/highlighted/i);
  });

  test("opening hours round-trip, including a closed day", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings");

    await page.getByLabel("Monday", { exact: true }).check();
    await page.locator("#monday-open").fill("08:30");
    await page.locator("#monday-close").fill("16:30");
    await page.getByLabel("Sunday", { exact: true }).uncheck();

    await page.getByRole("button", { name: "Save opening hours" }).click();
    await expect(page.getByRole("status")).toContainText(/saved/i);

    await page.reload();
    await expect(page.locator("#monday-open")).toHaveValue("08:30");
    await expect(page.getByLabel("Sunday", { exact: true })).not.toBeChecked();
  });

  test("a closing time before the opening time is refused", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings");

    await page.getByLabel("Tuesday", { exact: true }).check();
    await page.locator("#tuesday-open").fill("17:00");
    await page.locator("#tuesday-close").fill("08:00");
    await page.getByRole("button", { name: "Save opening hours" }).click();

    await expect(page.getByRole("status")).toContainText(/highlighted/i);
  });
});

test.describe("services", () => {
  test("creating a service lists it as active with a slug", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/services");

    await page.getByLabel("Service name").fill("Dry Needling");
    await page.getByLabel("Duration (minutes)").fill("30");
    await page.getByLabel("Price (₦)").fill("12000");
    await page.getByRole("button", { name: "Add service" }).click();

    await expect(page.getByRole("status")).toContainText(/Dry Needling added/i);

    const row = page.getByRole("row", { name: /Dry Needling/ });
    await expect(row).toContainText("30 min");
    await expect(row).toContainText("12000");
    await expect(row).toContainText("Active");
    await expect(row).toContainText("/dry-needling");
  });

  test("a zero duration is refused", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/services");

    await page.getByLabel("Service name").fill("Bad Service");
    await page.getByLabel("Duration (minutes)").evaluate((el) => {
      (el as HTMLInputElement).removeAttribute("min");
      (el as HTMLInputElement).value = "0";
    });
    await page.getByLabel("Price (₦)").fill("1000");
    await page.getByRole("button", { name: "Add service" }).click();

    await expect(page.getByRole("status")).toContainText(/highlighted/i);
  });

  test("deactivating a service flips its status", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/services");

    const row = page.getByRole("row", { name: /Pain Management/ });
    await expect(row).toContainText("Active");

    await row.getByRole("button", { name: "Deactivate" }).click();

    const updated = page.getByRole("row", { name: /Pain Management/ });
    await expect(updated).toContainText("Inactive");
    await expect(updated.getByRole("button", { name: "Activate" })).toBeVisible();
  });

  test("editing a service changes its price but keeps its slug", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/services");

    // The edit form lives in a <details> disclosure, closed by default.
    await page.getByText("Edit Pain Management").click();

    const editForm = page.locator("details", { hasText: "Edit Pain Management" });
    await editForm.getByLabel("Price (₦)").fill("17500.00");
    await editForm.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("status")).toContainText(/updated/i);

    const row = page.getByRole("row", { name: /Pain Management/ });
    await expect(row).toContainText("17500.00");
    // The slug is a public URL — repricing or renaming must not break a link.
    await expect(row).toContainText("/pain-management");
  });

  test("a price with three decimals is refused", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/services");

    await page.getByLabel("Service name").fill("Odd Price");
    await page.getByLabel("Duration (minutes)").fill("30");
    // Decimal(12,2) would silently round a third decimal, so the schema rejects it.
    await page.getByLabel("Price (₦)").fill("100.123");
    await page.getByRole("button", { name: "Add service" }).click();

    await expect(page.getByRole("status")).toContainText(/highlighted/i);
  });
});

test.describe("therapist availability", () => {
  test("adding weekly hours lists them under Every week", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/availability");

    await page.getByLabel("Every week").check();
    await page.getByLabel("Day of the week").selectOption("2");
    await page.getByLabel("From").fill("09:00");
    await page.getByLabel("To").fill("13:00");
    await page.getByRole("button", { name: "Add entry" }).click();

    await expect(page.getByRole("status")).toContainText(/Availability added/i);
    await expect(page.getByRole("listitem").filter({ hasText: "Tuesday" })).toContainText(
      "09:00–13:00",
    );
  });

  test("a dated entry is labelled as replacing weekly hours", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/availability");

    await page.getByLabel("A specific date").check();
    await page.getByLabel("Date").fill("2026-12-25");
    await page.getByLabel("From").fill("00:00");
    await page.getByLabel("To").fill("23:59");
    await page.getByLabel("This is time off, not working hours").check();
    await page.getByLabel("Reason (optional)").fill("Christmas Day");
    await page.getByRole("button", { name: "Add entry" }).click();

    await expect(page.getByRole("status")).toContainText(/Block added/i);

    const entry = page.getByRole("listitem").filter({ hasText: "2026-12-25" });
    await expect(entry).toContainText("Time off");
    await expect(entry).toContainText("Replaces weekly hours");
    await expect(entry).toContainText("Christmas Day");
  });

  test("an end time before the start time is refused", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/availability");

    await page.getByLabel("From").fill("17:00");
    await page.getByLabel("To").fill("09:00");
    await page.getByRole("button", { name: "Add entry" }).click();

    await expect(page.getByRole("status")).toContainText(/highlighted/i);
  });

  test("switching therapist changes whose hours are shown", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/availability");

    await page.getByRole("link", { name: /Aisha Bello/ }).click();

    await expect(page).toHaveURL(/therapist=/);
    await expect(page.getByRole("heading", { name: /Aisha Bello's hours/ })).toBeVisible();
  });
});

test.describe("website content", () => {
  test("a testimonial is created as a draft, then published", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/content");

    await page.getByLabel("Patient name").fill("Ada O.");
    await page.getByLabel("Testimonial").fill("I am walking without pain again.");
    await page.getByRole("button", { name: "Add testimonial" }).click();

    await expect(page.getByRole("status")).toContainText(/added/i);

    const entry = page.getByRole("listitem").filter({ hasText: "Ada O." });
    await expect(entry).toContainText("Draft");

    await entry.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Ada O." })).toContainText(
      "Published",
    );
  });

  test("about content persists", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/content");

    await page.getByLabel("About the clinic").fill("Serving Lagos since 2019.");
    await page.getByRole("button", { name: "Save about content" }).click();

    await expect(page.getByRole("status")).toContainText(/saved/i);

    await page.reload();
    await expect(page.getByLabel("About the clinic")).toHaveValue("Serving Lagos since 2019.");
  });

  test("an empty testimonial is refused", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/content");

    await page.getByLabel("Patient name").fill("Nobody");
    await page.getByRole("button", { name: "Add testimonial" }).click();

    await expect(page.getByRole("status")).toContainText(/highlighted/i);
  });
});

test.describe("settings are admin-only", () => {
  test("a therapist is refused", async ({ page }) => {
    await armStaffAccount(THERAPIST_EMAIL, STAFF_PASSWORD, false);
    await page.goto("/login");
    await page.getByLabel("Email or phone number").fill(THERAPIST_EMAIL);
    await page.getByLabel("Password").fill(STAFF_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/staff$/);

    // Navigation must not offer it…
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByText("Clinic settings", { exact: true })).toHaveCount(0);

    // …and the route itself must refuse, since navigation is not a security
    // boundary (Foundation spec §5.3).
    const response = await page.goto("/staff/settings");
    expect(response?.status()).toBe(403);
  });

  test("a receptionist is refused", async ({ page }) => {
    await armStaffAccount(RECEPTION_EMAIL, STAFF_PASSWORD, false);
    await page.goto("/login");
    await page.getByLabel("Email or phone number").fill(RECEPTION_EMAIL);
    await page.getByLabel("Password").fill(STAFF_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/staff$/);

    const response = await page.goto("/staff/settings");
    expect(response?.status()).toBe(403);
  });

  test("a patient is redirected to their own portal", async ({ page }) => {
    await armPatientAccount(PATIENT_PHONE, PATIENT_PASSWORD);
    await page.goto("/portal/login");
    await page.getByLabel("Phone number").fill(PATIENT_PHONE);
    await page.getByLabel("Password").fill(PATIENT_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/portal$/);

    await page.goto("/staff/settings");
    await expect(page).toHaveURL(/\/portal$/);
  });

  test("an unauthenticated visitor is redirected to login", async ({ page }) => {
    await page.goto("/staff/settings");
    await expect(page).toHaveURL(/\/login/);
  });
});
```

- [ ] **Step 3: Reseed and build, then run the new spec**

```bash
npx prisma db seed
npx next build
npx playwright test tests/e2e/clinic-config.spec.ts --project=chromium
```

Expected: all tests pass.

If the two 403 assertions fail with a redirect instead, check what `requireRole` does when it throws inside a server component: Foundation's `(staff)/layout.tsx` redirects a patient but lets a `ForbiddenError` propagate for staff, which Next renders as a 403. If it renders a 500 instead, add an `error.tsx` under `src/app/(staff)/` that renders the message and returns the right status, and note it in the commit.

- [ ] **Step 4: Run the full E2E suite on both projects**

Run: `npx playwright test`
Expected: every spec passes on `chromium` and `mobile` — the Foundation login journeys plus the new clinic-config ones. Because each test arms its own state, the second project needs no reset.

- [ ] **Step 5: Run the whole verification sweep**

```bash
npx tsc --noEmit
npx eslint .
npx next build
npx vitest run
npx playwright test
```

Expected: all five exit 0. Fix anything that fails before continuing — this is the definition-of-done gate from spec §8.

- [ ] **Step 6: Confirm no migration was created**

Run: `npx prisma migrate status`
Expected: the database is in sync and only the Foundation `init` migration exists. Spec §8 item 7. If a migration appeared, something added a schema change this slice did not need — investigate rather than committing it.

- [ ] **Step 7: Verify the design tokens actually took effect**

Run: `grep -rnE "(gray|blue|red)-[0-9]{2,3}" src/ --include=*.tsx --include=*.ts`
Expected: no output. Spec §8 item 6.

- [ ] **Step 8: Update the README**

In `README.md`, change the sub-project 2 row to `Done`:

```markdown
| 2 | Clinic config, services, therapist availability | Done |
```

And update the verified-state line to the new counts, replacing the existing one:

```markdown
Last full sweep: 27 tables, 15 enums, all Vitest files passing, all Playwright
specs passing across Desktop Chrome and Pixel 7. `tsc --noEmit`, `eslint .` and
`next build` all clean.
```

- [ ] **Step 9: Tick every checkbox in this plan**

Change every `- [ ]` to `- [x]` in `docs/superpowers/plans/2026-08-29-clinic-config.md`.

- [ ] **Step 10: Commit**

```bash
git add tests/e2e/clinic-config.spec.ts tests/e2e/helpers/db.ts README.md docs/superpowers/plans/2026-08-29-clinic-config.md
git commit -m "test: add clinic configuration end-to-end journeys

One journey per screen — save settings, round-trip opening hours including a
closed day, create and deactivate a service, add weekly and dated
availability, publish a testimonial — plus the negative cases: an invalid
cutoff, a reversed time range, a zero duration and an empty testimonial all
surface an inline error rather than saving.

Four role checks: a therapist and a receptionist both get 403 at
/staff/settings even though navigation already hides it, because navigation is
not a security boundary; a patient is redirected to their portal; an anonymous
visitor to login.

resetClinicConfig arms each test's own state, so the mobile project does not
replay specs against what chromium changed and no run needs db:reset first."
```

---

## Definition of Done

From spec §8. Verify each, do not assume:

1. `npx tsc --noEmit`, `npx eslint .` and `npx next build` all clean.
2. The full Vitest suite passes, including the new service and resolution tests.
3. The Playwright suite passes, including the negative role checks.
4. An admin can set opening hours, create a service, and give a therapist availability, all through the browser.
5. `resolveAvailability` returns correct windows for every case in spec §7.
6. The design tokens are in `globals.css` and the Foundation auth screens use them.
7. No new migration exists — `prisma migrate status` reports the database in sync.
8. `src/lib/nav.ts` marks Clinic settings `available: true`, and `tests/unit/nav.test.ts` still passes.

## Out of scope for this slice

Do not build these even if a related file is open: staff account creation and therapist profiles (sub-project 10), file upload for logo or service images (sub-project 6, with the R2 adapter), the PRD-06 §2 dashboard widgets (sub-project 9 — they need appointment and payment data that does not exist), appointment administration and the booking engine (sub-project 3), the public website that consumes this configuration (sub-project 4), service soft-delete in the UI (spec §3.3 — deactivation only), and multiple opening-hours windows per day (spec §3.1).

