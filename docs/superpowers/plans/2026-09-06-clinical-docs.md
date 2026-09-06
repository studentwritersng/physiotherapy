# Clinical Documentation + Treatment Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give therapists structured assessment, SOAP, plan/exercise, and R2 document workflows on a patient-record hub, with episodes, edit rules, and portal visibility.

**Architecture:** New `src/server/services/clinical.ts` owns episodes, assessments, notes, and plans (all scoped through `canViewPatient`/`assertCanReadClinical` from `patient.ts`); new `src/server/storage/r2.ts` isolates Cloudflare R2 behind presigned URLs; staff pages under `(staff)/staff/patients/` plus a thin `/staff/today`. One Prisma migration adds a single `soap_labels` JSON column.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7, PostgreSQL 17, Tailwind v4, Cloudflare R2 via `@aws-sdk/client-s3@3.1127.0` + `@aws-sdk/s3-request-presigner@3.1127.0`, Vitest, Playwright.

## Global Constraints

- Prisma 7: import from `@/generated/prisma/client`, never `@prisma/client`. A `PrismaPg` driver adapter is mandatory.
- ESM only (`"type": "module"`). No `require()`.
- Timezone is `Africa/Lagos`, from `TIMEZONE` in `src/lib/constants.ts`. Never hardcode it.
- Enum values are `snake_case` (`in_session`, `active`, `discharged`, `xray`, `mri`). Display casing is a UI concern.
- Exact dependency versions, no `^`/`~`. `@aws-sdk/client-s3@3.1127.0` is already installed; `@aws-sdk/s3-request-presigner@3.1127.0` is the ONE additional install this plan allows (single approved exception to no-new-deps).
- Never run `npm install` casually; the single `npm install -S @aws-sdk/s3-request-presigner@3.1127.0` in Task 1 is the only permitted install, then pin exact in package.json + package-lock.json.
- Design tokens only; no raw palette utilities. `font-display` for headings.
- Three auth layers: `requireRole`/`requirePageRole` at pages and actions; scope checks (`canViewPatient`, `assertCanReadClinical`, author checks) in every clinical service; ids from session or verified params, never trusted blindly.
- Route handlers / Server Actions parse, authorize, delegate to `src/server/**`, serialize. No business logic in actions.
- R2 credentials live in `.env` (gitignored) with placeholders only in `.env.example`. Never commit secrets. Never log file contents or credentials.

---

### Task 1: R2 storage module, env, presigner dependency

**Files:**
- Modify: `src/lib/env.ts` (4 optional R2 strings)
- Create: `src/server/storage/r2.ts`
- Modify: `package.json`, `package-lock.json` (pin presigner)
- Test: `tests/unit/r2.test.ts`

**Interfaces:**
- Consumes: `env` (Task: extend it), `@aws-sdk/client-s3` (installed).
- Produces for Task 6: `isStorageConfigured(): boolean`, `presignedPutUrl(input: { patientId: string; fileName: string; contentType: string; sizeBytes: number }): Promise<{ url: string; key: string }>`, `presignedGetUrl(key: string): Promise<string>`.

- [ ] **Step 1: Failing tests — validation rejects before any network**

```ts
// tests/unit/r2.test.ts
import { describe, expect, it } from "vitest";
import { isStorageConfigured, buildDocumentKey, MAX_DOCUMENT_BYTES } from "@/server/storage/r2";

describe("r2", () => {
  it("is not configured without credentials", () => {
    expect(isStorageConfigured()).toBe(false); // CI has no R2_* set
  });
  it("rejects non-PDF/image types and oversize files without signing", async () => {
    const { presignedPutUrl } = await import("@/server/storage/r2");
    await expect(
      presignedPutUrl({ patientId: "p", fileName: "evil.exe", contentType: "application/x-msdownload", sizeBytes: 100 }),
    ).rejects.toThrow(/type/i);
    await expect(
      presignedPutUrl({ patientId: "p", fileName: "big.pdf", contentType: "application/pdf", sizeBytes: MAX_DOCUMENT_BYTES + 1 }),
    ).rejects.toThrow(/size|10\s?MB/i);
  });
  it("builds scoped keys", () => {
    expect(buildDocumentKey("p1", "X-Ray (1).PDF")).toMatch(/^patients\/p1\/[0-9a-f-]{36}-x-ray-1\.pdf$/);
  });
});
```

Run: `npx vitest run tests/unit/r2.test.ts`
Expected: FAIL with "Cannot find module '@/server/storage/r2'".

- [ ] **Step 2: Install the presigner and extend env**

Run: `npm install -S @aws-sdk/s3-request-presigner@3.1127.0` (the plan's only permitted install).

Then edit `package.json` + `package-lock.json` root dependencies entry to `"@aws-sdk/s3-request-presigner": "3.1127.0"` (strip the `^` npm writes).

In `src/lib/env.ts`, add to the schema:

```ts
R2_ACCOUNT_ID: z.string().min(1).optional(),
R2_ACCESS_KEY_ID: z.string().min(1).optional(),
R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
R2_BUCKET: z.string().min(1).optional(),
```

- [ ] **Step 3: Storage module**

```ts
// src/server/storage/r2.ts
import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

export function isStorageConfigured(): boolean {
  return Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET);
}

function client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
  });
}

export function buildDocumentKey(patientId: string, fileName: string): string {
  const base = fileName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
  return `patients/${patientId}/${randomUUID()}-${base}`;
}

function checkFile(contentType: string, sizeBytes: number): string {
  const ext = ALLOWED[contentType];
  if (!ext) throw new Error("Only PDF, JPG and PNG files are accepted");
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_DOCUMENT_BYTES) {
    throw new Error("Files must be under 10MB");
  }
  return ext;
}

export async function presignedPutUrl(input: { patientId: string; fileName: string; contentType: string; sizeBytes: number }): Promise<{ url: string; key: string }> {
  if (!isStorageConfigured()) throw new Error("Document storage is not configured");
  checkFile(input.contentType, input.sizeBytes);
  const key = buildDocumentKey(input.patientId, input.fileName);
  const url = await getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: env.R2_BUCKET!, Key: key, ContentType: input.contentType }),
    { expiresIn: 600 },
  );
  return { url, key };
}

export async function presignedGetUrl(key: string): Promise<string> {
  if (!isStorageConfigured()) throw new Error("Document storage is not configured");
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }), { expiresIn: 600 });
}
```

Run: `npx vitest run tests/unit/r2.test.ts` then `npx tsc --noEmit`. Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/env.ts src/server/storage/r2.ts tests/unit/r2.test.ts package.json package-lock.json
git commit -m "feat: add R2 storage module with validation-first presigning"
```

### Task 2: Patients hub, record shell, today-view, nav

**Files:**
- Create: `src/app/(staff)/staff/patients/page.tsx` (searchable list via `listPatientsForActor`)
- Create: `src/app/(staff)/staff/patients/[id]/page.tsx` (record shell: profile, intake, chronological timeline of everything; clinical sections gated by `assertCanReadClinical`)
- Create: `src/app/(staff)/staff/today/page.tsx` (today's visits via `getDaySchedule(todayKey(), actor.id)` for therapists, all for admin; status pills + record links)
- Modify: `src/lib/nav.ts` (therapist "My patients" → available, drop note; reception stays for sub-project 10)
- Test: `tests/integration/patients-hub.test.ts` (list scoping per role)

**Interfaces:**
- Consumes: `canViewPatient`, `getPatientForActor`, `listPatientsForActor`, `assertCanReadClinical` (patient.ts); `getDaySchedule` (schedule.ts); `requirePageRole`.
- Produces for Tasks 3–6: the `/staff/patients/[id]` shell with section anchors (`#assessments`, `#notes`, `#plans`, `#documents`) later tasks render into; `getRecordTimeline(patientId)` shape (see Step 2).

- [ ] **Step 1: Failing test — therapist list shows only shared patients**

```ts
// tests/integration/patients-hub.test.ts
it("a therapist lists only patients they share an appointment with", async () => {
  // arm: therapist T, patients A (appointment with T) and B (appointment with other)
  const list = await listPatientsForActor({ id: t.id, role: "therapist" } as SessionUser, {});
  expect(list.map((p) => p.id)).toEqual([a.id]);
});
it("a receptionist lists all active patients", ...); // lengths, not ids
```

Read `tests/helpers/db.ts` (`testPrisma`, `truncateAll`) and the `SessionUser` type first; arm rows directly with prisma. Run: `npx vitest run tests/integration/patients-hub.test.ts`. Expected: FAIL (import of nothing new — these functions exist, so write the test against real behavior; if it passes immediately, strengthen with the search-filter case until red, then implement any gap. The deliverable is the pages, so red-optional here is recorded, not skipped).

- [ ] **Step 2: Record shell + timeline service**

Add to a new `src/server/services/clinical.ts`:

```ts
export async function getRecordTimeline(patientId: string) {
  const [assessments, notes, plans, documents, episodes] = await Promise.all([
    prisma.assessment.findMany({ where: { patientId }, orderBy: { createdAt: "desc" } }),
    prisma.sessionNote.findMany({ where: { patientId }, orderBy: { createdAt: "desc" } }),
    prisma.treatmentPlan.findMany({ where: { patientId }, orderBy: { createdAt: "desc" } }),
    prisma.patientDocument.findMany({ where: { patientId }, orderBy: { uploadedAt: "desc" } }),
    prisma.episodeOfCare.findMany({ where: { patientId }, orderBy: { startedAt: "desc" } }),
  ]);
  return { assessments, notes, plans, documents, episodes };
}
```

Every caller gates first: `getPatientForActor(actor, id)` (null → notFound) and `assertCanReadClinical(actor)` around clinical sections only — receptionists see profile + intake sections, never the timeline's clinical rows (filter clinical arrays to empty for them rather than hiding the page).

Pages: list (search box as GET form, 25/page), record shell (profile card, intake card from `IntakeForm` latest row, timeline grouped by episode then date), today (therapist: `getDaySchedule(todayKey(), actor.id)`; admin: all; receptionist: redirect to appointments — today-view is a therapist tool).

Run: `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/server/services/clinical.ts "src/app/(staff)/staff/patients" "src/app/(staff)/staff/today" src/lib/nav.ts tests/integration/patients-hub.test.ts
git commit -m "feat: add patients hub, record shell and today view"
```

### Task 3: Episodes + assessments

**Files:**
- Modify: `src/server/services/clinical.ts` (episode + assessment writers)
- Create: `src/lib/zod/clinical.ts` (assessmentSchema)
- Create: `src/app/(staff)/staff/patients/[id]/assessments/actions.ts` + form component
- Test: `tests/integration/clinical-assessment.test.ts`

**Interfaces:**
- Consumes: `assertCanReadClinical`, record shell anchors (Task 2).
- Produces for Task 4/6: `getOpenEpisode(patientId)`, episode auto-creation behavior.

- [ ] **Step 1: Failing tests — auto-episode, one-per-episode, discharge blocks**

```ts
it("first assessment opens an episode with the complaint as reason", ...);
it("second assessment joins the open episode, never duplicates", ...); // upsert-by-episode: count stays 1
it("writes to a discharged episode are rejected", ...);
it("a forged patient id returns nothing", ...); // getPatientForActor null path
```

Red: functions missing. Implement in `clinical.ts`:

```ts
export async function getOpenEpisode(patientId: string) {
  return prisma.episodeOfCare.findFirst({ where: { patientId, status: "active" }, orderBy: { startedAt: "desc" } });
}

export async function submitAssessment(actor: SessionUser, patientId: string, input: AssessmentInput) {
  assertCanReadClinical(actor);
  if (actor.role === "therapist") { /* author becomes primary on auto-create */ }
  const parsed = assessmentSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    let episode = input.episodeId
      ? await tx.episodeOfCare.findFirst({ where: { id: input.episodeId, patientId, status: "active" } })
      : await tx.episodeOfCare.findFirst({ where: { patientId, status: "active" }, orderBy: { startedAt: "desc" } });
    if (input.episodeId && !episode) throw new Error("Episode is discharged or missing — start a new one");
    if (!episode) {
      episode = await tx.episodeOfCare.create({
        data: { patientId, primaryTherapistId: actor.role === "therapist" ? actor.id : null, reason: parsed.chiefComplaint ?? "Assessment", status: "active" },
      });
    }
    const existing = await tx.assessment.findFirst({ where: { episodeId: episode.id } });
    const data = { ...parsed, patientId, therapistId: actor.id, episodeId: episode.id };
    if (existing) return tx.assessment.update({ where: { id: existing.id }, data });
    return tx.assessment.create({ data });
  });
}

export async function dischargeEpisode(actor: SessionUser, episodeId: string) {
  assertCanReadClinical(actor);
  await prisma.episodeOfCare.update({ where: { id: episodeId }, data: { status: "discharged", dischargedAt: new Date() } });
}

export async function startEpisode(actor: SessionUser, patientId: string, reason: string) {
  assertCanReadClinical(actor);
  return prisma.episodeOfCare.create({ data: { patientId, primaryTherapistId: actor.role === "therapist" ? actor.id : null, reason: reason.trim(), status: "active" } });
}
```

Note: `patientId` scoping — every writer re-checks `canViewPatient(actor, patientId)` first (therapist with no shared appointment must fail even for valid ids). Add that line above `assertCanReadClinical` in each writer; tests pin it.

Assessment fields: chiefComplaint, history, examination, assessment, treatmentGoals, treatmentPlan — all optional trimmed text (an in-progress assessment saves partial). `episodeId`: optional UUID string.

Run tests, then `npx tsc --noEmit`. Expected: green.

- [ ] **Step 2: Assessment UI on the record page** — form under `#assessments` (prefill latest), episode picker (open episode default + "new episode" reason field), discharge button per open episode. Actions follow the Task-1-established pattern (`requireRole`, `requirePageRole` on pages, `@/server/action-state`, `SubmitButton`/`FormStatus`, revalidate the record path).

- [ ] **Step 3: Commit**

```bash
git add src/server/services/clinical.ts src/lib/zod/clinical.ts "src/app/(staff)/staff/patients/[id]" tests/integration/clinical-assessment.test.ts
git commit -m "feat: add episodes and assessments with auto-creation"
```

### Task 4: SOAP notes, midnight edit rule, settings relabels

**Files:**
- Modify: `src/server/services/clinical.ts` (note writers)
- Modify: `src/lib/zod/clinical.ts` (noteSchema)
- Create: migration `prisma/migrations/XXXX_add_soap_labels/migration.sql` + schema edit (`soapLabels Json @default("{}")`)
- Modify: `src/lib/zod/clinic.ts` (soapLabelsSchema) + settings content UI (labels form)
- Create: record-page note form + actions
- Test: `tests/integration/clinical-notes.test.ts`

**Interfaces:**
- Consumes: episode join behavior (Task 3).
- Produces: `submitSessionNote`, `getSoapLabels()` for Task 6 E2E.

- [ ] **Step 1: Migration first**

```sql
-- prisma/migrations/XXXX_add_soap_labels/migration.sql
ALTER TABLE "clinic_settings" ADD COLUMN "soap_labels" JSONB NOT NULL DEFAULT '{}';
```

Schema: `soapLabels Json @default("{}") @map("soap_labels")` on ClinicSettings. Run: `npx prisma migrate dev --name add_soap_labels` (local dev DB only; test DB migrates via the test setup). If the migrate command differs in Prisma 7, read `prisma.config.ts` first and use the configured command.

- [ ] **Step 2: Failing tests — one-per-appointment, author-only, midnight boundary**

```ts
const KEYS = ["subjective","objective","treatmentProvided","patientResponse","exercisesInstructions","nextPlan"] as const;

it("creates one note per appointment; resubmit updates", ...);
it("a therapist cannot write notes for another therapist's appointment", ...); // appointment.therapistId !== actor.id → throw
it("an admin cannot write notes (read-only)", ...);
it("same-day edit is silent; next-day edit stamps editedAt/editedBy", async () => {
  // arm createdAt yesterday via direct prisma update, then submit → expect editedAt set + editedById = author
});
it("relabels fall back to SOAP defaults when blank", ...); // getSoapLabels
```

Implement:

```ts
export const SOAP_KEYS = [...] // as above
export async function getSoapLabels(): Promise<Record<string, string>> {
  const s = await prisma.clinicSettings.findUnique({ where: { id: 1 } });
  const raw = (s?.soapLabels ?? {}) as Record<string, unknown>;
  return Object.fromEntries(SOAP_KEYS.map((k) => [k, typeof raw[k] === "string" && raw[k].trim() ? raw[k].trim() : DEFAULT_LABELS[k])));
}

function lagosDayKey(d: Date): string { /* todayKey-equivalent: use todayKey from @/lib/slots on the instant */ }

export async function submitSessionNote(actor: SessionUser, appointmentId: string, input: NoteInput) {
  assertCanReadClinical(actor);
  const appt = await prisma.appointment.findFirst({ where: { id: appointmentId, deletedAt: null } });
  if (!appt) throw new Error("Appointment not found");
  if (!(await canViewPatient(actor, appt.patientId))) throw new Error("Appointment not found");
  if (actor.role !== "therapist" || appt.therapistId !== actor.id) {
    throw new Error("Only the appointed therapist writes session notes");
  }
  const parsed = noteSchema.parse(input); // six optional trimmed texts
  return prisma.$transaction(async (tx) => {
    const existing = await tx.sessionNote.findUnique({ where: { appointmentId } });
    const sameDay = existing && lagosDayKey(existing.createdAt) === lagosDayKey(new Date());
    const episode = await getOpenEpisode(appt.patientId); // joins current episode if any, else null
    const data = { ...parsed, patientId: appt.patientId, therapistId: actor.id, episodeId: episode?.id ?? null };
    if (!existing) return tx.sessionNote.create({ data: { ...data, appointmentId } });
    if (sameDay) return tx.sessionNote.update({ where: { id: existing.id }, data });
    return tx.sessionNote.update({
      where: { id: existing.id },
      data: { ...data, editedAt: new Date(), editedById: actor.id },
    });
  });
}
```

Verify `todayKey` in `@/lib/slots` accepts a Date (it takes `now: Date = new Date()` — check before use; else format with TIMEZONE directly).

Run tests + tsc. Expected: green.

- [ ] **Step 3: Note UI + labels settings** — flat six-field form under `#notes` on the record page (labels from `getSoapLabels()`, "Edited …" marker when `editedAt` set); labels form in settings content (six optional text inputs, save action parallel to `saveAbout`).

- [ ] **Step 4: Commit**

```bash
git add src/server/services/clinical.ts src/lib/zod/clinical.ts prisma/schema.prisma prisma/migrations/XXXX_add_soap_labels "src/app/(staff)/staff/patients/[id]" "src/app/(staff)/staff/settings/content" tests/integration/clinical-notes.test.ts
git commit -m "feat: add SOAP notes with edit rule and label settings"
```

### Task 5: Plans, exercises, visibility, portal gating

**Files:**
- Modify: `src/server/services/clinical.ts` (plan/exercise writers)
- Modify: `src/lib/zod/clinical.ts` (planSchema, exerciseSchema)
- Modify: `src/server/services/portal.ts` (master-switch gate + visible exercises)
- Modify: `src/app/(portal)/portal/page.tsx` (render exercises in treatment card)
- Create: record-page plan UI + actions
- Test: `tests/integration/clinical-plans.test.ts`

**Interfaces:**
- Consumes: episode join (Task 3), record shell (Task 2).
- Produces: plan/exercise ids + visibility semantics for Task 6 E2E.

- [ ] **Step 1: Failing tests — plan CRUD, exercise order, visibility, portal gate**

```ts
it("creates a plan with exercises in sort order", ...);
it("only authoring therapist or admin writes; receptionist fails", ...); // assertCanReadClinical throws for receptionist
it("toggling patientVisible flips portal exposure", async () => {
  // getPortalDashboard(patientId) returns plan only when BOTH master switch on AND plan flag on
});
it("portal lists only patientVisible exercises of the exposed plan", ...);
```

Implement writers (plan: goals/planDetails/frequency/duration/focusAreas/status; exercise: name required, description/imageUrl optional, sortOrder; status change is a plain update). Scope every writer with `canViewPatient` + `assertCanReadClinical`.

Portal fix in `getPortalDashboard`: read `showClinicalToPatients` from clinic settings; `treatmentPlan` resolves only when master AND plan flag are true; add `exercises: [{ name, description }]` filtered `patientVisible: true` of that plan (empty array otherwise). Keep the `{ id, summary }` shape and ADD the exercises array (dashboard page renders it; read the treatment card first and extend minimally).

Run tests + tsc. Expected: green.

- [ ] **Step 2: Plan UI** — plan header form + inline exercise rows + status buttons + visibility toggles under `#plans`. Revalidate record + `/portal` paths (portal card lights up without deploy).

- [ ] **Step 3: Commit**

```bash
git add src/server/services/clinical.ts src/lib/zod/clinical.ts src/server/services/portal.ts "src/app/(portal)/portal/page.tsx" "src/app/(staff)/staff/patients/[id]" tests/integration/clinical-plans.test.ts
git commit -m "feat: add treatment plans, exercises and portal visibility"
```

### Task 6: Documents UI, journeys, verification, docs

**Files:**
- Create: `src/app/(staff)/staff/patients/[id]/documents/actions.ts` + upload component
- Create: `tests/e2e/clinical.spec.ts`
- Modify: `tests/e2e/helpers/db.ts` (clinical arming)
- Modify: `README.md` (sub-project 6 Done + R2 note)

**Interfaces:**
- Consumes: everything above; `presignedPutUrl/presignedGetUrl/isStorageConfigured` (Task 1).

- [ ] **Step 1: Documents UI**

Upload component (client): file picker → POST to a staff-gated action requesting a presigned PUT (validates type/size via Task 1) → browser PUTs bytes direct to R2 → second action creates the `PatientDocument` row (re-validates mime/size/enum, stores key as `fileUrl`, links patient + optional episode/appointment). Download: staff-gated action returning a presigned GET redirect. Without credentials the section shows "Document storage is not configured" (asserted in E2E — CI has no R2_*).

`documentType` from `DocumentType` enum (`referral`, `medical_report`, `xray`, `mri`, `other`).

- [ ] **Step 2: E2E journeys**

`tests/e2e/portal.spec.ts`-style arming in `helpers/db.ts` (therapist account, patient with shared appointment). Journeys: (1) assessment auto-creates an episode visible in the timeline; (2) SOAP note completes and re-renders (flat form, assert under-3-minutes by construction — measure, fail over 180s); (3) flipping a plan visible lights up the portal treatment card (login as patient, assert summary); (4) documents show not-configured without creds; (5) thin today-view lists today's visits. Forged-id and midnight-boundary cases stay integration-covered, not E2E.

- [ ] **Step 3: Full sweep**

Run: `npx tsc --noEmit && npx eslint . && npx next build && npx vitest run && npx playwright test`
Expected: all green. (Playwright browsers live in `%USERPROFILE%\AppData\Local\ms-playwright\` — if absent, `npx playwright install chromium` first. Postgres must be up on 5435; `next build` needs DB reachability for prerendered routes.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/(staff)/staff/patients/[id]/documents" tests/e2e/clinical.spec.ts tests/e2e/helpers/db.ts README.md
git commit -m "feat: verify clinical journeys and close sub-project 6"
```

## Self-Review

- Spec coverage: §1 hub+matrix (Task 2), §2 episodes/assessments (Task 3), §3 SOAP+edit rule (Task 4), §4 plans/exercises/visibility (Task 5), §5 R2 (Tasks 1+6), §6 today-view+relabels+tests (Tasks 2/4/6). Out-of-scope items appear in no task.
- No placeholders: every step names files, signatures, and exact code or read-then-adapt rules with fallbacks.
- Type consistency: `getOpenEpisode`, `submitAssessment`, `dischargeEpisode`, `startEpisode`, `submitSessionNote`, `getSoapLabels`, plan/exercise writers, `presignedPutUrl/presignedGetUrl/isStorageConfigured/buildDocumentKey/MAX_DOCUMENT_BYTES` — identical names across tasks.
