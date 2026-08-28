# PRD 07 — Billing & Payment Management

## 1. Purpose

Simple, practical billing appropriate for a Nigerian physiotherapy clinic — not a full accounting system. Cover charging patients, recording payments (however made), and tracking balances.

## 2. Core Capabilities (Admin/Receptionist)

- Create charges/invoices (linked to a patient, optionally to a specific appointment/session)
- Record payments against a charge (full or partial)
- View outstanding balances (per patient, and clinic-wide)
- View payment history (per patient, and clinic-wide)
- Track daily/monthly revenue

## 3. Supported Payment Methods

| Method | How it's handled |
|---|---|
| Cash | Manually recorded by staff at point of payment |
| Bank Transfer | Manually recorded (reference number field optional) |
| POS | Manually recorded (reference number field optional) |
| Online payment gateway (Paystack/Flutterwave) | Patient pays via portal or a payment link; status updates automatically via webhook |

- FR1: Manual payment recording must be just as fast and prominent as the online option — this is the primary payment method for a Nigerian clinic, not a fallback.
- FR2: Every payment record captures: amount, method, date, recorded-by (staff), reference/notes.

## 4. Invoice / Charge Structure

- A charge can be itemized (e.g., "Initial Assessment — ₦X", "Session — ₦X") or a simple flat amount.
- Service prices default from the `services` catalog (PRD 06) but are editable per invoice for flexibility (discounts, custom pricing).
- Invoice statuses: Unpaid, Partially Paid, Paid.

## 5. Online Payment Flow

1. Patient sees outstanding balance in portal (PRD 04) or receives a payment link via WhatsApp/SMS/email.
2. Patient pays via Paystack/Flutterwave checkout.
3. Webhook confirms payment → invoice status updates → receipt triggered (PRD 08 notification).
4. Failed/abandoned payments simply leave the invoice unpaid — no complex retry logic needed for v1.

## 6. Reporting Touchpoints

Feeds into PRD 09:
- Daily revenue
- Monthly revenue
- Outstanding payments (aged, if simple to add — otherwise just total outstanding)

## 7. Functional Requirements

- FR1: Every payment or charge action is attributable to a staff user and timestamped.
- FR2: Patients can only view their own billing info, never edit it.
- FR3: Currency is Naira (₦) throughout; no multi-currency needed.
- FR4: Gateway integration is behind a config flag — clinic can launch with manual-only payments and enable the gateway later without a rebuild.

## 8. Out of Scope

- Automated dunning / collections workflows
- Insurance claims/billing
- Payment plans / installment scheduling automation (can be handled manually via partial payments)
- Full double-entry accounting or export to accounting software

## 9. Success Criteria

- Front desk can record a cash payment against a patient's balance in under 15 seconds.
- Admin can see today's total revenue broken down by payment method.
