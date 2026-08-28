# PRD 00 — Product Overview & Technical Architecture

**Product:** Physiotherapy Clinic Management Platform
**Client:** Physiotherapy Clinic (Nigeria)
**Prepared by:** Teta Digitals
**Status:** Draft for build

---

## 1. Purpose

A single platform covering three surfaces:

1. **Public Website** — clinic marketing site + appointment booking (no login required).
2. **Patient Portal** — logged-in patients manage appointments, view treatment/payment info.
3. **Staff & Admin Portal** — therapists, receptionists, and admins run daily clinic operations.

Plus a **mobile app (Capacitor, Android + iOS)** wrapping the patient-facing experience for patients, and optionally staff.

This is a **lean, single-clinic** system (not multi-tenant, not a hospital EHR). It should be simple enough to ship fast and cheap, while leaving room to add branches/tenancy later if needed.

---

## 2. Guiding Principles (Nigeria-first, lean scope)

- **No unnecessary compliance overhead.** Basic good security hygiene (hashed passwords, role-based access, HTTPS, backups) is enough. No HIPAA-style audit machinery, no complex consent workflows — just a simple consent checkbox stored on the patient record.
- **Walk-in first.** The system must work even if a patient never creates an account — front desk can register a patient and complete a full visit in one flow.
- **Mobile-first, low-bandwidth.** Most patients will be on Android phones with average connectivity. Keep payloads light, avoid heavy client bundles, lazy-load images.
- **WhatsApp as a first-class channel**, not an afterthought.
- **Local payment methods** (cash, POS, bank transfer) are equal citizens alongside online payment gateway — the system must let staff simply *record* these, not force everything through a gateway.
- **Ship only what's in this PRD set.** Everything under "Excluded" in the original proposal (insurance claims, payroll, telemedicine, EHR integrations, inventory, advanced AI, multi-hospital) is out of scope for v1.

---

## 3. Explicitly Out of Scope (v1)

- Insurance claims processing
- Payroll management
- Telemedicine / video consultations
- Advanced hospital EHR/EMR integrations
- Marketing automation
- Exercise video library
- Biometric / ROM (range-of-motion) tracking
- Inventory management
- Advanced AI features
- Multi-branch / multi-hospital management
- Complex approval workflows or audit-trail dashboards

---

## 4. Proposed Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend (web) | Next.js + TypeScript | SSR for public site (SEO), CSR for portals |
| Styling | Tailwind CSS | Fast to build, consistent design tokens |
| Backend | Next.js API routes / Node.js (Express-style) | Single deployable unit unless scale demands split |
| Database | PostgreSQL | Relational data fits clinic domain well |
| ORM | Prisma | Type-safe schema, easy migrations |
| Auth | JWT session cookies + bcrypt/argon2 password hashing | Simple email/phone + password; OTP for patients optional |
| File storage | S3-compatible object storage (e.g., Cloudflare R2 or DigitalOcean Spaces) | For documents, X-rays, reports, profile photos |
| Background jobs | Lightweight queue (pg-based or simple cron) | Reminders, notification retries |
| SMS/WhatsApp | Termii or similar Nigerian-friendly provider (SMS + WhatsApp Business API) | Confirmed at integration time |
| Email | Transactional email provider (e.g., AhaSend/SendGrid/Postmark) | Confirmations, receipts |
| Payments | Paystack or Flutterwave | Nigerian gateway; cash/POS/transfer recorded manually |
| Mobile app | Capacitor wrapping the patient-facing Next.js/React app | One codebase → Android + iOS |
| Hosting | VPS (Coolify) or Vercel for web, VPS for API/workers | Matches existing infra patterns |

---

## 5. User Roles

| Role | Access |
|---|---|
| **Patient** | Own profile, appointments, treatment info (as permitted), payment history |
| **Therapist** | Own schedule, assigned patients, clinical documentation, treatment plans |
| **Receptionist / Front Desk** | Register patients, book/manage appointments, record payments, no clinical notes |
| **Admin** | Full access: staff, patients, appointments, billing, reports, clinic settings |

Role-based access control (RBAC) applies across all portals. See **PRD 01 — Auth, Roles & Permissions**.

---

## 6. Core End-to-End Flows

**Walk-in flow (no account needed):**
`Register patient → Create appointment → Provide treatment → Record session note → Record payment → Complete visit`

**Online flow:**
`Visitor books on public site → Confirmation sent → Patient creates/activates portal account → Attends appointment → Views treatment/payment info in portal`

---

## 7. PRD Index

| # | Document | Covers |
|---|---|---|
| 00 | Overview & Architecture | This document |
| 01 | Auth, Roles & Permissions | Login, RBAC, sessions |
| 02 | Public Website | Marketing site, services, booking entry point |
| 03 | Appointment Booking & Scheduling | Booking engine, calendar, statuses |
| 04 | Patient Portal | Patient dashboard, profile, appointments |
| 05 | Clinical Documentation & Treatment Plans | SOAP notes, assessments, treatment plans |
| 06 | Admin & Staff Management | Patient/staff/appointment admin, clinic config |
| 07 | Billing & Payments | Invoices, payments, gateway + manual recording |
| 08 | Notifications & Reminders | SMS/WhatsApp/email delivery |
| 09 | Reports & Analytics | Operational dashboards |
| 10 | Mobile App (Capacitor) | Android/iOS wrapper, native concerns |
| 11 | Database Schema | Data model / entity relationships |
| 12 | Security & Data Privacy | Lightweight, NDPA-aware baseline |

---

## 8. Success Criteria (v1 launch)

- A walk-in patient can be registered and taken through a full visit without touching the online booking system.
- A visitor can book an appointment from the public website in under 2 minutes on a mobile browser.
- A therapist can complete a session note in under 3 minutes using structured fields.
- Admin can see today's appointments, revenue, and outstanding payments on one dashboard.
- Patients get a WhatsApp/SMS reminder before their appointment.
- The same core experience (booking, patient dashboard) is available as an installed Android/iOS app.
