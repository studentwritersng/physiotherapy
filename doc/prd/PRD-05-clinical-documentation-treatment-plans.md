# PRD 05 — Clinical Documentation & Treatment Plans

## 1. Purpose

Give therapists a structured, fast way to document assessments, sessions, and treatment plans — replacing paper notes — while keeping the form simple enough to actually be used in a busy clinic.

## 2. Staff Dashboard (Therapist View)

- Today's appointments
- Upcoming appointments (next few days)
- Patients scheduled for today
- Appointment status at a glance
- Quick access to patient records from any appointment card

## 3. Schedule Management (Therapist View)

- Daily and weekly schedule views (own schedule)
- Appointment duration and status visible
- Update appointment status (Arrived → In Session → Completed / No-show) — same status set as PRD 03

## 4. Patient Records Access

Authorized staff (therapist assigned to patient, or admin) can access:
- Patient profile & intake form (from PRD 04)
- Medical history
- Assessment records
- Previous session notes
- Treatment history
- Uploaded documents (referrals, X-rays, MRI reports — see Section 7)
- Payment info (receptionist/admin only, per PRD 01 matrix)

## 5. Initial Assessment (structured form)

Fields:
- Chief complaint
- History
- Examination findings
- Assessment/clinical impression
- Treatment goals
- Treatment plan (initial)

One initial assessment per patient per "episode of care" (a patient can have more than one over time, e.g., different injuries).

## 6. Follow-up Session Notes (SOAP-style)

Structured fields:
- **S**ubjective — patient-reported findings
- **O**bjective — therapist's objective findings
- **T**reatment provided — what was done this session
- Patient response
- Exercises / instructions given
- Next treatment plan / next steps

- FR1: The clinic (admin) can customize/relabel these fields lightly (e.g., rename a field), but the underlying SOAP structure stays fixed for v1 — no fully dynamic form builder.
- FR2: Notes are timestamped and linked to the specific appointment.
- FR3: Notes are editable by the authoring therapist within a short window (e.g., same day); after that, edits create a visible "edited" marker rather than silently overwriting (lightweight integrity, not a full audit system).

## 7. Treatment Plans

Therapists can:
- Create treatment goals (short list, free text or simple structured items)
- Define a treatment plan (narrative + structured fields: frequency, duration, focus areas)
- Assign exercises (name + description/instructions; no video library in v1 — text/image only if needed)
- Add patient instructions
- Mark plan status (Active / Completed / On hold)
- Toggle which parts are patient-visible (feeds PRD 04, Section 6)

## 8. Patient Documents

Authorized staff can upload/view:
- Referral letters
- Medical reports
- X-ray reports
- MRI reports
- Other relevant documents (PDF/image upload, stored in object storage per PRD 00)

- FR: Max file size and allowed types enforced (e.g., PDF, JPG, PNG up to 10MB).
- FR: Documents are linked to the patient record, optionally to a specific appointment/episode.

## 9. Out of Scope

- Fully dynamic/custom form builder for clinical notes
- Voice-to-text dictation
- Exercise video library
- ROM/biometric measurement tools
- E-signatures on clinical documents

## 10. Data Model Touchpoints

`assessments`, `session_notes`, `treatment_plans`, `treatment_goals`, `exercises`, `patient_documents` — see PRD 11.

## 11. Success Criteria

- A therapist can complete a follow-up session note in under 3 minutes.
- All clinical documentation for a patient is viewable in one place, in chronological order.
