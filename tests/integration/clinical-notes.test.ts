import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import type { SessionUser } from "@/server/auth/session";
import { getSoapLabels, submitSessionNote } from "@/server/services/clinical";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

const SOAP_KEYS = [
  "subjective",
  "objective",
  "treatmentProvided",
  "patientResponse",
  "exercisesInstructions",
  "nextPlan",
] as const;

function actor(over: Partial<SessionUser> & Pick<SessionUser, "id" | "role">): SessionUser {
  return {
    name: "Actor",
    email: null,
    phone: "+2348000000000",
    mustResetPassword: false,
    ...over,
  };
}

async function makeTherapist(phone: string) {
  return testPrisma.user.create({
    data: { name: "Dr. T", phone, passwordHash: "x", role: "therapist" },
  });
}

async function makeAdmin(phone: string) {
  return testPrisma.user.create({
    data: { name: "Admin", phone, passwordHash: "x", role: "admin" },
  });
}

async function makePatient(code: string, phone: string) {
  return testPrisma.patient.create({
    data: { patientCode: code, fullName: code, phone, status: "registered" },
  });
}

async function makeAppointment(therapistId: string, patientId: string) {
  const service = await testPrisma.service.create({
    data: {
      name: "Physio",
      slug: `physio-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
      defaultDurationMinutes: 45,
      defaultPrice: "15000",
    },
  });
  return testPrisma.appointment.create({
    data: {
      patientId,
      therapistId,
      serviceId: service.id,
      scheduledStart: new Date("2026-09-15T08:00:00.000Z"),
      scheduledEnd: new Date("2026-09-15T08:45:00.000Z"),
      bookedVia: "staff",
    },
  });
}

describe("clinical session notes", () => {
  it("creates one note per appointment; resubmit updates", async () => {
    const t = await makeTherapist("+2348011000001");
    const patient = await makePatient("TN-00001", "+2348021000001");
    const appt = await makeAppointment(t.id, patient.id);
    const a = actor({ id: t.id, role: "therapist" });

    const first = await submitSessionNote(a, appt.id, { subjective: "Back pain, day one" });
    expect(first.appointmentId).toBe(appt.id);
    expect(first.patientId).toBe(patient.id);
    expect(first.therapistId).toBe(t.id);
    expect(first.subjective).toBe("Back pain, day one");
    expect(first.editedAt).toBeNull();

    const second = await submitSessionNote(a, appt.id, {
      subjective: "Back pain, improving",
      objective: "ROM improved",
    });
    expect(second.id).toBe(first.id);
    expect(second.subjective).toBe("Back pain, improving");
    expect(second.objective).toBe("ROM improved");

    expect(await testPrisma.sessionNote.count({ where: { appointmentId: appt.id } })).toBe(1);
  });

  it("joins the open episode when one exists", async () => {
    const t = await makeTherapist("+2348011000002");
    const patient = await makePatient("TN-00002", "+2348021000002");
    const appt = await makeAppointment(t.id, patient.id);
    const a = actor({ id: t.id, role: "therapist" });

    const episode = await testPrisma.episodeOfCare.create({
      data: { patientId: patient.id, primaryTherapistId: t.id, reason: "Rehab", status: "active" },
    });

    const note = await submitSessionNote(a, appt.id, { subjective: "S" });
    expect(note.episodeId).toBe(episode.id);
  });

  it("a therapist cannot write notes for another therapist's appointment", async () => {
    const t = await makeTherapist("+2348011000003");
    const other = await makeTherapist("+2348011000004");
    const patient = await makePatient("TN-00003", "+2348021000003");
    const appt = await makeAppointment(other.id, patient.id);

    // Grant view-all so canViewPatient passes: the failure below must come
    // from the author-must-own-appointment rule, not the patient-visibility
    // gate (which Task 3 already pins).
    await testPrisma.staffProfile.create({
      data: { userId: t.id, canViewAllPatients: true },
    });

    await expect(
      submitSessionNote(actor({ id: t.id, role: "therapist" }), appt.id, { subjective: "S" }),
    ).rejects.toThrow(/appointed therapist/);
    expect(await testPrisma.sessionNote.count()).toBe(0);
  });

  it("an admin cannot write notes (read-only)", async () => {
    const admin = await makeAdmin("+2348011000005");
    const t = await makeTherapist("+2348011000006");
    const patient = await makePatient("TN-00004", "+2348021000004");
    const appt = await makeAppointment(t.id, patient.id);

    await expect(
      submitSessionNote(actor({ id: admin.id, role: "admin" }), appt.id, { subjective: "S" }),
    ).rejects.toThrow(/appointed therapist/);
    expect(await testPrisma.sessionNote.count()).toBe(0);
  });

  it("same-day edit is silent; next-day edit stamps editedAt/editedBy", async () => {
    const t = await makeTherapist("+2348011000007");
    const patient = await makePatient("TN-00005", "+2348021000005");
    const appt = await makeAppointment(t.id, patient.id);
    const a = actor({ id: t.id, role: "therapist" });

    const created = await submitSessionNote(a, appt.id, { subjective: "Day one" });
    const silent = await submitSessionNote(a, appt.id, { subjective: "Day one, ammended" });
    expect(silent.id).toBe(created.id);
    expect(silent.editedAt).toBeNull();

    // Arm createdAt in the past via a direct prisma update: createdAt is
    // @default(now()) with no writer, so the only way to simulate a next-day
    // edit is to backdate the row underneath the service.
    const yesterday = new Date(Date.now() - 26 * 3_600_000);
    await testPrisma.sessionNote.update({
      where: { id: created.id },
      data: { createdAt: yesterday },
    });

    const stamped = await submitSessionNote(a, appt.id, { subjective: "Next-day correction" });
    expect(stamped.id).toBe(created.id);
    expect(stamped.editedAt).not.toBeNull();
    expect(stamped.editedById).toBe(t.id);
  });

  it("relabels fall back to SOAP defaults when blank", async () => {
    const labels = await getSoapLabels();
    for (const key of SOAP_KEYS) {
      expect(typeof labels[key]).toBe("string");
      expect(labels[key]!.trim().length).toBeGreaterThan(0);
    }

    await testPrisma.clinicSettings.upsert({
      where: { id: 1 },
      update: { soapLabels: { subjective: "  ", objective: "What we observed" } },
      create: { id: 1, soapLabels: { subjective: "  ", objective: "What we observed" } },
    });

    const relabelled = await getSoapLabels();
    // Blank strings fall back to the default; non-blank values are kept trimmed.
    expect(relabelled.subjective).toBe(labels.subjective);
    expect(relabelled.objective).toBe("What we observed");
  });
});
