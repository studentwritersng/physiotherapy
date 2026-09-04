import { test, expect, type Page } from "@playwright/test";
import { openNavForMobile } from "./helpers/nav";
import {
  armPatientAccount,
  armStaffAccount,
  clearLoginThrottle,
  deletePatientAccount,
  disconnect,
} from "./helpers/db";

// Matches prisma/seed.ts. SEED_* env vars default to "changeme1".
const STAFF_PASSWORD = process.env.SEED_STAFF_PASSWORD ?? "changeme1";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme1";
const PATIENT_PASSWORD = process.env.SEED_PATIENT_PASSWORD ?? "changeme1";

const ADMIN_EMAIL = "admin@tetaphysio.ng";
const THERAPIST_EMAIL = "chidera@tetaphysio.ng";
const RECEPTION_EMAIL = "reception@tetaphysio.ng";
const PATIENT_PHONE = "08020000001";

/**
 * Every test arms the account it uses, so no test depends on another having run
 * first and the suite is repeatable without npm run db:reset between runs or
 * between the chromium and mobile projects. See tests/e2e/helpers/db.ts.
 */
test.afterAll(async () => {
  await disconnect();
});

async function staffLogin(
  page: Page,
  identifier: string,
  password: string,
  opts: { expectSuccess?: boolean } = {},
) {
  const { expectSuccess = true } = opts;
  await page.goto("/login");
  await page.getByLabel("Email or phone number").fill(identifier);
  await page.getByLabel("Password").fill(password);
  if (!expectSuccess) {
    // A failed login correctly stays put — awaiting navigation here would
    // time out by design, so click bare and let the caller assert the error.
    await page.getByRole("button", { name: "Log in" }).click();
    return;
  }
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 10_000 }),
    page.getByRole("button", { name: "Log in" }).click(),
  ]);
}

async function patientLogin(page: Page, phone: string, password: string) {
  await page.goto("/portal/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/portal/login"), { timeout: 10_000 }),
    page.getByRole("button", { name: "Log in" }).click(),
  ]);
}

/** Walks a staff account through the forced-change screen onto the dashboard. */
async function completeForcedPasswordChange(page: Page, current: string, next: string) {
  await expect(page).toHaveURL(/\/reset-password/);
  await page.getByLabel("Current password").fill(current);
  await page.getByLabel("New password").fill(next);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/reset-password"), { timeout: 10_000 }),
    page.getByRole("button", { name: "Save password" }).click(),
  ]);
}

/**
 * The visible labels in the main navigation, in order.
 *
 * A section whose sub-project has not shipped renders as a disabled span with a
 * "soon" badge nested inside it (NavShell.tsx), so the item's text is
 * "Payments soon" and no element has the label as its exact text. The badge is
 * stripped here and the whole list is compared at the call site, which asserts
 * presence, absence and ordering in one go — stricter than checking each label
 * on its own.
 */
async function navLabels(page: Page): Promise<string[]> {
  // On mobile viewports the nav lives in a closed drawer — open it first.
  // No-op on desktop where the hamburger is display:none.
  await openNavForMobile(page);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav).toBeVisible();

  const items = nav.getByRole("listitem");
  await expect(items.first()).toBeVisible();

  // allInnerTexts, not allTextContents: innerText ignores hidden nodes, so a
  // label hidden by CSS cannot pass as visible navigation.
  return (await items.allInnerTexts()).map((text) => text.replace(/\s*soon\s*$/i, "").trim());
}

test.describe("staff authentication", () => {
  test("admin logs in, is forced to change password, then reaches the dashboard", async ({
    page,
  }) => {
    await armStaffAccount(ADMIN_EMAIL, ADMIN_PASSWORD, true);

    await staffLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Seeded staff carry mustResetPassword, so the change screen comes first.
    await expect(page).toHaveURL(/\/reset-password/);
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();

    await page.getByLabel("Current password").fill(ADMIN_PASSWORD);
    await page.getByLabel("New password").fill("AdminNew1pass");
    await page.getByRole("button", { name: "Save password" }).click();

    await expect(page).toHaveURL(/\/staff$/);
    await expect(page.getByRole("heading", { name: /Good to see you/ })).toBeVisible();
  });

  test("the forced-change screen blocks the dashboard until the password is changed", async ({
    page,
  }) => {
    await armStaffAccount(ADMIN_EMAIL, ADMIN_PASSWORD, true);

    await staffLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/reset-password/);

    // Definition of Done item 5: no other page renders first.
    await page.goto("/staff");
    await expect(page).toHaveURL(/\/reset-password/);
  });

  test("admin sees every navigation section", async ({ page }) => {
    await armStaffAccount(ADMIN_EMAIL, "AdminNew1pass", false);

    await staffLogin(page, ADMIN_EMAIL, "AdminNew1pass");
    await expect(page).toHaveURL(/\/staff$/);

    expect(await navLabels(page)).toEqual([
      "Dashboard",
      "Appointments",
      "Patients",
      "Payments",
      "Staff",
      "Reports",
      "Clinic settings",
    ]);
  });

  test("therapist sees only their own sections", async ({ page }) => {
    await armStaffAccount(THERAPIST_EMAIL, STAFF_PASSWORD, true);

    await staffLogin(page, THERAPIST_EMAIL, STAFF_PASSWORD);
    await completeForcedPasswordChange(page, STAFF_PASSWORD, "TherapistNew1");

    await expect(page).toHaveURL(/\/staff$/);

    // Exact equality, so an accidentally added section fails the test rather
    // than passing unnoticed.
    expect(await navLabels(page)).toEqual(["Dashboard", "My schedule", "My patients"]);
  });

  test("receptionist sees payments but not staff administration", async ({ page }) => {
    await armStaffAccount(RECEPTION_EMAIL, STAFF_PASSWORD, true);

    await staffLogin(page, RECEPTION_EMAIL, STAFF_PASSWORD);
    await completeForcedPasswordChange(page, STAFF_PASSWORD, "ReceptionNew1");

    await expect(page).toHaveURL(/\/staff$/);

    expect(await navLabels(page)).toEqual(["Dashboard", "Appointments", "Patients", "Payments"]);
  });

  test("wrong password shows an error and stays on the login page", async ({ page }) => {
    await armStaffAccount(ADMIN_EMAIL, ADMIN_PASSWORD, false);

    await staffLogin(page, ADMIN_EMAIL, "definitelywrong1", { expectSuccess: false });

    await expect(page.getByRole("status")).toContainText(/Incorrect login details/i);
    await expect(page).toHaveURL(/\/login/);

    // Do not leave a failed attempt behind for the rate limiter to count.
    await clearLoginThrottle(ADMIN_EMAIL);
  });

  test("logging out clears the session and blocks the dashboard", async ({ page }) => {
    await armStaffAccount(ADMIN_EMAIL, "AdminNew1pass", false);

    await staffLogin(page, ADMIN_EMAIL, "AdminNew1pass");
    await expect(page).toHaveURL(/\/staff$/);

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL("/");

    await page.goto("/staff");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("patient authentication", () => {
  test.beforeEach(async () => {
    await armPatientAccount(PATIENT_PHONE, PATIENT_PASSWORD);
  });

  test("patient logs in and reaches their dashboard", async ({ page }) => {
    await patientLogin(page, PATIENT_PHONE, PATIENT_PASSWORD);

    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByRole("heading", { name: /Hello, Ada Obi/ })).toBeVisible();
  });

  test("patient navigation has no staff sections", async ({ page }) => {
    await patientLogin(page, PATIENT_PHONE, PATIENT_PASSWORD);
    await expect(page).toHaveURL(/\/portal$/);

    expect(await navLabels(page)).toEqual(["Dashboard", "Appointments", "My profile", "Payments"]);
  });

  test("a patient cannot reach the staff area", async ({ page }) => {
    await patientLogin(page, PATIENT_PHONE, PATIENT_PASSWORD);
    await expect(page).toHaveURL(/\/portal$/);

    await page.goto("/staff");
    await expect(page).toHaveURL(/\/portal$/);
  });

  test("registration creates an account and lands in the portal", async ({ page }) => {
    const phone = `080${Date.now().toString().slice(-8)}`;

    try {
      await page.goto("/portal/register");
      await page.getByLabel("Full name").fill("Test Patient");
      await page.getByLabel("Phone number").fill(phone);
      await page.getByLabel("Password").fill("NewPatient1");
      await page.getByRole("button", { name: "Create account" }).click();

      await expect(page).toHaveURL(/\/portal$/);
      await expect(page.getByRole("heading", { name: /Hello, Test Patient/ })).toBeVisible();
    } finally {
      // Registration is the one journey that inserts rows, so it owns the cleanup.
      await deletePatientAccount(phone);
    }
  });

  test("the session cookie is HttpOnly and SameSite=Lax", async ({ page, context }) => {
    await patientLogin(page, PATIENT_PHONE, PATIENT_PASSWORD);
    await expect(page).toHaveURL(/\/portal$/);

    const cookie = (await context.cookies()).find((c) => c.name === "tp_session");
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");
  });
});

test.describe("unauthenticated access", () => {
  test("protected routes redirect to the right login page", async ({ page }) => {
    await page.goto("/staff");
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/portal");
    await expect(page).toHaveURL(/\/portal\/login/);
  });

  test("the API returns 401 rather than data", async ({ request }) => {
    const response = await request.get("/api/auth/me");
    expect(response.status()).toBe(401);
  });
});
