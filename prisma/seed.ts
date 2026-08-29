import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";

const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "changeme1";
const staffPassword = process.env.SEED_STAFF_PASSWORD ?? "changeme1";
const patientPassword = process.env.SEED_PATIENT_PASSWORD ?? "changeme1";

/** PRD-02 §2.2, with durations and prices from PRD-06 §6. */
const SERVICES = [
  { name: "Orthopedic/Musculoskeletal Physiotherapy", minutes: 45, price: "15000.00" },
  { name: "Sports Injury Rehabilitation", minutes: 60, price: "20000.00" },
  { name: "Neurological Rehabilitation", minutes: 60, price: "25000.00" },
  { name: "Pediatric Physiotherapy", minutes: 45, price: "18000.00" },
  { name: "Post-Surgery Rehabilitation", minutes: 60, price: "22000.00" },
  { name: "Pain Management", minutes: 45, price: "15000.00" },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** PRD-08 §3. Placeholders are interpolated by sub-project 8. */
const TEMPLATES = [
  {
    type: "confirmation" as const,
    channel: "whatsapp" as const,
    text: "Hello {{patient_name}}, your {{service}} appointment with {{therapist}} is confirmed for {{date}} at {{time}}. — TetaPhysio",
  },
  {
    type: "reminder" as const,
    channel: "whatsapp" as const,
    text: "Reminder: {{patient_name}}, you have a {{service}} appointment on {{date}} at {{time}}. Reply to reschedule. — TetaPhysio",
  },
  {
    type: "reschedule" as const,
    channel: "whatsapp" as const,
    text: "Hello {{patient_name}}, your appointment has been moved to {{date}} at {{time}}. — TetaPhysio",
  },
  {
    type: "cancellation" as const,
    channel: "whatsapp" as const,
    text: "Hello {{patient_name}}, your appointment on {{date}} at {{time}} has been cancelled. Call us to rebook. — TetaPhysio",
  },
  {
    type: "payment" as const,
    channel: "whatsapp" as const,
    text: "Thank you {{patient_name}}. We received {{amount}} on {{date}}. Outstanding balance: {{balance}}. — TetaPhysio",
  },
];

const OPENING_HOURS = {
  monday: { open: "08:00", close: "17:00" },
  tuesday: { open: "08:00", close: "17:00" },
  wednesday: { open: "08:00", close: "17:00" },
  thursday: { open: "08:00", close: "17:00" },
  friday: { open: "08:00", close: "17:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: null,
};

async function main() {
  // Every write is an upsert on a natural key, so re-running changes nothing.
  const [adminHash, staffHash, patientHash] = await Promise.all([
    hash(adminPassword, ARGON2_OPTIONS),
    hash(staffPassword, ARGON2_OPTIONS),
    hash(patientPassword, ARGON2_OPTIONS),
  ]);

  const admin = await prisma.user.upsert({
    where: { phone: "+2348000000001" },
    update: {},
    create: {
      name: "Clinic Admin",
      email: "admin@tetaphysio.ng",
      phone: "+2348000000001",
      passwordHash: adminHash,
      role: "admin",
      mustResetPassword: true,
    },
  });

  const therapistSeeds = [
    {
      phone: "+2348000000002",
      name: "Dr. Chidera Okonkwo",
      email: "chidera@tetaphysio.ng",
      title: "Senior Physiotherapist",
      qualifications: "BPT, MSc Sports Physiotherapy",
      bio: "Specialises in sports injury rehabilitation and post-surgical recovery.",
    },
    {
      phone: "+2348000000003",
      name: "Dr. Aisha Bello",
      email: "aisha@tetaphysio.ng",
      title: "Physiotherapist",
      qualifications: "BPT, Certificate in Neurological Rehabilitation",
      bio: "Focuses on neurological and paediatric physiotherapy.",
    },
  ];

  for (const [index, seed] of therapistSeeds.entries()) {
    const therapist = await prisma.user.upsert({
      where: { phone: seed.phone },
      update: {},
      create: {
        name: seed.name,
        email: seed.email,
        phone: seed.phone,
        passwordHash: staffHash,
        role: "therapist",
        mustResetPassword: true,
      },
    });

    await prisma.staffProfile.upsert({
      where: { userId: therapist.id },
      update: {},
      create: {
        userId: therapist.id,
        title: seed.title,
        qualifications: seed.qualifications,
        bio: seed.bio,
        publicVisible: true,
        canViewAllPatients: false,
        sortOrder: index,
      },
    });
  }

  await prisma.user.upsert({
    where: { phone: "+2348000000004" },
    update: {},
    create: {
      name: "Front Desk",
      email: "reception@tetaphysio.ng",
      phone: "+2348000000004",
      passwordHash: staffHash,
      role: "receptionist",
      mustResetPassword: true,
    },
  });

  // Two registered patients with logins, and one walk-in lead with no user row —
  // which is what exercises the nullable patients.user_id relationship.
  const patientSeeds = [
    { phone: "+2348020000001", name: "Ada Obi", email: "ada@example.com" },
    { phone: "+2348020000002", name: "Emeka Nwosu", email: "emeka@example.com" },
  ];

  for (const [index, seed] of patientSeeds.entries()) {
    const user = await prisma.user.upsert({
      where: { phone: seed.phone },
      update: {},
      create: {
        name: seed.name,
        email: seed.email,
        phone: seed.phone,
        passwordHash: patientHash,
        role: "patient",
      },
    });

    await prisma.patient.upsert({
      where: { patientCode: `TP-0000${index + 1}` },
      update: {},
      create: {
        patientCode: `TP-0000${index + 1}`,
        userId: user.id,
        fullName: seed.name,
        phone: seed.phone,
        email: seed.email,
        status: "registered",
        consentGiven: true,
        consentDate: new Date(),
      },
    });
  }

  await prisma.patient.upsert({
    where: { patientCode: "TP-00003" },
    update: {},
    create: {
      patientCode: "TP-00003",
      fullName: "Ngozi Walk-In",
      phone: "+2348020000003",
      status: "lead",
    },
  });

  for (const [index, service] of SERVICES.entries()) {
    const slug = slugify(service.name);
    await prisma.service.upsert({
      where: { slug },
      update: {},
      create: {
        name: service.name,
        slug,
        description: `${service.name} delivered by our licensed physiotherapists.`,
        defaultDurationMinutes: service.minutes,
        defaultPrice: service.price,
        active: true,
        sortOrder: index,
      },
    });
  }

  await prisma.clinicSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      clinicName: "TetaPhysio",
      tagline: "Movement is medicine",
      contactPhone: "+2348000000000",
      contactWhatsapp: "+2348000000000",
      contactEmail: "hello@tetaphysio.ng",
      address: "Lagos, Nigeria",
      openingHours: OPENING_HOURS,
      bookingLeadTimeHours: 0,
      rescheduleCutoffHours: 2,
      cancellationCutoffHours: 2,
      reminderLeadHours: [24, 2],
      showClinicalToPatients: false,
      onlinePaymentsEnabled: false,
      receptionistSeesRevenue: false,
      therapistSeesOwnStats: true,
    },
  });

  for (const template of TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: { type_channel: { type: template.type, channel: template.channel } },
      update: {},
      create: {
        type: template.type,
        channel: template.channel,
        templateText: template.text,
        active: true,
      },
    });
  }

  console.info("Seed complete.");
  console.info("  Admin login: admin@tetaphysio.ng (password from SEED_ADMIN_PASSWORD)");
  console.info(`  Admin id: ${admin.id}`);
  console.info("  All staff accounts must change password on first login.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
