# Sub-project 8 design: Notifications & reminders + OTP (PRD-08)

Approach A (approved): outbox + provider boundaries, cron processor. Triggers
enqueue rendered rows; one processor sends due rows via Termii/Resend with two
retries and full logging; OTP/reset reuse verification codes. No migration —
`notification_templates` (unique type+channel), `notification_queue` (retry
counter, error reason), `notification_log`, `verification_codes` (hashed
codes), and `device_tokens` all exist.

## §1 Templates + channel logic

- Seeded templates per type (confirmation, reminder, reschedule,
  cancellation, payment) × channel (whatsapp, sms, email) with
  `{{patient_name}}`, `{{date}}`, `{{time}}`, `{{service}}`, `{{therapist}}`,
  `{{amount}}`, `{{balance}}` placeholders; editable in staff settings with
  blank-means-default scoping per template (no code changes for wording).
- Channel selection per send: WhatsApp first, automatic retry of the same
  body via SMS on provider failure/unknown-recipient. Email sent
  additionally whenever the patient has an address. No per-patient
  capability flag — capability is proven by delivery, not stored.
- Opt-out (`optOutNotifications`) suppresses reminders only. Booking
  confirmations and OTP/security codes always send.

## §2 Queue + processor + cron

- Outbox lifecycle: `queued → sent`, or `→ failed` after 2 retries with
  `lastError` preserved. Every send appends the `notification_log` mirror
  (patient, type, channel, status, provider id or error) — the per-patient
  history and the admin failure list read from it. Staff visibility lives at
  `/staff/settings/notifications` (log table, failure filter); template
  editing sits alongside in settings content. Patients see their recent
  notifications at `/portal/notifications` (nav-linked, same pattern as the
  billing page).
- `POST /api/notifications/process-due` guarded by `CRON_SECRET` bearer;
  `vercel.json` cron every 10 minutes. Processor claims due rows
  (`status queued`, `scheduledFor <= now`), sends, updates, logs.
- Booking, reschedule, cancel, and payment actions enqueue on success — the
  enqueue never throws into the booking flow (failures land in the queue as
  failed rows, visible to admin, never silent).
- Reminders are scheduled at booking time from the clinic's
  `reminderLeadHours` (default [24, 2]); reschedule/cancel DELETES still-
  queued reminder rows for the old appointment (they were never sent, so no
  log entry exists to preserve) and schedules fresh ones — patients never get
  stale nudges.

## §3 OTP + password reset

- Codes: 6 digits, argon2-hashed at rest (never plaintext, like passwords),
  10-minute expiry, max 5 verification attempts then void, single-use
  consume. Rate-limited per identifier on the existing login throttle.
- Reset flow: request code (SMS to the account phone, email if on file) →
  verify → set new password (existing password rules apply).
- OTP login: request code → verify → session through the existing session
  machinery (same cookie, same roles). Password login stays untouched.
- Sender credentials (`TERMII_API_KEY`, `TERMII_SENDER_ID`, `RESEND_API_KEY`,
  `CRON_SECRET`) live in `.env` (gitignored), placeholders only in
  `.env.example`. Without keys, sends stay queued with a "provider not
  configured" error and the UI says so — dev/CI never need live providers.

## §4 Testing

- Unit: template rendering (placeholders, missing-data fallback),
  signature-free channel selection, kobo-style integer handling where money
  appears in bodies, code hashing/verify/expiry logic.
- Integration: enqueue-on-booking, supersede-on-reschedule, retry-twice-then-
  failed with error preserved, idempotent processor claim (two concurrent
  runs send once), OTP wrong-code attempt counting and voiding, expired and
  consumed codes rejected.
- E2E: booking shows a queued confirmation in the patient log view; admin
  edits a template without code; reschedule supersedes the old reminder;
  reset-via-code completes end to end (code read from test DB, never a real
  SMS).

## Out of scope (per PRD-08 §5)

Two-way WhatsApp automation, marketing broadcasts, rich push workflows
(device tokens are collected for the Capacitor app in sub-project 11, not
used here).
