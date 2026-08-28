# PRD 04 — Patient Portal

## 1. Purpose

Give registered patients a simple, mobile-friendly way to manage their relationship with the clinic without calling or visiting in person for routine things.

## 2. Patient Dashboard

On login, patient sees:
- Upcoming appointment (date, time, therapist, service, status)
- Previous appointments (short list, link to full history)
- Treatment/progress snapshot (only what the clinic has chosen to expose — see PRD 05)
- Outstanding balance (amount, with "Pay Now" CTA if online payment enabled)
- Quick contact options (Call, WhatsApp)

## 3. Appointment Management

- Book new appointment (uses booking engine from PRD 03)
- View upcoming appointments
- Reschedule (respecting cutoff rules)
- Cancel appointment
- View full appointment history with statuses

## 4. Patient Profile

Editable fields:
- Full name
- Phone number
- Date of birth
- Address
- Emergency contact (name + phone)
- Basic medical info (allergies, existing conditions — free text, kept simple)

## 5. Digital Intake Form

Presented before/at first appointment if not already completed:
- Reason for visit
- Medical history (free text or simple checklist)
- Previous injuries
- Previous surgeries
- Current medications
- Allergies
- Referring doctor (optional)
- Consent checkbox (single, plain-language consent statement — see PRD 12 for privacy approach)

Form is saved to the patient record and visible to therapists (PRD 05).

## 6. Treatment Information (Patient View)

Patients may see (clinic controls visibility per field, via a simple "visible to patient" toggle on the treatment plan):
- Treatment plan summary
- Treatment goals
- Prescribed exercises / therapist instructions
- General progress notes (not full clinical SOAP notes — those stay internal by default)

## 7. Payment Information (Patient View)

- Treatment charges (itemized, simple list)
- Amount paid
- Outstanding balance
- Payment history (date, amount, method)
- Available online payment option (Pay Now via gateway — PRD 07)

## 8. Communication

- Prominent WhatsApp contact button/link throughout the portal
- Optional: in-portal notification list showing recent reminders/confirmations sent (mirrors PRD 08 notifications)

## 9. Functional Requirements

- FR1: Fully responsive; this is the primary surface reused inside the Capacitor mobile app (PRD 10).
- FR2: Data shown is scoped strictly to the logged-in patient (enforced server-side, per PRD 01).
- FR3: Clinic-level visibility toggles (e.g., "show SOAP notes to patient": off by default) respected everywhere.
- FR4: Works acceptably on low-end Android devices and slower connections.

## 10. Out of Scope

- Direct messaging/chat with therapist inside the portal (WhatsApp handles this)
- Video call / telehealth
- Patient-to-patient community features

## 11. Success Criteria

- A returning patient can check their next appointment and outstanding balance within 10 seconds of logging in.
- A new patient can complete the intake form on a mobile phone in under 5 minutes.
