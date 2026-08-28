# PRD 01 — Authentication, Roles & Permissions

## 1. Purpose

Provide simple, secure login for four user types (Patient, Therapist, Receptionist, Admin) and enforce that each role only sees/does what it should — without building a heavyweight permissions engine.

## 2. User Roles & Access Summary

| Role | Created by | Login identifier | Key access |
|---|---|---|---|
| Patient | Self-registration or front desk | Phone number (primary) + optional email | Own data only |
| Therapist | Admin | Email or phone + password | Assigned patients, own schedule, clinical notes |
| Receptionist | Admin | Email or phone + password | Patients, appointments, payments (no clinical notes) |
| Admin | System owner / seeded | Email + password | Everything |

## 3. Authentication

### 3.1 Patient Auth
- Sign up via phone number + password, or via OTP (SMS/WhatsApp) — OTP recommended as primary since many patients won't want to remember passwords.
- Patients created by front desk during walk-in are pre-registered with just name + phone; they can "claim"/activate their portal account later using that phone number.
- Password reset via OTP to registered phone or email link.

### 3.2 Staff Auth (Therapist/Receptionist/Admin)
- Email or phone + password.
- Admin creates staff accounts (no public staff sign-up).
- Forced password reset on first login.
- Session via JWT stored in HttpOnly cookie, refresh token pattern, reasonable expiry (e.g., 7 days, sliding).

### 3.3 Password Policy
- Minimum 8 characters, at least 1 number.
- Bcrypt or argon2 hashing.
- No overly strict rotation policies — this is a small clinic, not a bank.

## 4. Roles & Permissions Matrix

| Feature area | Patient | Therapist | Receptionist | Admin |
|---|:---:|:---:|:---:|:---:|
| View/edit own profile | ✅ | ✅ | ✅ | ✅ |
| Book/reschedule/cancel own appointment | ✅ | – | – | – |
| View own treatment info (as clinic permits) | ✅ | – | – | – |
| View own payment history | ✅ | – | – | – |
| View assigned patients' full record | – | ✅ | – | ✅ |
| Write clinical/session notes | – | ✅ | – | ✅ (view/edit) |
| Create/edit treatment plans | – | ✅ | – | ✅ |
| Register new patients | – | – | ✅ | ✅ |
| Create/edit/cancel any appointment | – | – | ✅ | ✅ |
| Assign therapist to appointment | – | – | ✅ | ✅ |
| Record payments / issue invoices | – | – | ✅ | ✅ |
| View revenue reports | – | – | ❌ (optional: daily total only) | ✅ |
| Manage staff accounts & roles | – | – | – | ✅ |
| Manage clinic settings (hours, services) | – | – | – | ✅ |
| Upload/view patient documents (X-ray, referral) | – | ✅ | ✅ (upload only) | ✅ |

> Note: Receptionist visibility into clinical notes is intentionally blocked — front desk should not see SOAP notes, only appointment/administrative/payment data.

## 5. Functional Requirements

- FR1: System must support 4 distinct role types, extensible to more later without schema rewrite (roles stored as enum/table, not hardcoded booleans).
- FR2: Every API endpoint/page must check role before returning data — no client-side-only gating.
- FR3: Therapists can only view patients assigned to them (via appointments), unless granted "view all" by admin.
- FR4: Admin can impersonate/view-as another role for support/debugging (optional, nice-to-have, not v1-critical).
- FR5: Failed login attempts should be rate-limited (basic protection, not full lockout policy).
- FR6: Log key security events (login, password reset, role changes) in a simple audit table — not a full audit UI, just a table for later reference if needed.

## 6. Out of Scope

- Two-factor authentication for staff (can be phase 2)
- SSO / social login
- Granular field-level permissions
- Complex approval workflows for permission changes

## 7. Data Model Touchpoints

See **PRD 11 — Database Schema** for `users`, `roles`, `sessions`, `patients`, `staff_profiles`.
