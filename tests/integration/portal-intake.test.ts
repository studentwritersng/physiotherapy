import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import { submitIntake } from "@/server/services/intake";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function makePatient(code: string, phone: string) {
  return testPrisma.patient.create({
    data: { patientCode: code, fullName: code, phone, status: "registered" },
  });
}

const FIRST_VISIT = {
  reasonForVisit: "Back pain",
  medicalHistory: "Hypertension",
  previousInjuries: null,
  previousSurgeries: null,
  currentMedications: "Amlodipine",
  allergies: null,
  referringDoctor: null,
  consent: true,
} as const;

describe("portal intake", () => {
  it("submit creates the intake row and stamps consent", async () => {
    const patient = await makePatient("TI-00001", "+2348030000001");

    await submitIntake(patient.id, { ...FIRST_VISIT });

    const row = await testPrisma.intakeForm.findFirstOrThrow({ where: { patientId: patient.id } });
    expect(row.reasonForVisit).toBe("Back pain");
    expect(row.submittedAt).not.toBeNull();
    const updated = await testPrisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
    expect(updated.consentGiven).toBe(true);
    expect(updated.consentDate).not.toBeNull();
  });

  it("consent unchecked fails validation", async () => {
    const patient = await makePatient("TI-00002", "+2348030000002");

    await expect(submitIntake(patient.id, { ...FIRST_VISIT, consent: false })).rejects.toThrow(
      /consent/i,
    );

    // Nothing persisted — the row and the stamp are atomic.
    expect(await testPrisma.intakeForm.count({ where: { patientId: patient.id } })).toBe(0);
    const untouched = await testPrisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
    expect(untouched.consentGiven).toBe(false);
    expect(untouched.consentDate).toBeNull();
  });

  it("resubmission updates the latest row instead of piling up versions", async () => {
    const patient = await makePatient("TI-00003", "+2348030000003");

    await submitIntake(patient.id, { ...FIRST_VISIT });
    await submitIntake(patient.id, { ...FIRST_VISIT, reasonForVisit: "Neck pain" });

    const rows = await testPrisma.intakeForm.findMany({ where: { patientId: patient.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reasonForVisit).toBe("Neck pain");
    expect(rows[0]!.submittedAt).not.toBeNull();
  });
});
