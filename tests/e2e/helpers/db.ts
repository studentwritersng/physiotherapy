import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ARGON2_OPTIONS } from "@/lib/constants";

/**
 * Playwright drives the app against the development database, and several
 * journeys mutate it: a forced first login rewrites the password hash and clears
 * mustResetPassword, and registration inserts a user and a patient.
 *
 * Left alone that makes the suite single-use — the `mobile` project would replay
 * the same specs against state the `chromium` project already changed, and every
 * re-run would need `npm run db:reset` first. So each test arms the precondition
 * it needs here rather than inheriting it from the seed or from a test that
 * happened to run earlier.
 *
 * `next start` loads .env itself; this process does not, hence dotenv above.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** 0803… → +234803…, matching normalisePhone in src/server/auth/login.ts. */
export function toE164(localPhone: string): string {
  return `+234${localPhone.slice(1)}`;
}

/**
 * Sets a staff account's password and mustResetPassword flag, so a journey that
 * needs the forced-change screen and one that needs to walk straight into the
 * dashboard can both start from a known state.
 */
export async function armStaffAccount(
  email: string,
  password: string,
  mustResetPassword: boolean,
): Promise<void> {
  await prisma.user.update({
    where: { email },
    data: { passwordHash: await hash(password, ARGON2_OPTIONS), mustResetPassword },
  });
  await clearLoginThrottle(email);
}

/** A patient is never forced to reset, so only the password is restored. */
export async function armPatientAccount(localPhone: string, password: string): Promise<void> {
  await prisma.user.update({
    where: { phone: toE164(localPhone) },
    data: { passwordHash: await hash(password, ARGON2_OPTIONS), mustResetPassword: false },
  });
  await clearLoginThrottle(localPhone);
}

/**
 * The rate limiter counts failed attempts per identifier over a 15-minute
 * window, so without this the deliberate wrong-password test would accumulate
 * across projects and runs until a later genuine login was throttled.
 */
export async function clearLoginThrottle(identifier: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { identifier: identifier.toLowerCase() } });
}

/** Removes an account created by the registration journey, and its patient row. */
export async function deletePatientAccount(localPhone: string): Promise<void> {
  const phone = toE164(localPhone);
  // patients.user_id is ON DELETE SET NULL, so the patient row would otherwise
  // survive and be claimed as a walk-in lead by the next registration.
  await prisma.patient.deleteMany({ where: { phone } });
  await prisma.user.deleteMany({ where: { phone } });
}

/**
 * Removes a portal E2E account and everything the journeys put under it.
 * deletePatientAccount is not enough here: appointments and invoices point at
 * the patient row with no ON DELETE CASCADE, so they must go first (status
 * history, invoice items and payments cascade off those). Intake rows cascade
 * off the patient but are deleted explicitly for the same reason.
 */
export async function deletePortalAccount(localPhone: string): Promise<void> {
  const phone = toE164(localPhone);
  const patients = await prisma.patient.findMany({ where: { phone }, select: { id: true } });
  const patientIds = patients.map((p) => p.id);
  if (patientIds.length > 0) {
    await prisma.appointment.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.invoice.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.intakeForm.deleteMany({ where: { patientId: { in: patientIds } } });
  }
  await prisma.patient.deleteMany({ where: { phone } });
  await prisma.user.deleteMany({ where: { phone } });
}

/**
 * Arms a patient-role login the way armStaffAccount arms staff, plus the link
 * state the journey needs. `linked: true` creates the patient row, so the
 * dashboard, intake and appointments pages render; `linked: false` leaves the
 * user row bare, so login lands on the waiting screen. Registration always
 * creates the row (a matching walk-in lead is never auto-claimed), so only a
 * directly armed user can be unlinked.
 *
 * Starts from a full reset of the phone, so reruns and the chromium/mobile
 * projects converge on the same state. Returns the ids the visit-state
 * helpers below need.
 */
export async function armPortalAccount(input: {
  localPhone: string;
  password: string;
  name: string;
  email?: string;
  linked: boolean;
}): Promise<{ userId: string; patientId: string | null }> {
  const { localPhone, password, name, linked } = input;
  const email = input.email ?? null;
  const phone = toE164(localPhone);
  await deletePortalAccount(localPhone);
  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      passwordHash: await hash(password, ARGON2_OPTIONS),
      role: "patient",
    },
  });
  await clearLoginThrottle(localPhone);
  if (!linked) return { userId: user.id, patientId: null };
  // Deterministic per phone (never count-based): reruns reuse the code and
  // concurrent suites cannot collide on it.
  const patient = await prisma.patient.create({
    data: {
      patientCode: `TP-E2E-${localPhone}`,
      userId: user.id,
      fullName: name,
      phone,
      email,
      status: "registered",
    },
  });
  return { userId: user.id, patientId: patient.id };
}

/**
 * First active service and therapist from the seed. The dashboard journeys
 * read these rows, never mutate them — the seed still owns them.
 */
export async function portalSeedRefs(): Promise<{ serviceId: string; therapistId: string }> {
  const service = await prisma.service.findFirst({
    where: { active: true, deletedAt: null },
    orderBy: { sortOrder: "asc" },
  });
  const therapist = await prisma.user.findFirst({
    where: { role: "therapist", status: "active", deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (!service || !therapist) {
    throw new Error("portal E2E needs a seeded service and therapist — run npm run db:seed");
  }
  return { serviceId: service.id, therapistId: therapist.id };
}

/**
 * Inserts a scheduled appointment by hand, bypassing the booking engine so
 * the journey can place it where the engine would refuse: `startInHours: 1`
 * sits inside the seeded 2-hour reschedule cutoff, and `therapistId: null`
 * renders the contact-the-clinic panel. Omit therapistId for a normal pinned
 * booking.
 */
export async function armPortalAppointment(
  patientId: string,
  opts: { startInHours: number; therapistId?: string | null },
): Promise<string> {
  const refs = await portalSeedRefs();
  const service = await prisma.service.findUniqueOrThrow({ where: { id: refs.serviceId } });
  const therapistId = opts.therapistId === undefined ? refs.therapistId : opts.therapistId;
  const start = new Date(Date.now() + opts.startInHours * 3_600_000);
  const appt = await prisma.appointment.create({
    data: {
      patientId,
      therapistId,
      serviceId: refs.serviceId,
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + service.defaultDurationMinutes * 60_000),
      status: "scheduled",
      bookedVia: "staff",
    },
  });
  return appt.id;
}

/** An unpaid invoice, so the dashboard balance card lights up with a figure. */
export async function armPortalInvoice(patientId: string, amount: string): Promise<void> {
  const staff = await prisma.user.findFirst({
    where: { role: { in: ["admin", "receptionist"] }, status: "active", deletedAt: null },
    select: { id: true },
  });
  if (!staff) throw new Error("portal E2E needs a seeded admin or receptionist");
  await prisma.invoice.create({
    data: {
      invoiceNumber: `INV-E2E-${Date.now()}`,
      patientId,
      totalAmount: amount,
      status: "unpaid",
      createdById: staff.id,
    },
  });
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Clears the rows the clinic-config journeys create, so each test starts from a
 * known state and the chromium and mobile projects do not interfere.
 *
 * The six seeded services are left in place — the seed owns them and deleting one
 * would break the seed-count assertions in tests/integration/seed.test.ts. Any
 * service a test created is removed, and the edit test's price change is reverted
 * by restoring the seeded values.
 */
export async function resetClinicConfig(): Promise<void> {
  await prisma.testimonial.deleteMany({});
  await prisma.therapistAvailability.deleteMany({});

  // Reactivate anything a deactivate test switched off.
  await prisma.service.updateMany({ where: { active: false }, data: { active: true } });

  // Remove services a create test added. The seed's six carry sortOrder 0-5, and
  // createService sets sortOrder to the current row count, so anything from 6 up
  // came from a test.
  await prisma.service.deleteMany({ where: { sortOrder: { gte: 6 } } });

  // Restore the seeded price the edit test changes.
  await prisma.service.updateMany({
    where: { slug: "pain-management" },
    data: { defaultPrice: "15000.00", defaultDurationMinutes: 45, name: "Pain Management" },
  });
}

/**
 * Clears the rows the booking journeys create. Appointments and their history
 * go; patients, services, availability and settings stay — the seed and the
 * clinic-config suite own those. Login attempts are cleared so the deliberate
 * wrong-password coverage elsewhere never throttles these journeys.
 */
export async function resetBookingState(): Promise<void> {
  await prisma.appointmentStatusHistory.deleteMany({});
  await prisma.appointment.deleteMany({});
  await prisma.loginAttempt.deleteMany({});
}

/**
 * Arms the state the public visitor journeys need. The seed deliberately
 * creates no therapist-availability rows, so on a freshly seeded database no
 * day offers slots and the booking journeys would find no radios. Each test
 * therefore starts from known-wide hours (Mon–Fri 08:00–17:00, Sat
 * 09:00–14:00, mirroring the seeded opening hours) for every active
 * therapist, with bookings cleared so every slot is free and the
 * render-from-live-data service removed so the add-form assertion holds on
 * reruns. Sunday stays closed per the seeded opening hours, so a run started
 * on a Sunday finds no slots on the first date link — a known limitation
 * recorded in the Task 5 report.
 */
export async function armPublicBookingState(): Promise<void> {
  await resetBookingState();
  await prisma.service.deleteMany({ where: { name: "E2E Public Service" } });
  const therapists = await prisma.user.findMany({
    where: { role: "therapist", status: "active", deletedAt: null },
    select: { id: true },
  });
  await prisma.therapistAvailability.deleteMany({});
  for (const t of therapists) {
    for (const dayOfWeek of [1, 2, 3, 4, 5, 6]) {
      const saturday = dayOfWeek === 6;
      await prisma.therapistAvailability.create({
        data: {
          therapistId: t.id,
          dayOfWeek,
          specificDate: null,
          startTime: saturday ? "09:00" : "08:00",
          endTime: saturday ? "14:00" : "17:00",
          isBlocked: false,
        },
      });
    }
  }
}
