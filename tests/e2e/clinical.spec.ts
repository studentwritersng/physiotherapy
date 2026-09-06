import { test, expect, type Page } from "@playwright/test";
import {
  CLINICAL_THERAPIST_EMAIL,
  armClinicalAppointment,
  armClinicalPatient,
  armClinicalTherapist,
  deletePortalAccount,
  disconnect,
  lagosMorningToday,
  setShowClinicalToPatients,
} from "./helpers/db";

// 8+ characters with a number, per passwordSchema in src/lib/zod/auth.ts.
const STAFF_PASSWORD = "ClinicalE2E1";
const PATIENT_PASSWORD = "PortalE2E1";

// Dedicated E2E phones (valid per phoneSchema: 080 + 8 digits). Never the
// seeded 08020000001/2 and never the portal suite's 08020000011–15 — each
// test arms and deletes its own rows.
const PHONE_ASSESS = "08020000021";
const PHONE_SOAP = "08020000022";
const PHONE_PLAN = "08020000023";
const PHONE_DOCS = "08020000024";
const PHONE_TODAY = "08020000025";

/**
 * Every test arms the fixture it needs (therapist account, linked patient,
 * shared appointment), so no test depends on another having run first and the
 * suite is repeatable without db:reset between runs or between the chromium
 * and mobile projects. See tests/e2e/helpers/db.ts. Forged-id and
 * midnight-boundary cases are deliberately absent here: they stay
 * integration-covered (clinical-assessment.test.ts, clinical-notes.test.ts).
 */
test.afterAll(async () => {
  await disconnect();
});

async function staffLogin(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email or phone number").fill(identifier);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 10_000 }),
    page.getByRole("button", { name: "Log in" }).click(),
  ]);
}

async function portalLogin(page: Page, phone: string, password: string) {
  await page.goto("/portal/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/portal/login"), { timeout: 10_000 }),
    page.getByRole("button", { name: "Log in" }).click(),
  ]);
}

/**
 * Arms therapist + linked patient + one shared appointment 72h out, and
 * returns the record URL the staff journeys start from.
 */
async function armRecordFixture(
  localPhone: string,
  name: string,
): Promise<{ therapistId: string; patientId: string; recordUrl: string }> {
  const therapistId = await armClinicalTherapist(STAFF_PASSWORD);
  const { patientId } = await armClinicalPatient(localPhone, PATIENT_PASSWORD, name);
  if (!patientId) throw new Error("clinical fixture was not linked");
  await armClinicalAppointment(patientId, therapistId, new Date(Date.now() + 72 * 3_600_000));
  return { therapistId, patientId, recordUrl: `/staff/patients/${patientId}` };
}

test.describe("clinical record", () => {
  test("an assessment auto-creates an episode visible in the timeline", async ({ page }) => {
    const { recordUrl } = await armRecordFixture(PHONE_ASSESS, "E2E Assess");
    try {
      await staffLogin(page, CLINICAL_THERAPIST_EMAIL, STAFF_PASSWORD);
      await page.goto(recordUrl);
      await expect(page.getByRole("heading", { name: "E2E Assess" })).toBeVisible();

      const complaint = "E2E stiff neck after long drives";
      await page.getByLabel(/Chief complaint/).fill(complaint);
      await page.getByRole("button", { name: "Save assessment" }).click();

      const section = page.locator("#assessments");
      // 10s, not the 5s default: a save round-trips a server action plus a
      // full record re-render, which runs long on this machine (the trace of
      // the first run caught the plan form still showing "Saving…" at 5s).
      await expect(
        section.getByRole("status").filter({ hasText: /Assessment saved/ }),
      ).toBeVisible({ timeout: 10_000 });
      // The auto-created episode carries the complaint as its reason, so the
      // same text proves both the row and its episode grouping. Scoped to the
      // list item: getByText also matches the form's textarea value.
      await expect(
        section.getByRole("listitem").filter({ hasText: complaint }),
      ).toBeVisible();
    } finally {
      await deletePortalAccount(PHONE_ASSESS);
    }
  });

  test("a SOAP note saves and re-renders in under three minutes", async ({ page }) => {
    const { recordUrl } = await armRecordFixture(PHONE_SOAP, "E2E Soap");
    try {
      await staffLogin(page, CLINICAL_THERAPIST_EMAIL, STAFF_PASSWORD);
      await page.goto(recordUrl);

      const started = Date.now();
      const subjective = "E2E neck pain eased after mobilisation";
      await page.getByLabel(/Subjective/).fill(subjective);
      await page.getByRole("button", { name: "Save session note" }).click();

      const section = page.locator("#notes");
      await expect(
        section.getByRole("status").filter({ hasText: /Session note saved/ }),
      ).toBeVisible({ timeout: 10_000 });
      // Scoped to the list item: getByText also matches the textarea holding
      // the same value, which trips strict mode.
      await expect(
        section.getByRole("listitem").filter({ hasText: subjective }),
      ).toBeVisible();
      // By construction this is one form submit plus one re-render; the bound
      // documents the budget rather than racing it.
      expect(Date.now() - started).toBeLessThan(180_000);
    } finally {
      await deletePortalAccount(PHONE_SOAP);
    }
  });

  test("showing a plan to the patient lights up the portal treatment card", async ({
    page,
  }) => {
    const { recordUrl } = await armRecordFixture(PHONE_PLAN, "E2E Plan");
    const summary = "E2E graded neck programme";
    try {
      await staffLogin(page, CLINICAL_THERAPIST_EMAIL, STAFF_PASSWORD);
      await page.goto(recordUrl);

      await page.getByLabel(/Goals/).fill(summary);
      await page.getByRole("button", { name: "Save plan" }).click();
      const section = page.locator("#plans");
      await expect(
        section.getByRole("status").filter({ hasText: /Treatment plan saved/ }),
      ).toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: "Show to patient" }).click();
      await expect(
        section.getByRole("status").filter({ hasText: /Plan shared with patient/ }),
      ).toBeVisible({ timeout: 10_000 });

      // The per-plan flag alone never leaks: the clinic master switch gates it.
      await setShowClinicalToPatients(true);
      await portalLogin(page, PHONE_PLAN, PATIENT_PASSWORD);
      await expect(page).toHaveURL(/\/portal$/);
      await expect(page.getByRole("heading", { name: "Treatment plan" })).toBeVisible();
      await expect(page.getByText(summary)).toBeVisible();
    } finally {
      await setShowClinicalToPatients(false);
      await deletePortalAccount(PHONE_PLAN);
    }
  });

  test("documents render for the configured state without live uploads", async ({ page }) => {
    const { recordUrl } = await armRecordFixture(PHONE_DOCS, "E2E Docs");
    try {
      await staffLogin(page, CLINICAL_THERAPIST_EMAIL, STAFF_PASSWORD);
      await page.goto(recordUrl);

      const section = page.locator("#documents");
      // Environment matrix, asserted without ever uploading bytes: machines
      // with R2 credentials (like this dev box) render the picker, while CI
      // without credentials renders the not-configured notice. Both branches
      // pin their state; neither attempts a live upload.
      if ((await section.getByLabel(/File/).count()) > 0) {
        await expect(section.getByLabel(/File/)).toBeVisible();
      } else {
        await expect(
          section.getByText("Document storage is not configured", { exact: true }),
        ).toBeVisible();
        await expect(section.getByLabel(/File/)).toHaveCount(0);
      }
    } finally {
      await deletePortalAccount(PHONE_DOCS);
    }
  });

  test("the today-view lists today's visits", async ({ page }) => {
    const therapistId = await armClinicalTherapist(STAFF_PASSWORD);
    const { patientId } = await armClinicalPatient(PHONE_TODAY, PATIENT_PASSWORD, "E2E Today");
    if (!patientId) throw new Error("clinical fixture was not linked");
    await armClinicalAppointment(patientId, therapistId, lagosMorningToday());
    try {
      await staffLogin(page, CLINICAL_THERAPIST_EMAIL, STAFF_PASSWORD);
      await page.goto("/staff/today");

      await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
      await expect(page.getByText("E2E Today")).toBeVisible();
    } finally {
      await deletePortalAccount(PHONE_TODAY);
    }
  });
});
