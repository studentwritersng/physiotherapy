# PRD 06 — Administration Portal (Patients, Staff, Appointments, Clinic Settings)

## 1. Purpose

Give admins centralized control over clinic operations: appointments, patients, staff, and clinic configuration — the operational "control tower."

## 2. Administrative Dashboard

Overview widgets:
- Today's appointments
- Total patients
- New patients (this week/month)
- Completed sessions (today/this week)
- Revenue (today/this month)
- Outstanding payments
- Cancelled appointments
- No-shows

(Deeper reporting lives in PRD 09; this dashboard is the at-a-glance summary.)

## 3. Appointment Administration

Admin/Receptionist can:
- View all appointments (filter by date, therapist, status, patient)
- Create appointments (including walk-in quick-book)
- Edit appointments (time, service, therapist)
- Assign/reassign therapists
- Manage appointment statuses
- Manage therapist availability (working days/hours, block-out dates)
- Manage clinic working hours (global operating hours used by the booking engine, PRD 03)

## 4. Patient Management

Admin/Receptionist can:
- Register new patients (walk-in or manual entry)
- Search patients (by name, phone, patient ID)
- View patient profiles
- Update patient information
- View appointment history
- View treatment history (receptionist: metadata only, not clinical notes — per PRD 01)
- View payment history

## 5. Staff Management (Admin only)

- Add staff (therapist/receptionist) accounts
- Manage therapist profiles (photo, bio, qualifications — feeds public "About" page, PRD 02)
- Assign roles
- Manage permissions (within the fixed role set from PRD 01 — no custom role builder in v1)
- Configure staff availability (working hours per therapist)
- Deactivate staff accounts (soft-disable, not hard delete, to preserve history)

## 6. Clinic Settings (lightweight CMS)

Admin-editable, no-code content that feeds the public website (PRD 02):
- Clinic name, logo, tagline
- Services list (add/edit/remove, description, image, duration, price)
- About/mission content
- Testimonials
- Contact details & opening hours
- Booking rules (lead time, cancellation cutoff — from PRD 03)

## 7. Functional Requirements

- FR1: All lists (patients, appointments, staff) must support search/filter and pagination — clinic will accumulate hundreds of records within months.
- FR2: Deleting is avoided in favor of soft-delete/deactivate wherever the record has historical significance (patients, staff, appointments).
- FR3: Admin actions on staff/roles/clinic settings are simple forms — no drag-and-drop builders.

## 8. Out of Scope

- Multi-branch/multi-location clinic settings
- Custom role/permission builder
- Full CMS with page builder (only structured content fields, not free-form pages)

## 9. Success Criteria

- Admin can see the full picture of "what happened today" in under 30 seconds from the dashboard.
- Admin can onboard a new therapist (account + profile + availability) in under 5 minutes.
