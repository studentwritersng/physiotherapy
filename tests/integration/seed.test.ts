import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { testPrisma, truncateAll } from "../helpers/db";

/**
 * Resolve tsx's own binary rather than going through `npx`, which re-resolves the
 * package on every call and costs a second or more of the hook budget.
 */
const TSX = resolve(
  import.meta.dirname,
  "../../node_modules/tsx/dist/cli.mjs",
);

/**
 * Runs the real seed script as a child process against TEST_DATABASE_URL, which
 * tests/setup.ts has already put in DATABASE_URL.
 *
 * execFileSync without a shell: the arguments are fixed and passed as an array,
 * so nothing is concatenated or interpreted (Node deprecates shell:true with
 * args as DEP0190).
 */
function runSeed(): void {
  execFileSync(process.execPath, [TSX, "prisma/seed.ts"], {
    stdio: "pipe",
    env: { ...process.env },
  });
}

/**
 * 60s, not Vitest's 10s default. The seed hashes three passwords with argon2id at
 * 19MB memory cost each, and this hook also truncates every table — comfortably
 * over 10s on a loaded machine even though the seed alone runs in under 4s.
 */
beforeAll(async () => {
  await truncateAll();
  runSeed();
}, 60_000);

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("seed", () => {
  it("creates one admin, two therapists and one receptionist", async () => {
    expect(await testPrisma.user.count({ where: { role: "admin" } })).toBe(1);
    expect(await testPrisma.user.count({ where: { role: "therapist" } })).toBe(2);
    expect(await testPrisma.user.count({ where: { role: "receptionist" } })).toBe(1);
  });

  it("gives both therapists a staff profile", async () => {
    expect(await testPrisma.staffProfile.count()).toBe(2);
  });

  it("creates three patients, one of them an unlinked walk-in lead", async () => {
    expect(await testPrisma.patient.count()).toBe(3);
    const leads = await testPrisma.patient.findMany({ where: { userId: null } });
    expect(leads).toHaveLength(1);
    expect(leads[0]!.status).toBe("lead");
  });

  it("creates the six PRD-02 services with durations, prices and slugs", async () => {
    const services = await testPrisma.service.findMany({ orderBy: { sortOrder: "asc" } });
    expect(services).toHaveLength(6);
    expect(services[0]!.slug).toBe("orthopedic-musculoskeletal-physiotherapy");
    for (const s of services) {
      expect(s.defaultDurationMinutes).toBeGreaterThan(0);
      expect(Number(s.defaultPrice)).toBeGreaterThan(0);
      expect(s.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("creates the clinic settings singleton with Lagos opening hours", async () => {
    const settings = await testPrisma.clinicSettings.findMany();
    expect(settings).toHaveLength(1);
    expect(settings[0]!.id).toBe(1);
    expect(settings[0]!.showClinicalToPatients).toBe(false);
    expect(settings[0]!.reminderLeadHours).toEqual([24, 2]);
    expect(Object.keys(settings[0]!.openingHours as object)).toContain("monday");
  });

  it("creates the five notification templates", async () => {
    const templates = await testPrisma.notificationTemplate.findMany();
    expect(templates).toHaveLength(5);
    const types = templates.map((t) => t.type).sort();
    expect(types).toEqual(["cancellation", "confirmation", "payment", "reminder", "reschedule"]);
    for (const t of templates) {
      expect(t.templateText).toContain("{{patient_name}}");
    }
  });

  it("forces a password reset on every seeded staff account", async () => {
    const staff = await testPrisma.user.findMany({
      where: { role: { in: ["admin", "therapist", "receptionist"] } },
    });
    expect(staff).toHaveLength(4);
    for (const s of staff) expect(s.mustResetPassword).toBe(true);
  });

  it("stores hashed passwords, never plaintext", async () => {
    const users = await testPrisma.user.findMany();
    for (const u of users) {
      expect(u.passwordHash.startsWith("$argon2id$")).toBe(true);
    }
  });

  it("is idempotent — a second run does not duplicate anything", async () => {
    runSeed();

    expect(await testPrisma.user.count()).toBe(6);
    expect(await testPrisma.patient.count()).toBe(3);
    expect(await testPrisma.service.count()).toBe(6);
    expect(await testPrisma.clinicSettings.count()).toBe(1);
    expect(await testPrisma.notificationTemplate.count()).toBe(5);
    expect(await testPrisma.staffProfile.count()).toBe(2);
  }, 60_000);
});
