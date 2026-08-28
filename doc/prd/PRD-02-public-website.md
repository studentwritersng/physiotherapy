# PRD 02 — Public Website

## 1. Purpose

The clinic's primary online presence: informs prospective patients, builds trust, and funnels visitors into booking an appointment — without requiring login.

## 2. Pages & Content

### 2.1 Homepage
- Clinic name, tagline, hero image
- Short intro to the clinic
- Key benefits / "why choose us" section (3–5 points)
- Prominent "Book Appointment" CTA (repeated at top and bottom)
- Sticky/floating WhatsApp contact button
- Patient testimonials (static content managed by admin, simple text + name)
- Location + opening hours summary
- Footer: contact details, social links, quick nav

### 2.2 Services
- Grid/list of services, each with its own detail section or page:
  - Orthopedic/Musculoskeletal Physiotherapy
  - Sports Injury Rehabilitation
  - Neurological Rehabilitation
  - Pediatric Physiotherapy
  - Post-Surgery Rehabilitation
  - Pain Management
  - (Admin can add/remove/edit services — see PRD 06)
- Each service: name, short description, optional image, "Book this service" CTA that pre-fills the booking form.

### 2.3 About
- Clinic background/story
- Mission & values
- Therapist/staff profiles (photo, name, title, qualifications, short bio)
- Data pulled from `staff_profiles` (admin-managed, see PRD 06)

### 2.4 Appointment Booking (public entry point)
- Full booking flow described in **PRD 03 — Appointment Booking & Scheduling**.
- Accessible from homepage, services page, and dedicated nav item.

### 2.5 Contact
- Phone number (click-to-call)
- WhatsApp (click-to-chat, pre-filled message)
- Email (mailto)
- Physical address
- Embedded Google Maps
- Opening hours table

## 3. Functional Requirements

- FR1: Fully responsive; mobile breakpoint is the primary design target, not an afterthought.
- FR2: Page load should be fast on average Nigerian mobile data (optimize images, lazy load below-the-fold content).
- FR3: All content (services, testimonials, staff bios, opening hours, contact info) must be editable by Admin without a developer — via the admin portal's "Clinic Settings" / CMS-lite section (see PRD 06).
- FR4: Basic on-page SEO: meta titles/descriptions per page, semantic HTML, sitemap.xml, robots.txt.
- FR5: No login required to browse or book.
- FR6: WhatsApp button opens `wa.me` link with clinic number, pre-filled generic message.

## 4. Out of Scope

- Blog/content marketing system
- Multi-language support
- A/B testing or marketing automation tooling
- Live chat widget (WhatsApp covers this need)

## 5. Success Criteria

- A first-time visitor can understand what the clinic offers and reach the booking form within 2 clicks from any page.
- Admin can update opening hours or add a new service without a code deployment.
