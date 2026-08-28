# PRD 08 — Notifications & Reminders

## 1. Purpose

Keep patients informed and reduce no-shows through timely, low-friction messages via the channels Nigerian patients actually use: SMS and WhatsApp, with email as a secondary channel.

## 2. Channels

| Channel | Use case | Provider (indicative) |
|---|---|---|
| SMS | Universal reach, works on any phone | Termii or similar Nigerian SMS aggregator |
| WhatsApp | Primary channel where patient has WhatsApp | WhatsApp Business API (via Termii or Meta BSP) |
| Email | Secondary, for patients who provided an email | Transactional email provider |
| Push (mobile app) | For patients using the Capacitor app | Native push (FCM/APNs) — nice-to-have, not launch-blocking |

- FR1: Channel selection logic: try WhatsApp first if patient has WhatsApp/phone confirmed capable, fall back to SMS; email sent additionally if address on file.
- FR2: Third-party SMS/WhatsApp usage charges are billed separately from the platform (per proposal) — system should track message count for cost visibility, not manage billing itself.

## 3. Notification Types

| Trigger | Message |
|---|---|
| Appointment booked | Confirmation with date/time/service/therapist |
| Appointment reminder | Sent X hours before (admin-configurable, e.g., 24h and/or 2h before) |
| Appointment rescheduled | New date/time confirmation |
| Appointment cancelled | Cancellation confirmation |
| Payment confirmation | Receipt-style message after payment recorded/received |

## 4. Functional Requirements

- FR1: All templates are editable by Admin (simple text with placeholders like `{{patient_name}}`, `{{date}}`, `{{time}}`) — no code changes needed to tweak wording.
- FR2: Failed sends are retried a limited number of times (e.g., 2 retries) then logged as failed — visible to admin, not silently dropped.
- FR3: A simple notification log exists per patient (what was sent, when, via which channel, delivery status if the provider reports it).
- FR4: Reminders are sent by a scheduled job (cron/queue), checking upcoming appointments against the configured lead time.
- FR5: Opt-out respected if a patient explicitly requests not to be messaged (simple flag on patient profile).

## 5. Out of Scope

- Two-way WhatsApp conversation automation/chatbot
- Marketing broadcast campaigns
- Rich push notification workflows (badges, deep-linking beyond basic open-app)

## 6. Data Model Touchpoints

`notifications`, `notification_templates`, `notification_log` — see PRD 11.

## 7. Success Criteria

- A booked appointment triggers a confirmation message within 1 minute.
- Reminders reliably go out at the configured lead time without manual admin action.
- Admin can change reminder wording without developer involvement.
