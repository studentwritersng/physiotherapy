import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import type { SessionUser } from "@/server/auth/session";
import {
  canViewPatient,
  getPatientForActor,
  listPatientsForActor,
  assertCanReadClinical,
} from "@/server/services/patient";
import { ForbiddenError } from "@/server/auth/rbac";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

function actor(over: Partial<SessionUser> & Pick<SessionUser, "id" | "role">): SessionUser {
  return {
    name: "Actor",
    email: null,
    phone: "+2348000000000",
    mustResetPassword: false,
    ...over,
  };
}

/**
 * Builds: two therapists, a receptionist, an admin, a service, and two patients
 * where only patientA has an appointment with therapistA.
 */
async function scenario() {
  const [therapistA, therapistB, receptionist, admin] = await Promise.all([
    testPrisma.user.create({
      data: {
        name: "T A",
        email: "ta@x.com",
        phone: "+2348010000001",
        passwordHash: "x",
        role: "therapist",
      },
    }),
    testPrisma.user.create({
      data: {
        name: "T B",
        email: "tb@x.com",
        phone: "+2348010000002",
        passwordHash: "x",
        role: "therapist",
      },
    }),
    testPrisma.user.create({
      data: {
        name: "R",
        email: "r@x.com",
        phone: "+2348010000003",
        passwordHash: "x",
        role: "receptionist",
      },
    }),
    testPrisma.user.create({
      data: {
        name: "A",
        email: "a@x.com",
        phone: "+2348010000004",
        passwordHash: "x",
        role: "admin",
      },
    }),
  ]);

  await testPrisma.staffProfile.createMany({
    data: [
      { userId: therapistA.id, canViewAllPatients: false },
      { userId: therapistB.id, canViewAllPatients: false },
    ],
  });

  const patientUser = await testPrisma.user.create({
    data: { name: "P One", phone: "+2348020000001", passwordHash: "x", role: "patient" },
  });

  const patientA = await testPrisma.patient.create({
    data: {
      patientCode: "TP-00001",
      userId: patientUser.id,
      fullName: "P One",
      phone: "+2348020000001",
      status: "registered",
    },
  });
  const patientB = await testPrisma.patient.create({
    data: { patientCode: "TP-00002", fullName: "P Two", phone: "+2348020000002", status: "lead" },
  });

  const service = await testPrisma.service.create({
    data: { name: "Sports Injury Rehabilitation", slug: "sports-injury-rehabilitation" },
  });

  await testPrisma.appointment.create({
    data: {
      patientId: patientA.id,
      therapistId: therapistA.id,
      serviceId: service.id,
      scheduledStart: new Date("2026-09-01T09:00:00Z"),
      scheduledEnd: new Date("2026-09-01T09:45:00Z"),
      bookedVia: "staff",
    },
  });

  return { therapistA, therapistB, receptionist, admin, patientUser, patientA, patientB };
}

describe("patient access rules", () => {
  it("lets a therapist read a patient they have an appointment with", async () => {
    const s = await scenario();
    const a = actor({ id: s.therapistA.id, role: "therapist" });
    expect(await canViewPatient(a, s.patientA.id)).toBe(true);
    expect((await getPatientForActor(a, s.patientA.id))?.id).toBe(s.patientA.id);
  });

  it("blocks a therapist from a patient they share no appointment with", async () => {
    const s = await scenario();
    const b = actor({ id: s.therapistB.id, role: "therapist" });
    expect(await canViewPatient(b, s.patientA.id)).toBe(false);
    expect(await getPatientForActor(b, s.patientA.id)).toBeNull();
  });

  it("lets a therapist with canViewAllPatients read any patient", async () => {
    const s = await scenario();
    await testPrisma.staffProfile.update({
      where: { userId: s.therapistB.id },
      data: { canViewAllPatients: true },
    });
    const b = actor({ id: s.therapistB.id, role: "therapist" });
    expect(await canViewPatient(b, s.patientA.id)).toBe(true);
  });

  it("blocks a patient from another patient's record", async () => {
    const s = await scenario();
    const p = actor({ id: s.patientUser.id, role: "patient" });
    expect(await canViewPatient(p, s.patientA.id)).toBe(true);
    expect(await canViewPatient(p, s.patientB.id)).toBe(false);
    expect(await getPatientForActor(p, s.patientB.id)).toBeNull();
  });

  it("lets a receptionist and an admin read any patient", async () => {
    const s = await scenario();
    for (const role of ["receptionist", "admin"] as const) {
      const id = role === "receptionist" ? s.receptionist.id : s.admin.id;
      expect(await canViewPatient(actor({ id, role }), s.patientB.id)).toBe(true);
    }
  });

  it("blocks a receptionist from clinical records and allows therapist and admin", () => {
    expect(() => assertCanReadClinical(actor({ id: "x", role: "receptionist" }))).toThrow(
      ForbiddenError,
    );
    expect(() => assertCanReadClinical(actor({ id: "x", role: "patient" }))).toThrow(ForbiddenError);
    expect(() => assertCanReadClinical(actor({ id: "x", role: "therapist" }))).not.toThrow();
    expect(() => assertCanReadClinical(actor({ id: "x", role: "admin" }))).not.toThrow();
  });

  it("excludes soft-deleted patients from reads and lists", async () => {
    const s = await scenario();
    const admin = actor({ id: s.admin.id, role: "admin" });
    expect(await listPatientsForActor(admin)).toHaveLength(2);

    await testPrisma.patient.update({
      where: { id: s.patientB.id },
      data: { deletedAt: new Date() },
    });

    expect(await getPatientForActor(admin, s.patientB.id)).toBeNull();
    expect(await listPatientsForActor(admin)).toHaveLength(1);
  });

  it("scopes a therapist's patient list to their own appointments", async () => {
    const s = await scenario();
    expect(await listPatientsForActor(actor({ id: s.therapistA.id, role: "therapist" }))).toHaveLength(
      1,
    );
    expect(await listPatientsForActor(actor({ id: s.therapistB.id, role: "therapist" }))).toHaveLength(
      0,
    );
  });

  it("scopes a patient's list to their own record", async () => {
    const s = await scenario();
    const rows = await listPatientsForActor(actor({ id: s.patientUser.id, role: "patient" }));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(s.patientA.id);
  });

  it("searches by name and phone for staff", async () => {
    const s = await scenario();
    const admin = actor({ id: s.admin.id, role: "admin" });
    expect(await listPatientsForActor(admin, { search: "P Two" })).toHaveLength(1);
    expect(await listPatientsForActor(admin, { search: "8020000001" })).toHaveLength(1);
    expect(await listPatientsForActor(admin, { search: "TP-00002" })).toHaveLength(1);
    expect(await listPatientsForActor(admin, { search: "nobody" })).toHaveLength(0);
  });
});
