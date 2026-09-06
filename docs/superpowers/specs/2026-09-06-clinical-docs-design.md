# Sub-project 6 design: Clinical documentation & treatment plans (PRD-05)

Approach A (approved): records-first, thin slices. A patient-record hub with
assessment, SOAP, plan/exercise writers around it; episodes auto-created; R2
uploads behind one storage module; a thin today-view. No migration — all six
tables (`episodes_of_care`, `assessments`, `session_notes`, `treatment_plans`,
`exercises`, `patient_documents`) exist with the needed columns.

## §1 Access model

- New hub at `/staff/patients/[id]`, linked from appointment cards and agenda.
- Therapists read records of their own patients (assigned via appointment or
  episode `primaryTherapistId`); admins read all; receptionists read
  profile/intake only, never assessments, notes, plans, or documents.
- Three layers per project rule: `requireRole` at pages/actions, scope checks
  (`therapistId`, role matrix) in every clinical service, forged ids return
  nothing. Navigation visibility is not a boundary.

## §2 Episodes + assessments

- First assessment auto-opens an episode: `reason` = chief complaint,
  `primaryTherapistId` = author, `status` = active.
- While an episode is open, new notes, plans, and documents join it by
  default. Staff can start a fresh episode (new injury, new reason) or
  discharge (`dischargedAt` set; discharged episodes reject new writes).
- One assessment per episode, enforced in the service (second submit edits
  the existing one, never duplicates).
- Assessment fields exactly the PRD §5 list: chief complaint, history,
  examination findings, clinical impression, treatment goals, initial plan.

## §3 SOAP notes + edit rule

- One note per appointment (`appointmentId @unique`): Subjective, Objective,
  Treatment provided, Patient response, Exercises/instructions, Next plan.
- Six fixed fields; admin relabels come from settings content overrides
  (§6) — blank means the default SOAP wording.
- Author edits silently until midnight Africa/Lagos on creation day; later
  edits stamp `editedAt`/`editedById` and render an "Edited" marker. Only the
  authoring therapist writes notes; admins can read but never edit.
- Success check (PRD-05 §11): follow-up note completable in under 3 minutes
  — single flat form with patient/appointment context prefilled, verified
  by E2E.

## §4 Treatment plans + exercises

- Plan header: goals, narrative (`planDetails`), frequency, duration, focus
  areas, status Active/Completed/On hold. Completion is a single status
  change (no per-exercise done flag exists in v1).
- Inline exercise rows: name, description/instructions, optional image URL,
  `sortOrder`. No video library (out of scope per PRD-05 §9).
- `patientVisible` on both plan and exercises. Flipping them on is what
  lights up the sub-project 5 portal snapshot cards (empty states until
  then). Visibility also remains gated by the clinic-level
  `show_clinical_to_patients` setting per spec §3.3.

## §5 R2 documents

- New boundary `src/server/storage/r2.ts`: presigned PUT for browser-direct
  upload (credentials never reach the client), presigned GET for staff-gated
  download, record creation validates 10MB max and PDF/JPG/PNG mime server-side.
- Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET` (+ `.env.example` placeholders only, never secrets in repo).
- Without credentials the documents UI renders "storage not configured" and
  everything else works — dev/CI never need a bucket.
- One new runtime dependency (`@aws-sdk/client-s3`, exact version pinned):
  the single approved exception to the no-new-deps rule.
- Documents link to patient, optionally to episode/appointment; types:
  referral, medical report, x-ray, MRI, other (`DocumentType` enum).

## §6 Today-view + relabels + testing

- Thin `/staff/today`: today's visits with status pills + jump-to-record,
  reusing agenda queries. PRD-05 §§2-3 beyond this stay covered by the
  existing agenda/week views.
- Six SOAP label overrides in the staff settings content area.
- Tests: unit (schemas, Lagos-midnight edit boundary), integration (cross-
  therapist scoping, forged ids, post-midnight edit stamps marker),
  E2E (assessment auto-creates episode, SOAP under 3 minutes, plan toggle
  lights up the portal card, documents show not-configured without creds).

## Out of scope (per PRD-05 §9)

Dynamic form builder, voice dictation, exercise video library, ROM/biometric
tools, e-signatures.
