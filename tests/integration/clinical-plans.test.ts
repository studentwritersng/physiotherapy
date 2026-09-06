import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import type { SessionUser } from "@/server/auth/session";
import {
  addExercise,
  createTreatmentPlan,
  updateExercise,
  updateTreatmentPlan,
} from "@/server/services/clinical";
import { getPortalDashboard } from "@/server/services/portal";

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

async function makeReceptionist(phone: string) {
  return testPrisma.user.create({
    data: { name: "Recep", phone, passwordHash: "x", role: "receptionist" },
  });
}

async function makePatient(code: string, phone: string) {
  return testPrisma.patient.create({
    data: { patientCode: code, fullName: code, phone, status: "registered" },
  });
}

async function shareAppointment(therapistId: string, patientId: string) {
  const service = await testPrisma.service.create({
    data: {
      name: "Physio",
      slug: `physio-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      defaultDurationMinutes: 45,
      defaultPrice: "15000",
    },
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

async function setMasterSwitch(on: boolean) {
  await testPrisma.clinicSettings.upsert({
    where: { id: 1 },
    update: { showClinicalToPatients: on },
    create: { id: 1, showClinicalToPatients: on },
  });
}

describe("clinical treatment plans and exercises", () => {
  it("creates a plan with exercises in sort order", async () => {
    const t = await makeTherapist("+2348010000101");
    const patient = await makePatient("TP-00001", "+2348020000101");
    await shareAppointment(t.id, patient.id);
    const a = actor({ id: t.id, role: "therapist" });

    const plan = await createTreatmentPlan(a, patient.id, {
      goals: "Walk without pain",
      planDetails: "2x weekly physio",
      frequency: "2x weekly",
      duration: "6 weeks",
      focusAreas: "Lumbar spine",
    });

    expect(plan.patientId).toBe(patient.id);
    expect(plan.status).toBe("active");
    expect(plan.episodeId).toBeNull();

    await addExercise(a, plan.id, { name: "Cat-cow", sortOrder: 2 });
    await addExercise(a, plan.id, {
      name: "Bird-dog",
      description: "10 reps each side",
      sortOrder: 1,
    });

    const rows = await testPrisma.exercise.findMany({
      where: { treatmentPlanId: plan.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(rows.map((r) => r.name)).toEqual(["Bird-dog", "Cat-cow"]);
  });

  it("only therapist with access or admin writes; receptionist fails", async () => {
    const t = await makeTherapist("+2348010000102");
    const admin = await makeAdmin("+2348010000103");
    const recep = await makeReceptionist("+2348010000104");
    const patient = await makePatient("TP-00002", "+2348020000102");
    await shareAppointment(t.id, patient.id);

    const plan = await createTreatmentPlan(actor({ id: t.id, role: "therapist" }), patient.id, {
      goals: "Restore ROM",
    });
    // Admin writes too.
    const adminPlan = await createTreatmentPlan(actor({ id: admin.id, role: "admin" }), patient.id, {
      goals: "Admin plan",
    });
    expect(adminPlan.id).not.toBe(plan.id);

    // Receptionist fails: assertCanReadClinical throws.
    await expect(
      createTreatmentPlan(actor({ id: recep.id, role: "receptionist" }), patient.id, {
        goals: "Sneaky plan",
      }),
    ).rejects.toThrow(/restricted to therapists and admins/);
    await expect(
      updateTreatmentPlan(actor({ id: recep.id, role: "receptionist" }), plan.id, {
        status: "completed",
      }),
    ).rejects.toThrow(/restricted to therapists and admins/);
    await expect(
      addExercise(actor({ id: recep.id, role: "receptionist" }), plan.id, { name: "Sneak" }),
    ).rejects.toThrow(/restricted to therapists and admins/);

    // Status change is a plain update.
    const done = await updateTreatmentPlan(actor({ id: admin.id, role: "admin" }), plan.id, {
      status: "completed",
    });
    expect(done.status).toBe("completed");
  });

  it("forged ids fail", async () => {
    const t = await makeTherapist("+2348010000105");
    const forged = "11111111-1111-4111-8111-111111111111";
    const stranger = actor({ id: t.id, role: "therapist" });

    await expect(
      createTreatmentPlan(stranger, forged, { goals: "Ghost plan" }),
    ).rejects.toThrow();
    await expect(updateTreatmentPlan(stranger, forged, { status: "completed" })).rejects.toThrow();
    await expect(updateExercise(stranger, forged, { patientVisible: true })).rejects.toThrow();
  });

  it("toggling patientVisible flips portal exposure (master AND plan flag)", async () => {
    const t = await makeTherapist("+2348010000106");
    const patient = await makePatient("TP-00003", "+2348020000103");
    await shareAppointment(t.id, patient.id);
    const a = actor({ id: t.id, role: "therapist" });

    const plan = await createTreatmentPlan(a, patient.id, { goals: "Portal plan" });

    // Master OFF + flag ON → hidden.
    await updateTreatmentPlan(a, plan.id, { patientVisible: true });
    await setMasterSwitch(false);
    expect((await getPortalDashboard(patient.id)).treatmentPlan).toBeNull();

    // Master ON + flag OFF → hidden.
    await updateTreatmentPlan(a, plan.id, { patientVisible: false });
    await setMasterSwitch(true);
    expect((await getPortalDashboard(patient.id)).treatmentPlan).toBeNull();

    // Both ON → shown.
    await updateTreatmentPlan(a, plan.id, { patientVisible: true });
    const dash = await getPortalDashboard(patient.id);
    expect(dash.treatmentPlan?.id).toBe(plan.id);
    expect(dash.treatmentPlan?.summary).toBe("Portal plan");
  });

  it("portal lists only patientVisible exercises of the exposed plan", async () => {
    const t = await makeTherapist("+2348010000107");
    const patient = await makePatient("TP-00004", "+2348020000104");
    await shareAppointment(t.id, patient.id);
    const a = actor({ id: t.id, role: "therapist" });

    const plan = await createTreatmentPlan(a, patient.id, {
      goals: "Exercise plan",
      patientVisible: true,
    });
    const visible = await addExercise(a, plan.id, {
      name: "Glute bridge",
      description: "3x12",
      sortOrder: 1,
      patientVisible: true,
    });
    await addExercise(a, plan.id, { name: "Clinical-only drill", sortOrder: 0 });

    await setMasterSwitch(true);
    let dash = await getPortalDashboard(patient.id);
    expect(dash.treatmentPlan?.exercises).toEqual([{ name: "Glute bridge", description: "3x12" }]);

    // Flipping the exercise flag hides it without touching the plan.
    await updateExercise(a, visible.id, { patientVisible: false });
    dash = await getPortalDashboard(patient.id);
    expect(dash.treatmentPlan?.exercises).toEqual([]);
  });
});
