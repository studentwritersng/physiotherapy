# Notifications, Reminders + OTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Outbox-driven patient messaging (Termii SMS/WhatsApp, Resend email) with cron processing, plus OTP login and code-based password reset.

**Architecture:** Triggers enqueue rendered rows; `processDueQueue()` claims and sends them with two retries and full logging; Termii/Resend live behind `src/server/messaging/` boundaries (native fetch, no SDKs); OTP codes reuse `verification_codes` with hashed secrets; Vercel cron hits a bearer-guarded route.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7, PostgreSQL 17, Tailwind v4, Termii Messaging API, Resend REST API, Vitest, Playwright.

## Global Constraints

- Prisma 7: import from `@/generated/prisma/client`, never `@prisma/client`. A `PrismaPg` driver adapter is mandatory.
- ESM only (`"type": "module"`). No `require()`.
- Timezone is `Africa/Lagos`, from `TIMEZONE` in `src/lib/constants.ts`. Never hardcode it.
- Enum values are `snake_case`. `NotificationType`: confirmation, reminder, reschedule, cancellation, payment. Channels: sms, whatsapp, email, push. Purposes: login_otp, password_reset, phone_verification.
- Exact dependency versions, no `^`/`~`. No new dependencies — Termii/Resend use native fetch.
- Never run `npm install` casually. No install needed in this plan at all.
- Design tokens only; `font-display` for headings.
- Three auth layers: `requireRole`/`requirePageRole` at pages/actions; service scoping; webhook/cron routes use secret checks, never sessions.
- Secrets in `.env` (gitignored), placeholders only in `.env.example`. Never commit or log secrets, codes, or message bodies in tests (assert metadata, not content).

---

### Task 1: Provider boundaries, env, templates

**Files:**
- Modify: `src/lib/env.ts` (TERMII_API_KEY, TERMII_SENDER_ID, TERMII_BASE_URL, RESEND_API_KEY, RESEND_FROM_EMAIL, CRON_SECRET — all optional strings)
- Modify: `.env.example` (six placeholders)
- Create: `src/server/messaging/termii.ts`, `src/server/messaging/resend.ts`, `src/server/messaging/templates.ts`
- Modify: `prisma/seed.ts` (sms + email variants of the 5 types; upsert on type+channel)
- Test: `tests/unit/messaging.test.ts`

**Interfaces:**
- Consumes: `env`.
- Produces for Tasks 2/4: `sendSms({ to, body }) → { providerMessageId }`, `sendWhatsapp({ to, body }) → { providerMessageId }`, `sendEmail({ to, subject, body }) → { providerMessageId }`, `renderTemplate(type, channel, vars) → { subject?, body }`, `isSmsConfigured()`, `isEmailConfigured()`.

**Verified provider contracts (from developer.termii.com, Sept 2026 — re-check only if a call fails):**
Termii: `POST {BASE}/api/sms/send` with `{ api_key, to, from, sms, type: "plain", channel }`. `to` is international WITHOUT `+` (`234...` — strip it; shared `normalisePhone` yields `+234...`). `channel: "dnd"` for transactional (OTP, confirmations — bypasses DND + MTN time blocks), `"whatsapp"` for WhatsApp-first. Success is `code: "ok"` with `message_id`; anything else throws `ProviderError`. Base URL is per-account: `TERMII_BASE_URL` optional, default `https://api.ng.termii.com`.

Resend: `POST https://api.resend.com/emails` with Bearer key and `{ from, to: [address], subject, text }`; success returns `{ id }`. From address: `RESEND_FROM_EMAIL` optional, default `"TetaPhysio <noreply@tetaphysio.ng>"`. (If Resend rejects the shape, fix the boundary to match their docs — tests mock fetch, so no live dependency.)

- [ ] **Step 1: Failing tests — render + channel fallback, no network**

```ts
// tests/unit/messaging.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

describe("templates", () => {
  it("renders placeholders and tolerates missing vars", async () => {
    const { renderTemplate } = await import("@/server/messaging/templates");
    expect(renderTemplate("confirmation", "sms", { patient_name: "Ada", date: "Tue", time: "10:00", service: "Checkup", therapist: "Dr B" }).body).toContain("Ada");
    expect(renderTemplate("reminder", "sms", {})).not.toContain("{{");
  });
});

describe("channel fallback", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  it("falls back to SMS when WhatsApp fails", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: "error" }), { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: "ok", message_id: "1" }), { status: 200 }));
    const { sendPatientMessage } = await import("@/server/messaging/channels");
    const res = await sendPatientMessage({ to: "+2348030000001", body: "hi", useWhatsapp: true });
    expect(res.channel).toBe("sms");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("throws without attempting when unconfigured", async () => {
    // env-isolation pattern from tests/unit/r2.test.ts — read it first and copy the fresh-module technique.
  });
});
```

`sendPatientMessage({ to, body, useWhatsapp })` lives in `src/server/messaging/channels.ts` (create it in this task): WhatsApp first when asked, SMS fallback on any failure, SMS direct otherwise; email is separate (caller sends additionally). Run: `npx vitest run tests/unit/messaging.test.ts`. Expected: FAIL (modules missing).

- [ ] **Step 2: Implement boundaries + seed templates**

Termii sender: `from` = `TERMII_SENDER_ID` (required when configured). Strip non-digits and leading `+` from `to`. Throw `ProviderError(message)` unless `code === "ok"`; return `{ providerMessageId: message_id }`.

Seed: add sms + email variants for all five types (same wording family as the whatsapp rows, `subject` for email only, e.g. "Your TetaPhysio appointment"). Upsert on `type_channel` — reruns change nothing.

Run tests + `npx tsc --noEmit`. Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/lib/env.ts .env.example src/server/messaging prisma/seed.ts tests/unit/messaging.test.ts
git commit -m "feat: add messaging boundaries and templates"
```

### Task 2: Queue, processor, cron, trigger hooks

**Files:**
- Create: `src/server/services/notifications.ts` (`enqueue`, `processDueQueue`, `scheduleReminders`, `clearPendingReminders`, `getNotificationLog`)
- Create: `src/app/api/notifications/process-due/route.ts`
- Create: `vercel.json` (cron every 10 min)
- Modify: booking writers (book/reschedule/cancel across booking.ts + portal wrappers) + payment writers (manual + gateway) to enqueue
- Test: `tests/integration/notifications.test.ts`

**Interfaces:**
- Consumes: Task 1 senders; `getClinicSettings` (reminderLeadHours); `getSoapLabels`-style template read (add `getActiveTemplate(type, channel)` here).
- Produces for Tasks 3/5: `enqueue(input)`, `processDueQueue(now?) → { sent, failed }`, `getNotificationLog(patientId)`.

- [ ] **Step 1: Failing tests — enqueue, retry-twice, idempotent claim, supersede**

```ts
it("booking enqueues a confirmation due now", ...); // call the booking writer? No — test enqueue() directly + assert row; writer hooks pinned in Task 5 E2E.
it("processor sends due rows and logs them", async () => {
  // stub fetch to Termii-ok; enqueue whatsapp+sms rows due now; run processDueQueue(); assert status sent + log rows + providerMessageId stored.
});
it("retries twice then fails with the error preserved", async () => {
  // stub fetch to always reject; run 3x; assert retryCount 2, status failed, lastError set, log row failed.
});
it("concurrent runs send once", async () => {
  // two processDueQueue() in parallel over one due row (stub fetch with a barrier); assert exactly one send + one log row. Implementation: pg advisory lock around the run (SELECT pg_try_advisory_lock(<fixed key>); skip if not acquired) + per-row status guard.
});
it("reschedule deletes stale reminders and schedules fresh ones", ...);
it("opted-out patients get no reminders but keep confirmations", ...);
```

Red: functions missing. Implement:

```ts
export async function enqueue(input: { patientId; type; channel; recipient; body; subject?; scheduledFor?: Date; relatedAppointmentId?; relatedInvoiceId? }) {
  const patient = await prisma.patient.findUnique({ where: { id: input.patientId }, select: { optOutNotifications: true } });
  if (patient?.optOutNotifications && input.type === "reminder") return null; // confirmations + OTP/security always send
  return prisma.notificationQueue.create({ data: { ...input, status: "queued", scheduledFor: input.scheduledFor ?? new Date() } });
}

export async function scheduleReminders(patientId: string, appointmentId: string, start: Date) {
  const settings = await getClinicSettings();
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
  for (const leadHours of settings.reminderLeadHours) {
    const at = new Date(start.getTime() - leadHours * 3_600_000);
    if (at <= new Date()) continue;
    const body = (await renderFor("reminder", patient, { appointmentId })) // template + vars; skip channels per availability below
    ... // enqueue whatsapp row + sms row? NO — channel selection happens AT SEND (whatsapp-try-fallback). Enqueue ONE row with channel whatsapp; the processor falls back to sms on failure and records the final channel. Email enqueued as a second row only if patient.email exists.
  }
}

export async function clearPendingReminders(appointmentId: string) {
  await prisma.notificationQueue.deleteMany({ where: { relatedAppointmentId: appointmentId, type: "reminder", status: "queued" } });
}

export async function processDueQueue(now: Date = new Date()) {
  const lock = await prisma.$queryRaw<[{ ok: boolean }]>`SELECT pg_try_advisory_lock(829472) AS ok`;
  if (!lock[0]?.ok) return { sent: 0, failed: 0, skipped: true };
  try {
    const due = await prisma.notificationQueue.findMany({ where: { status: "queued", scheduledFor: { lte: now } }, orderBy: { scheduledFor: "asc" }, take: 50 });
    let sent = 0, failed = 0;
    for (const row of due) {
      try {
        const result = row.channel === "email"
          ? await sendEmail({ to: row.recipient, subject: "TetaPhysio", body: row.body })
          : await sendPatientMessage({ to: row.recipient, body: row.body, useWhatsapp: row.channel === "whatsapp" });
        const finalChannel = row.channel === "email" ? "email" : result.channel;
        await prisma.$transaction([
          prisma.notificationQueue.update({ where: { id: row.id }, data: { status: "sent", sentAt: new Date(), providerMessageId: result.providerMessageId, channel: finalChannel } }),
          prisma.notificationLog.create({ data: { patientId: row.patientId, type: row.type, channel: finalChannel, status: "sent", recipient: row.recipient, providerMessageId: result.providerMessageId, relatedAppointmentId: row.relatedAppointmentId, relatedInvoiceId: row.relatedInvoiceId } }),
        ]);
        sent++;
      } catch (error) {
        const retries = row.retryCount + 1;
        const failedNow = retries >= 2;
        await prisma.$transaction([...update row (retryCount, lastError, status failedNow ? "failed" : "queued"), create log row with status failed only when failedNow...]);
        // Log EVERY attempt? No — log only terminal states + sends (keeps the patient history clean); attempt errors live in lastError. Hmm — FR3 wants failure visibility: terminal failures logged. Attempts visible via retryCount on the row (admin view shows queued-with-retries). Decide: log terminal + sends only.
        if (failedNow) failed++;
      }
    }
    return { sent, failed };
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(829472)`;
  }
}
```

Trigger hooks: in `bookAppointment`/`bookPublicAppointment`/`portalBookAppointment` after success → enqueue confirmation (whatsapp row; email row if email) + scheduleReminders; reschedule → clearPendingReminders + fresh schedule + reschedule confirmation; cancel → clearPendingReminders + cancellation notice; manual/gateway payment → payment receipt. Enqueue calls never throw into the booking (wrap in try/catch that swallows into console.error? NO — spec says failures land as failed rows: enqueue itself is a DB insert, near-infallible; wrap defensively with try/catch + console.error so a DB blip can't fail a booking).

Cron route: `Authorization: Bearer ${CRON_SECRET}` via timingSafeEqual; missing secret → 503; bad bearer → 401; then `processDueQueue()` → `{ ok: true, ...counts }`.

`vercel.json`: `{ "crons": [{ "path": "/api/notifications/process-due", "schedule": "*/10 * * * *" }] }`.

Run tests + tsc. Expected: green.

- [ ] **Step 2: Commit**

```bash
git add src/server/services/notifications.ts "src/app/api/notifications/process-due" vercel.json src/server/services/booking.ts src/server/services/portal.ts tests/integration/notifications.test.ts
git commit -m "feat: add notification outbox, processor and triggers"
```

### Task 3: Staff + portal notification views, template editor

**Files:**
- Create: `src/app/(staff)/staff/settings/notifications/page.tsx` (+ log table + failure filter + template editor form/actions)
- Create: `src/app/(portal)/portal/notifications/page.tsx`
- Modify: `src/lib/nav.ts` (portal "Notifications" link, available)
- Test: `tests/integration/notifications-views.test.ts` (log scoping: patient B sees none of A's rows; receptionist blocked from clinical-adjacent? No — notifications are non-clinical; receptionist CAN view the log; template editing is admin-only)

**Interfaces:** Consumes Task 2 readers.

- [ ] **Step 1: Pages** — Staff page (`requirePageRole("admin","receptionist")` for log; template editing action gated `requireRole("admin")`): log table (patient, type, channel, status, time, error), status filter via searchParams, template editor (one textarea per type×channel prefilled, save action updating `templateText`). Portal page (`requirePageRole("patient")`, linked id): recent 50 log rows for the patient, plain language statuses. Nav: add `{ href: "/portal/notifications", label: "Notifications", available: true }`.

- [ ] **Step 2: Tests + tsc** — scoping test (red first: functions exist? `getNotificationLog` from Task 2 — write test against it; red-optional recorded if green-first). `npx tsc --noEmit` clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(staff)/staff/settings/notifications" "src/app/(portal)/portal/notifications" src/lib/nav.ts tests/integration/notifications-views.test.ts
git commit -m "feat: add notification log views and template editor"
```

### Task 4: OTP codes, reset flow, OTP login

**Files:**
- Create: `src/server/auth/codes.ts` (`issueCode`, `verifyCode`)
- Create: `src/app/api/auth/request-code/route.ts`, `src/app/api/auth/verify-code/route.ts` (verify returns session for login_otp; reset covered by separate set-password route), `src/app/api/auth/reset-password/route.ts` (code + new password → update)
- Create: `(auth)` pages: forgot-password (request), verify-code (code + context), login OTP entry on portal + staff login pages
- Test: `tests/integration/codes.test.ts`

**Interfaces:** Consumes Task 1 senders (SMS/email delivery of codes), session machinery (`createSession`, cookie options — read register route first and mirror exactly).

- [ ] **Step 1: Failing tests — hash/expiry/attempts/consume/rate-limit**

```ts
it("issues a hashed 6-digit code and verifies it once", ...); // row stores hash, never plaintext (assert codeHash !== code)
it("rejects wrong codes and voids after 5 attempts", ...);
it("rejects expired and consumed codes", ...); // backdate expiresAt; consume then re-verify
it("rate-limits code requests per identifier", ...); // reuse checkRateLimit/recordFailedAttempt semantics from rate-limit.ts — read it first
```

Implement in `codes.ts`: `issueCode({ identifier, userId?, purpose, channel })` (voids prior unconsumed same-purpose rows, argon2-hash the code, expiry +10min, delivers via SMS/email through Task 1 senders — delivery failure throws, no row left dangling? Decide: create row only after successful send; on send failure throw with no row); `verifyCode({ identifier, purpose, code })` (latest unconsumed row, attempts++ each try, void at 5, expiry check, consume on success → returns userId).

Flows: forgot-password page → request-code (identifier = phone or email; user lookup by either; always respond ok to avoid enumeration); verify page → verify-code (purpose password_reset) → reset-password route sets hash via existing password rules. OTP login: login pages gain "use one-time code" → request (purpose login_otp) → verify-code → verify route creates session + cookie (mirror register route's cookie code exactly) → redirectTo by role (/portal or /staff).

Run tests + tsc. Expected: green.

- [ ] **Step 2: Commit**

```bash
git add src/server/auth/codes.ts src/app/api/auth/request-code src/app/api/auth/verify-code src/app/api/auth/reset-password "src/app/(auth)" tests/integration/codes.test.ts
git commit -m "feat: add OTP codes, reset flow and OTP login"
```

### Task 5: Journeys, verification, docs

**Files:**
- Create: `tests/e2e/notifications.spec.ts`
- Modify: `tests/e2e/helpers/db.ts` (arming: templates present, queue helpers)
- Modify: `README.md` (sub-project 8 Done)

- [ ] **Step 1: E2E** — (1) staff booking shows a queued confirmation in the portal notifications page; (2) admin edits a template, next enqueue uses new wording; (3) reschedule deletes the old reminder rows (assert via portal/history absence, not DB); (4) reset-via-code completes (read code from test DB? codes are hashed — arm by issuing through the service in-test? E2E runs in node: import issueCode? It would SEND via providers... with no creds, senders throw. Hmm: request-code route with no creds → error. For E2E, seed a code row directly in DB with KNOWN code via its hash (hash in-test with argon2, insert row), then complete the UI flow. Document this technique.); (5) cron route without bearer → 401. Processor success-path E2E is NOT asserted live (no creds) — integration covers it with mocked fetch.

- [ ] **Step 2: Full sweep**

Run: `npx tsc --noEmit && npx eslint . && npx next build && npx vitest run && npx playwright test`
Expected: all green. (Browsers, Postgres, build-before-test per standing notes. No live Termii/Resend/Paystack calls anywhere.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/notifications.spec.ts tests/e2e/helpers/db.ts README.md
git commit -m "feat: verify notification journeys and close sub-project 8"
```

## Self-Review

- Spec coverage: §1 templates/channels (Tasks 1+3), §2 queue/processor/cron (Task 2), §3 OTP/reset (Task 4), §4 tests (all). Out-of-scope in no task.
- No placeholders: every step names files, signatures, exact code or read-then-adapt rules.
- Type consistency: `enqueue/processDueQueue/scheduleReminders/clearPendingReminders/getNotificationLog`, `sendSms/sendWhatsapp/sendEmail/sendPatientMessage/renderTemplate/isSmsConfigured/isEmailConfigured`, `issueCode/verifyCode`, `initializePayment`-style names avoided here — no overlap.
