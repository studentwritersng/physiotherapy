# PRD 12 — Security & Data Privacy (Lightweight Baseline)

## 1. Purpose

Establish a sensible, minimal-overhead security baseline appropriate for a single Nigerian physiotherapy clinic handling patient data. This is **not** a full healthcare-compliance program — it's solid engineering hygiene plus basic NDPA-aware practices.

## 2. Baseline Security Measures

- Passwords hashed with bcrypt/argon2 — never stored plain, never logged.
- All traffic over HTTPS (TLS) — no plain HTTP anywhere in production.
- Role-based access control enforced server-side on every request (per PRD 01) — not just hidden UI elements.
- Session tokens (JWT) with reasonable expiry and secure, HttpOnly, SameSite cookies.
- Rate limiting on login and OTP endpoints to deter brute force.
- File uploads validated (type, size) and stored in access-controlled object storage, not publicly world-readable by default (signed URLs for sensitive documents like X-rays).
- Regular automated database backups (daily, retained for a reasonable window, e.g., 30 days).
- Environment secrets (API keys, DB credentials) kept out of source control, managed via environment variables/secret manager.

## 3. Data Access Principles

- Patients see only their own data.
- Therapists see only patients assigned to them via appointments (unless admin grants broader access).
- Receptionists see administrative/appointment/payment data, not clinical notes (per PRD 01 matrix).
- Admin has full access, logged in the lightweight `audit_log` (PRD 11) for key actions (role changes, data exports, account creation/deactivation).

## 4. Patient Consent (kept simple)

- A single, plain-language consent statement presented at intake (digital intake form, PRD 04): what data is collected, why, and that it's used to provide treatment and communicate with the patient.
- Checkbox capture, timestamped, stored on the patient record (`consent_given`, `consent_date` — PRD 11).
- No complex consent-versioning or granular per-field consent workflow in v1.

## 5. NDPA-Aware Practices (not full compliance program)

The Nigeria Data Protection Act (NDPA) is the relevant local framework. For v1, the platform will:
- Collect only data that's actually needed for clinic operations (no speculative data collection).
- Give the clinic the ability to export or delete a patient's data on request (basic data-subject-request support — a manual admin action is acceptable for v1, doesn't need to be self-service).
- Include a plain-language **Privacy Policy** page on the public website (required for app store submissions too — see PRD 10).
- Store data on infrastructure within reasonable, documented hosting arrangements (VPS/cloud provider details available if the clinic needs to state this to patients).

> The clinic remains responsible for its own operational policies, staff training, and any sector-specific obligations beyond what the platform technically provides — matching the original proposal's stance.

## 6. Out of Scope

- Formal NDPA registration/compliance audit support
- HIPAA or other non-Nigerian regulatory frameworks
- Data Protection Impact Assessments (DPIA) tooling
- Granular, per-field consent management
- Full audit-trail UI with search/filter/export (only the underlying log table)
- Penetration testing / formal security certification (recommended as a future paid add-on, not baseline)

## 7. Success Criteria

- No patient data is accessible without proper authentication and role checks.
- The clinic has a working, understandable privacy policy live before app store submission.
- Backups exist and have been tested at least once (a restore drill before launch).
