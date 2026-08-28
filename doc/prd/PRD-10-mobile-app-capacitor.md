# PRD 10 — Mobile App (Capacitor: Android + iOS)

## 1. Purpose

Package the patient-facing experience (and optionally a lightweight staff view) as installable Android and iOS apps using **Capacitor**, reusing the existing web codebase instead of building separate native apps.

## 2. Scope of v1 Mobile App

**Primary audience: Patients.** The mobile app wraps the same functionality as the Patient Portal (PRD 04) plus public booking (PRD 03) for logged-out use:

- Public browsing: services, about, contact (optional — could deep-link to web instead of duplicating)
- Appointment booking (new patients / guests)
- Login / account activation
- Patient dashboard
- Appointment management (book, reschedule, cancel, history)
- Profile management
- Intake form
- Treatment info (patient-visible fields)
- Payment info + online payment
- WhatsApp/Call quick actions
- Push notifications for reminders/confirmations (see PRD 08)

**Staff app (optional, phase 2):** A cut-down version for therapists/receptionists (today's schedule, check-in patients, quick session note) can reuse the same shell later — not required for v1 unless the clinic specifically wants staff off web-only.

## 3. Technical Approach

- Capacitor wraps the existing responsive web app (Next.js/React) — same UI codebase, not a rewrite.
- Native shell provides:
  - App icon, splash screen, native navigation feel
  - Push notifications (FCM for Android, APNs for iOS)
  - Native device APIs as needed: camera (for uploading documents/photos), file picker
- Build targets: Android (Play Store) and iOS (App Store) from one codebase via Capacitor's platform projects.

## 4. Functional Requirements

- FR1: All patient portal features (PRD 04) must work equivalently inside the app shell — no feature gap between mobile web and app unless explicitly deferred.
- FR2: App must handle offline/poor connectivity gracefully (loading states, retry prompts, no silent failures) — critical for target network conditions.
- FR3: Push notifications registered on login, tied to patient's device token, feeding into the notification system (PRD 08).
- FR4: App respects the same authentication/session model as web (PRD 01) — login persists across app restarts until token expiry.
- FR5: Camera/file picker access for uploading documents (e.g., referral letter) where relevant, using Capacitor's Camera/Filesystem plugins.
- FR6: App icon, splash screen, and store listings reflect clinic branding (assets provided by client per proposal's client responsibilities).

## 5. Store Considerations

- Google Play: standard app listing, privacy policy link required (basic privacy policy page already needed per PRD 12).
- Apple App Store: same requirement; note Apple's stricter review for apps that are "just a website wrapper" — mitigate by ensuring native feel (navigation, push, camera use) rather than a bare WebView.
- Both stores require a support/contact email and privacy policy URL — both are lightweight deliverables from PRD 02/12.

## 6. Out of Scope (v1)

- Fully separate native codebases (Swift/Kotlin) — Capacitor only
- Offline-first data sync (local database, conflict resolution)
- In-app chat/messaging beyond WhatsApp deep-linking
- Staff-facing native app (deferred, see Section 2)

## 7. Success Criteria

- A patient can install the app, log in, and book/view an appointment with the same ease as the mobile website.
- App passes Play Store and App Store review on first or second submission.
- Push reminder notifications are received reliably on both platforms.
