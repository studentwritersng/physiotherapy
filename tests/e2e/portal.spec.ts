import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  armPortalAccount,
  armPortalAppointment,
  armPortalInvoice,
  armPublicBookingState,
  deletePortalAccount,
  disconnect,
} from "./helpers/db";

// 8+ characters with a number, per passwordSchema in src/lib/zod/auth.ts.
const PASSWORD = "PortalE2E1";

// Dedicated E2E phones (valid per phoneSchema: 080 + 8 digits). Never the
// seeded 08020000001/2 — these tests create and delete their own rows.
const PHONE_DASHBOARD = "08020000011";
const PHONE_WAITING = "08020000012";
const PHONE_INTAKE = "08020000013";
const PHONE_CUTOFF = "08020000014";
const PHONE_NO_THERAPIST = "08020000015";

/**
 * Every test arms the account (and visits) it needs, so no test depends on
 * another having run first and the suite is repeatable without db:reset
 * between runs or between the chromium and mobile projects. See
 * tests/e2e/helpers/db.ts. The forged-id journey is deliberately absent here:
 * it is integration-covered (portal-appointments.test.ts) and the brief
 * forbids duplicating it in E2E.
 */
test.afterAll(async () => {
  await disconnect();
});

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
 * Walks the day links inside one appointment's Reschedule disclosure until a
 * day with slot radios renders. Scoped to the opened <details> so the booking
 * section's own day strip (same "Wed 16 Sep" labels) is never touched. Days
 * can be empty — today after hours, Sundays (seeded opening hours close
 * them) — so a blind first-day click is a dead end, not a failure.
 */
async function openFirstReschedulableDay(panel: Locator) {
  const days = panel.getByRole("link");
  const count = await days.count();
  for (let i = 0; i < count; i++) {
    await days.nth(i).click();
    await expect(
      panel.getByText("No free slots on this day.", { exact: true }).or(panel.getByRole("radio").first()),
    ).toBeVisible({ timeout: 10_000 });
    if ((await panel.getByRole("radio").count()) > 0) return;
  }
  throw new Error("no reschedulable day in the 14-day strip");
}

test.describe("portal registration and dashboard", () => {
  test("registration creates a linked account and lands on the dashboard", async ({ page }) => {
    const phone = `080${Date.now().toString().slice(-8)}`;
    const email = `e2e-register-${Date.now()}@example.com`;

    try {
      await page.goto("/portal/register");
      await page.getByLabel("Full name").fill("E2E Register");
      await page.getByLabel("Phone number").fill(phone);
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Create account" }).click();

      // Registration creates the patient row, so this is the linked
      // dashboard — never the waiting screen.
      await expect(page).toHaveURL(/\/portal$/);
      await expect(page.getByRole("heading", { name: /Hello, E2E Register/ })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Complete your intake form" }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: /Almost there/ })).toHaveCount(0);
    } finally {
      // Registration is the one journey that invents its own phone, so it
      // owns the cleanup (deletePortalAccount also clears visits).
      await deletePortalAccount(phone);
    }
  });

  test("login lands on a dashboard with next appointment and balance within 10s", async ({
    page,
  }) => {
    const { patientId } = await armPortalAccount({
      localPhone: PHONE_DASHBOARD,
      password: PASSWORD,
      name: "E2E Dashboard",
      email: "e2e-dashboard@example.com",
      linked: true,
    });
    if (!patientId) throw new Error("portal account was not linked");
    await armPortalAppointment(patientId, { startInHours: 72 });
    await armPortalInvoice(patientId, "15000.00");

    const started = Date.now();
    await portalLogin(page, PHONE_DASHBOARD, PASSWORD);

    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByRole("heading", { name: "Next appointment" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Balance" })).toBeVisible();
    await expect(page.getByText("₦15000.00", { exact: true })).toBeVisible();
    expect(Date.now() - started).toBeLessThan(10_000);

    await deletePortalAccount(PHONE_DASHBOARD);
  });

  test("an unlinked login sees the waiting screen and no appointment data", async ({
    page,
  }) => {
    await armPortalAccount({
      localPhone: PHONE_WAITING,
      password: PASSWORD,
      name: "E2E Waiting",
      email: "e2e-waiting@example.com",
      linked: false,
    });

    await portalLogin(page, PHONE_WAITING, PASSWORD);

    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByRole("heading", { name: /Almost there/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "WhatsApp the clinic" })).toBeVisible();
    // No appointment data leaks into the waiting state.
    await expect(page.getByRole("heading", { name: "Next appointment" })).toHaveCount(0);

    await page.goto("/portal/appointments");
    await expect(
      page.getByText(
        "Your online account is not linked to a patient record yet, so there is nothing to show here. Linking usually happens at your next visit.",
        { exact: true },
      ),
    ).toBeVisible();

    await deletePortalAccount(PHONE_WAITING);
  });
});

test.describe("portal intake", () => {
  test("completing the intake form dismisses the dashboard banner", async ({ page }) => {
    const { patientId } = await armPortalAccount({
      localPhone: PHONE_INTAKE,
      password: PASSWORD,
      name: "E2E Intake",
      email: "e2e-intake@example.com",
      linked: true,
    });
    if (!patientId) throw new Error("portal account was not linked");

    await portalLogin(page, PHONE_INTAKE, PASSWORD);
    await expect(page).toHaveURL(/\/portal$/);
    await expect(
      page.getByRole("heading", { name: "Complete your intake form" }),
    ).toBeVisible();

    await page.goto("/portal/intake");
    await page.getByLabel("Reason for visit").fill("Lower back pain for three weeks.");
    await page.getByRole("checkbox", { name: /I agree that/ }).check();
    await page.getByRole("button", { name: "Save intake form" }).click();
    await expect(page.getByRole("status")).toContainText(/Intake form saved/);

    await page.goto("/portal");
    await expect(
      page.getByRole("heading", { name: "Complete your intake form" }),
    ).toHaveCount(0);

    await deletePortalAccount(PHONE_INTAKE);
  });
});

test.describe("portal reschedule limits", () => {
  test("rescheduling inside the cutoff asks the patient to contact the clinic", async ({
    page,
  }) => {
    // Wide availability first (it clears bookings), then the within-cutoff
    // appointment: starting in 1 hour, inside the seeded 2-hour cutoff.
    await armPublicBookingState();
    const { patientId } = await armPortalAccount({
      localPhone: PHONE_CUTOFF,
      password: PASSWORD,
      name: "E2E Cutoff",
      email: "e2e-cutoff@example.com",
      linked: true,
    });
    if (!patientId) throw new Error("portal account was not linked");
    await armPortalAppointment(patientId, { startInHours: 1 });

    await portalLogin(page, PHONE_CUTOFF, PASSWORD);
    await page.goto("/portal/appointments");
    await page.getByText("Reschedule", { exact: true }).click();

    const panel = page.locator("details[open]");
    await openFirstReschedulableDay(panel);
    await panel.getByRole("radio").first().check();
    await panel.getByRole("button", { name: "Move appointment" }).click();

    // Cutoff internals never reach the patient — the only actionable path
    // this close in is a human at the clinic.
    await expect(panel.getByRole("status")).toContainText(/Too close to the appointment/);

    await deletePortalAccount(PHONE_CUTOFF);
  });

  test("a booking with no fixed therapist shows the contact panel, not the picker", async ({
    page,
  }) => {
    const { patientId } = await armPortalAccount({
      localPhone: PHONE_NO_THERAPIST,
      password: PASSWORD,
      name: "E2E No Therapist",
      email: "e2e-no-therapist@example.com",
      linked: true,
    });
    if (!patientId) throw new Error("portal account was not linked");
    await armPortalAppointment(patientId, { startInHours: 72, therapistId: null });

    await portalLogin(page, PHONE_NO_THERAPIST, PASSWORD);
    await page.goto("/portal/appointments");
    await page.getByText("Reschedule", { exact: true }).click();

    const panel = page.locator("details[open]");
    await expect(
      panel.getByText("This booking has no fixed therapist.", { exact: true }),
    ).toBeVisible();
    await expect(panel.getByRole("link", { name: "WhatsApp the clinic" })).toBeVisible();
    // The slot picker never renders for this row.
    await expect(panel.getByText("New time", { exact: true })).toHaveCount(0);
    await expect(panel.getByRole("radio")).toHaveCount(0);

    await deletePortalAccount(PHONE_NO_THERAPIST);
  });
});
