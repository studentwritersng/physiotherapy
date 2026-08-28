# PRD 03 — Appointment Booking & Scheduling

## 1. Purpose

The engine behind every appointment in the system — used by the public website (visitor booking), the patient portal (self-service), and the staff/admin portal (manual booking, walk-ins, schedule management).

## 2. Booking Flow (Public / Patient)

1. Select a service (e.g., Sports Injury Rehabilitation)
2. Select a preferred therapist (optional — "No preference" allowed)
3. Select an available date and time (calendar shows only real availability)
4. Provide basic information:
   - Full name
   - Phone number
   - Email (optional)
   - New or returning patient
   - Brief reason for visit (optional free text)
5. Submit booking
6. Receive confirmation on screen + via SMS/WhatsApp/email (see PRD 08)

- If the phone number matches an existing patient record, the booking is linked to that patient automatically.
- If not, a new lightweight patient record is created (status: "unregistered/lead") which becomes a full patient record on first visit or portal activation.

## 3. Appointment Statuses

| Status | Meaning |
|---|---|
| Scheduled | Booked, not yet confirmed by clinic |
| Confirmed | Clinic has confirmed the slot |
| Arrived | Patient checked in at reception |
| In Session | Currently with therapist |
| Completed | Session finished |
| Cancelled | Cancelled by patient or staff |
| No-show | Patient didn't arrive |

Status transitions are logged with timestamp for reporting (PRD 09).

## 4. Scheduling Rules

- FR1: Availability is derived from:
  - Clinic operating hours (admin-configured, see PRD 06)
  - Therapist-specific availability/working hours
  - Existing appointments (to avoid double-booking)
  - Configurable appointment duration per service (default e.g. 45 min, editable by admin)
- FR2: Admin can block out time (holidays, therapist leave) so those slots don't appear as available.
- FR3: A minimum lead time for online bookings can be configured (e.g., cannot book same-day after 3pm) — optional, admin-toggleable.
- FR4: Patients/visitors can only see time slots that are actually free — no double-booking possible from the booking form.
- FR5: Staff (admin/receptionist) can override and force-book into an occupied slot if necessary (with a warning), for real-world flexibility.

## 5. Patient-Side Appointment Management (Portal)

- View upcoming appointments
- Reschedule (subject to a configurable cutoff, e.g., no reschedule within 2 hours of appointment — admin-configurable)
- Cancel appointment
- View appointment history

## 6. Staff-Side Schedule Management

- Daily view (agenda/list) and weekly calendar view
- Filter by therapist
- Create/edit/cancel any appointment
- Assign or reassign therapist
- Mark status (Arrived → In Session → Completed / No-show)
- Walk-in quick booking (skip online form, minimal fields, immediate "Arrived" status)

## 7. Data Model Touchpoints

`appointments`, `services`, `therapist_availability`, `clinic_hours`, `appointment_status_history` — see PRD 11.

## 8. Out of Scope

- Waitlist management
- Group/class bookings
- Recurring appointment series (can be simple "book same time next week" shortcut instead of full recurrence engine)

## 9. Success Criteria

- No double-bookings ever occur through the online flow.
- A receptionist can complete a walk-in booking in under 30 seconds.
- Reschedule/cancel actions update availability immediately for other bookers.
