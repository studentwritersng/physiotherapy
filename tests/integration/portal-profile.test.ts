import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import { profileSchema } from "@/lib/zod/profile";
import { updateProfile } from "@/server/services/profile";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function makePatient(code: string, phone: string, email: string | null = "ada@example.com") {
  return testPrisma.patient.create({
    data: { patientCode: code, fullName: code, phone, email, status: "registered" },
  });
}

const VALID = {
  fullName: "Ada Lovelace",
  phone: "+2348031234567",
  email: "ada@example.com",
  dateOfBirth: "1990-05-14",
  address: "12 Allen Avenue, Ikeja",
  emergencyContactName: "Charles Babbage",
  emergencyContactPhone: "+2348055555555",
  basicMedicalInfo: "Asthma",
} as const;

describe("portal profile", () => {
  it("rejects a blank email", async () => {
    // Schema boundary: blank email fails parse (server-side, not HTML).
    expect(() => profileSchema.parse({ ...VALID, email: "" })).toThrow(/email/i);

    // Service boundary: the parse inside updateProfile enforces it too.
    const patient = await makePatient("TP-00001", "+2348030000001");
    await expect(updateProfile(patient.id, { ...VALID, email: "" })).rejects.toThrow(/email/i);
    const untouched = await testPrisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
    expect(untouched.fullName).toBe("TP-00001");
  });

  it("normalises the phone on save", async () => {
    const patient = await makePatient("TP-00002", "+2348030000002");

    // Schema-valid but non-canonical: the shared normaliser stores E.164.
    await updateProfile(patient.id, { ...VALID, phone: "2348031234567" });

    // Shared normaliser (login.ts) stores E.164 — same format as registration.
    expect((await testPrisma.patient.findUniqueOrThrow({ where: { id: patient.id } })).phone).toBe(
      "+2348031234567",
    );
  });

  it("saves exactly the allowed fields and keeps the staff-verified link", async () => {
    const user = await testPrisma.user.create({
      data: {
        name: "Ada",
        email: "ada@example.com",
        phone: "+2348030000003",
        passwordHash: "x",
        role: "patient",
      },
    });
    const patient = await testPrisma.patient.create({
      data: {
        patientCode: "TP-00003",
        userId: user.id,
        fullName: "Ada",
        phone: "+2348030000003",
        email: null,
        status: "registered",
      },
    });
    const before = await testPrisma.patient.findUniqueOrThrow({ where: { id: patient.id } });

    await updateProfile(patient.id, {
      ...VALID,
      phone: "+2348030000003",
      // Not patient-editable: schema strips them, service never spreads input.
      status: "discharged",
      patientCode: "HACK-1",
      userId: null,
    });

    const updated = await testPrisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
    expect(updated.fullName).toBe("Ada Lovelace");
    expect(updated.email).toBe("ada@example.com");
    expect(updated.dateOfBirth).not.toBeNull();
    expect(updated.address).toBe("12 Allen Avenue, Ikeja");
    expect(updated.emergencyContactName).toBe("Charles Babbage");
    expect(updated.basicMedicalInfo).toBe("Asthma");
    // Whitelist held: link, code and status untouched; updatedAt moved.
    expect(updated.userId).toBe(user.id);
    expect(updated.patientCode).toBe("TP-00003");
    expect(updated.status).toBe("registered");
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
  });

  it("rejects an invalid date of birth", () => {
    expect(() => profileSchema.parse({ ...VALID, dateOfBirth: "14-05-1990" })).toThrow(/date/i);
  });
});
