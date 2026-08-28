# PRD 09 — Reports & Analytics

## 1. Purpose

Practical, day-to-day operational reporting — not complex BI. Admin should be able to understand clinic performance at a glance and export basic data when needed.

## 2. Core Reports (v1)

| Report | Detail |
|---|---|
| Daily revenue | Total revenue for a selected day, broken down by payment method |
| Monthly revenue | Total revenue for a selected month, trend vs. previous month |
| Patient numbers | Total active patients, growth over time |
| New vs. returning patients | Count split for a selected period |
| Appointment statistics | Total booked, completed, cancelled, no-show — for a selected period |
| Cancelled appointments | List/count with reasons if captured |
| No-show rate | % of appointments marked no-show over a period |
| Therapist sessions | Sessions completed per therapist over a period |
| Outstanding payments | Total unpaid/partially-paid balance across patients |

## 3. Functional Requirements

- FR1: All reports support a date range filter (today, this week, this month, custom range).
- FR2: Reports are presented as simple charts/tables — no drag-and-drop dashboard builder.
- FR3: Key reports (revenue, appointments, outstanding payments) exportable as CSV for the admin's own record-keeping/accountant.
- FR4: Reports pull from existing operational tables (appointments, payments, patients) — no separate data warehouse needed at this scale.
- FR5: Report queries must be reasonably performant for a single-clinic dataset (thousands, not millions, of records) — no need for pre-aggregation infrastructure in v1.

## 4. Access

- Admin: full access to all reports.
- Receptionist: optionally limited to daily appointment/revenue totals (admin-configurable) — clinical/therapist-level analytics restricted.
- Therapist: optionally see their own session counts only.

## 5. Out of Scope

- Predictive analytics / forecasting
- Custom report builder
- Data warehouse / BI tool integration
- Cohort analysis or advanced patient segmentation

## 6. Success Criteria

- Admin can answer "how much did we make this month, and how does it compare to last month" in under 10 seconds.
- Admin can export a CSV of this month's payments for external bookkeeping.
