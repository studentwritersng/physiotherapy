# PRD 11 — Database Schema (Data Model)

## 1. Purpose

Define the core entities and relationships needed to support PRDs 01–10. This is a working reference for schema design (Postgres + Prisma), not a final DDL — field types/constraints get finalized during implementation.

## 2. Core Entities

### `users`
Base auth identity for staff and (optionally) patients who log in.
- id, name, email, phone, password_hash, role (enum: patient/therapist/receptionist/admin), status (active/inactive), created_at, last_login_at

### `patients`
Can exist without a linked `users` record (walk-in / unregistered lead).
- id, user_id (nullable, FK → users), full_name, phone, email (nullable), date_of_birth, address, emergency_contact_name, emergency_contact_phone, basic_medical_info, consent_given (bool), consent_date, opt_out_notifications (bool), created_at

### `staff_profiles`
Extends `users` for therapists (and optionally receptionists) with public-facing info.
- id, user_id (FK), title/role_label, qualifications, bio, photo_url, public_visible (bool)

### `services`
Clinic service catalog.
- id, name, description, default_duration_minutes, default_price, active (bool), image_url

### `clinic_settings`
Singleton/config table.
- opening_hours (JSON per day), booking_lead_time_rules, cancellation_cutoff_hours, clinic_name, logo_url, contact_info

### `therapist_availability`
- id, therapist_id (FK → users), day_of_week / specific_date, start_time, end_time, is_blocked (bool, for leave/holiday)

### `appointments`
- id, patient_id (FK), therapist_id (FK, nullable), service_id (FK), scheduled_start, scheduled_end, status (enum per PRD 03), booked_via (public/portal/staff), reason_for_visit, created_at

### `appointment_status_history`
- id, appointment_id (FK), status, changed_by (FK → users, nullable for system), changed_at

### `intake_forms`
- id, patient_id (FK), reason_for_visit, medical_history, previous_injuries, previous_surgeries, current_medications, allergies, referring_doctor, submitted_at

### `assessments` (initial assessment)
- id, patient_id (FK), therapist_id (FK), chief_complaint, history, examination, assessment, treatment_goals, treatment_plan, created_at

### `session_notes` (follow-up, SOAP)
- id, appointment_id (FK), patient_id (FK), therapist_id (FK), subjective, objective, treatment_provided, patient_response, exercises_instructions, next_plan, created_at, edited_at (nullable)

### `treatment_plans`
- id, patient_id (FK), therapist_id (FK), goals, plan_details, frequency, duration, status (active/completed/on_hold), patient_visible (bool), created_at, updated_at

### `exercises`
- id, treatment_plan_id (FK), name, description, patient_visible (bool)

### `patient_documents`
- id, patient_id (FK), uploaded_by (FK → users), document_type (referral/medical_report/xray/mri/other), file_url, uploaded_at

### `invoices`
- id, patient_id (FK), appointment_id (FK, nullable), total_amount, status (unpaid/partially_paid/paid), created_by (FK → users), created_at

### `invoice_items`
- id, invoice_id (FK), description, amount

### `payments`
- id, invoice_id (FK), amount, method (cash/bank_transfer/pos/online_gateway), reference, recorded_by (FK → users, nullable if gateway/automated), paid_at

### `notification_templates`
- id, type (confirmation/reminder/reschedule/cancellation/payment), channel, template_text

### `notification_log`
- id, patient_id (FK), type, channel, status (sent/failed/delivered), sent_at, related_appointment_id (nullable)

### `audit_log` (lightweight)
- id, user_id (FK), action, entity_type, entity_id, timestamp

## 3. Key Relationships

- `patients` 1—N `appointments`
- `appointments` N—1 `services`, N—1 `users` (therapist)
- `appointments` 1—N `appointment_status_history`
- `patients` 1—N `session_notes`, `assessments`, `treatment_plans`, `patient_documents`, `invoices`
- `treatment_plans` 1—N `exercises`
- `invoices` 1—N `invoice_items`, 1—N `payments`

## 4. Notes for Implementation

- Use soft-delete (`deleted_at` or `active` flag) on `patients`, `users`, `services`, `appointments` — avoid hard deletes given clinical/financial history value.
- Index `patients.phone`, `appointments.scheduled_start`, `appointments.status` for common query patterns.
- Keep `session_notes` and `assessments` append-mostly; edits should be visible (see PRD 05, FR3), not silently overwritten.

## 5. Out of Scope

- Multi-tenant schema design (single clinic only, v1)
- Full audit-trail versioning (only the lightweight `audit_log` table)
