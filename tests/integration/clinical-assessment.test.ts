import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import type { SessionUser } from "@/server/auth/session";
import { getPatientForActor } from "@/server/services/patient";
import {
  dischargeEpisode,
  getOpenEpisode,
  startEpisode,
  submitAssessment,
} from "@/server/services/clinical";

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

async function shareAppointment(therapistId: string, patientId: string) {
  const service = await testPrisma.service.create({
    data: { name: "Physio", slug: `physio-${Date.now()}`, defaultDurationMinutes: 45, defaultPrice: "15000" },
  });
  await testPrisma.appointment.create({
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

describe("clinical assessments and episodes", () => {
  it("first assessment opens an episode with the complaint as reason", async () => {
    const t = await makeTherapist("+2348010000001");
    const patient = await makePatient("TA-00001", "+2348020000001");
    await shareAppointment(t.id, patient.id);

    const assessment = await submitAssessment(actor({ id: t.id, role: "therapist" }), patient.id, {
      chiefComplaint: "Low back pain",
    });

    expect(assessment.episodeId).not.toBeNull();
    const episode = await testPrisma.episodeOfCare.findUniqueOrThrow({
      where: { id: assessment.episodeId! },
    });
    expect(episode.patientId).toBe(patient.id);
    expect(episode.reason).toBe("Low back pain");
    expect(episode.status).toBe("active");
    expect(episode.primaryTherapistId).toBe(t.id);
    expect(await getOpenEpisode(patient.id)).not.toBeNull();
  });

  it("second assessment joins the open episode, never duplicates", async () => {
    const admin = await makeAdmin("+2348010000002");
    const patient = await makePatient("TA-00002", "+2348020000002");
    const a = actor({ id: admin.id, role: "admin" });

    await submitAssessment(a, patient.id, { chiefComplaint: "Neck pain" });
    await submitAssessment(a, patient.id, { chiefComplaint: "Neck pain, worse", history: "Onset 2 weeks" });

    expect(await testPrisma.episodeOfCare.count({ where: { patientId: patient.id } })).toBe(1);
    const assessments = await testPrisma.assessment.findMany({ where: { patientId: patient.id } });
    expect(assessments).toHaveLength(1);
    expect(assessments[0]!.chiefComplaint).toBe("Neck pain, worse");
    expect(assessments[0]!.history).toBe("Onset 2 weeks");
  });

  it("writes to a discharged episode are rejected", async () => {
    const admin = await makeAdmin("+2348010000003");
    const patient = await makePatient("TA-00003", "+2348020000003");
    const a = actor({ id: admin.id, role: "admin" });

    const first = await submitAssessment(a, patient.id, { chiefComplaint: "Knee pain" });
    await dischargeEpisode(a, first.episodeId!);

    await expect(
      submitAssessment(a, patient.id, { chiefComplaint: "Knee pain again", episodeId: first.episodeId! }),
    ).rejects.toThrow(/discharged or missing/);

    const episode = await testPrisma.episodeOfCare.findUniqueOrThrow({
      where: { id: first.episodeId! },
    });
    expect(episode.status).toBe("discharged");
  });

  it("a forged patient id returns nothing", async () => {
    const admin = await makeAdmin("+2348010000004");
    const a = actor({ id: admin.id, role: "admin" });
    const forged = "11111111-1111-4111-8111-111111111111";

    expect(await getPatientForActor(a, forged)).toBeNull();
    expect(await getOpenEpisode(forged)).toBeNull();
  });

  it("a therapist with no shared appointment cannot write even for valid ids", async () => {
    const t = await makeTherapist("+2348010000005");
    const other = await makeTherapist("+2348010000006");
    const patient = await makePatient("TA-00005", "+2348020000005");
    await shareAppointment(other.id, patient.id);

    const stranger = actor({ id: t.id, role: "therapist" });
    await expect(submitAssessment(stranger, patient.id, { chiefComplaint: "Back pain" })).rejects.toThrow();
    await expect(startEpisode(stranger, patient.id, "Back pain")).rejects.toThrow();
  });

  it("explicit episode start requires a reason", async () => {
    const admin = await makeAdmin("+2348010000007");
    const patient = await makePatient("TA-00006", "+2348020000006");
    const a = actor({ id: admin.id, role: "admin" });

    await expect(startEpisode(a, patient.id, "   ")).rejects.toThrow(/reason/i);
    const episode = await startEpisode(a, patient.id, "Post-stroke rehab");
    expect(episode.reason).toBe("Post-stroke rehab");
    expect(episode.status).toBe("active");
  });
});
