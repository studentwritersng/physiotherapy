# Sub-project 7 design: Billing & payments (PRD-07)

Gateway decision (user): Paystack only — no Flutterwave. A placeholder
`PAYSTACK_SECRET_KEY` lives in env; the gateway is available only when the
key is present AND the clinic's `onlinePaymentsEnabled` flag is on (FR4:
manual-only launch needs no rebuild). No migration — `invoices`,
`invoice_items`, and `payments` (with `providerReference` + nullable
`recordedById` for gateway payments) already exist.

## §1 Invoices

- Staff (admin/receptionist/therapist? — admin and receptionist only; therapists
  don't bill) create invoices: patient (required), optional appointment link,
  item rows (description, quantity, unit price; amount = qty × unit, Decimal
  strings end to end, never floats), optional notes.
- Service prices default from the catalog but are editable per row
  (discounts, custom pricing).
- `totalAmount` = sum of items, computed server-side, never trusted from the
  form. `invoiceNumber` sequential human-readable (`INV-000001`…), generated
  in-transaction with unique-retry.
- Status derives from payments, never stored by hand: remainder 0 → paid,
  some paid → partially_paid, none → unpaid. Recomputed in the payment
  transaction.

## §2 Manual payments (the primary method)

- Cash, bank transfer, POS — equally prominent, one step: amount (≤ remainder,
  enforced), optional reference, notes, recorded against the invoice with
  `recordedById` = staff user and `paidAt` = now.
- Success check (PRD-07 §9): cash against a balance in under 15 seconds —
  the record-payment form sits on the invoice row, two fields + confirm.
- Every charge/payment carries actor + timestamp (FR1). Naira only (FR3).

## §3 Paystack online payments

- New boundary `src/server/payments/paystack.ts`: `initializePayment`
  (amount kobo integer, patient email required — portal guarantees it,
  callback URL, metadata `{ invoiceId }`) returns `authorization_url`;
  `verifyPayment(reference)` confirms via Paystack; webhook
  `POST /api/payments/paystack/webhook` accepts only `charge.success`,
  verifies HMAC-SHA512 signature against the secret, records
  method `online` + `providerReference`, `recordedById` null, idempotent on
  reference (replayed webhook returns ok without duplicating).
- Amounts: kobo = `Math.round(naira * 100)` from the Decimal string — integer
  math only at the gateway edge.
- Failed/abandoned payments leave the invoice unpaid; no retry logic (PRD v1).
- Without the key (or flag off): no Pay Now button anywhere, no dead ends —
  portal balance card keeps its manual wording. Receipts belong to
  sub-project 8 (notifications); history views here are the record.

## §4 Views

- Staff `/staff/payments` (receptionist + admin; flip both nav flags):
  clinic-wide outstanding, today's revenue broken down by method (second
  success criterion), payment history, per-patient balance lookup. Revenue
  totals respect the existing `receptionistSeesRevenue` flag (hidden from
  receptionists when off, per the PRD-01 matrix).
- Patient record hub gains a billing section (invoices + payments, read-only
  source for the portal).
- Portal: balance card keeps its remainder; Pay Now button appears only when
  the gateway is available; payment history list (date, amount, method).
  Patients never mutate billing (FR2) — all portal billing reads are scoped
  by linked patient id.

## §5 Testing

- Unit: kobo conversion, remainder math, webhook signature verification
  (fixed vector), invoice-number retry.
- Integration: partial-payment status transitions, overpayment rejection,
  idempotent webhook replay, forged invoice/patient ids fail closed,
  receptionist cannot touch another clinic's — single clinic, so: therapist
  cannot create/record (role gate pinned).
- E2E: cash payment under 15 seconds, revenue-by-method visible, portal
  history renders, gateway-absent hides Pay Now (CI has no key).

## Out of scope (per PRD-07 §8)

Dunning, insurance, installment automation (manual partials cover it),
double-entry/accounting export.
