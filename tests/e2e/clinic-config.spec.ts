import { test, expect, type Page } from "@playwright/test";
import { armPatientAccount, armStaffAccount, disconnect, resetClinicConfig } from "./helpers/db";

const STAFF_PASSWORD = process.env.SEED_STAFF_PASSWORD ?? "changeme1";
const PATIENT_PASSWORD = process.env.SEED_PATIENT_PASSWORD ?? "changeme1";

const ADMIN_EMAIL = "admin@tetaphysio.ng";
const THERAPIST_EMAIL = "chidera@tetaphysio.ng";
const RECEPTION_EMAIL = "reception@tetaphysio.ng";
const PATIENT_PHONE = "08020000001";

const ADMIN_PASSWORD = "SettingsAdmin1";

/** Logs in as an admin who is already past the forced password change. */
async function loginAsAdmin(page: Page) {
  await armStaffAccount(ADMIN_EMAIL, ADMIN_PASSWORD, false);
  await page.goto("/login");
  await page.getByLabel("Email or phone number").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 10_000 }),
    page.getByRole("button", { name: "Log in" }).click(),
  ]);
  await expect(page).toHaveURL(/\/staff$/);
}

test.beforeEach(async () => {
  await resetClinicConfig();
});

test.afterAll(async () => {
  await disconnect();
});

test.describe("clinic settings", () => {
  test("admin reaches settings from the navigation", async ({ page }) => {
    await loginAsAdmin(page);

    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Clinic settings" })
      .click();

    await expect(page).toHaveURL(/\/staff\/settings$/);
    await expect(page.getByRole("heading", { name: "Clinic settings", level: 1 })).toBeVisible();
  });

  test("saving clinic details shows a success message and persists", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings");

    const settingsForm = page.locator("form").filter({ has: page.getByLabel("Clinic name") });
    await settingsForm.getByLabel("Clinic name").fill("TetaPhysio Ikoyi");
    await settingsForm.getByLabel("Tagline").fill("Movement is medicine");
    await settingsForm.getByRole("button", { name: "Save clinic details" }).click();

    await expect(settingsForm.getByRole("status")).toContainText(/saved/i);

    await page.reload();
    await expect(page.getByLabel("Clinic name")).toHaveValue("TetaPhysio Ikoyi");
  });

  test("an invalid cutoff is rejected with an inline error", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings");

    const settingsForm = page.locator("form").filter({ has: page.getByLabel("Reschedule cutoff (hours)") });

    // Bypass the number input's own min so the server-side rule is what fails.
    await settingsForm.getByLabel("Reschedule cutoff (hours)").evaluate((el) => {
      const input = el as HTMLInputElement;
      input.removeAttribute("min");
      input.value = "-5";
    });
    await settingsForm.getByRole("button", { name: "Save clinic details" }).click();

    await expect(settingsForm.getByRole("status")).toContainText(/highlighted/i);
  });

  test("opening hours round-trip, including a closed day", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings");

    const hoursForm = page.locator("form").filter({ has: page.getByLabel("Monday", { exact: true }) });

    await hoursForm.getByLabel("Monday", { exact: true }).check();
    await page.locator("#monday-open").fill("08:30");
    await page.locator("#monday-close").fill("16:30");
    await hoursForm.getByLabel("Sunday", { exact: true }).uncheck();

    await hoursForm.getByRole("button", { name: "Save opening hours" }).click();
    await expect(hoursForm.getByRole("status")).toContainText(/saved/i);

    await page.reload();
    await expect(page.locator("#monday-open")).toHaveValue("08:30");
    await expect(hoursForm.getByLabel("Sunday", { exact: true })).not.toBeChecked();
  });

  test("a closing time before the opening time is refused", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings");

    const hoursForm = page.locator("form").filter({ has: page.getByLabel("Tuesday", { exact: true }) });
    await hoursForm.getByLabel("Tuesday", { exact: true }).check();
    await page.locator("#tuesday-open").fill("17:00");
    await page.locator("#tuesday-close").fill("08:00");
    await hoursForm.getByRole("button", { name: "Save opening hours" }).click();

    await expect(hoursForm.getByRole("status")).toContainText(/highlighted/i);
  });
});

test.describe("services", () => {
  test("creating a service lists it as active with a slug", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/services");

    await page.getByLabel("Service name").fill("Dry Needling");
    await page.getByLabel("Duration (minutes)").fill("30");
    await page.getByLabel("Price (₦)").fill("12000");
    await page.getByRole("button", { name: "Add service" }).click();

    await expect(page.getByRole("status")).toContainText(/Dry Needling added/i);

    const row = page.getByRole("row", { name: /Dry Needling/ });
    await expect(row).toContainText("30 min");
    await expect(row).toContainText("12000");
    await expect(row).toContainText("Active");
    await expect(row).toContainText("/dry-needling");
  });

  test("a zero duration is refused", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/services");

    await page.getByLabel("Service name").fill("Bad Service");
    await page.getByLabel("Duration (minutes)").evaluate((el) => {
      const input = el as HTMLInputElement;
      input.removeAttribute("min");
      input.value = "0";
    });
    await page.getByLabel("Price (₦)").fill("1000");
    await page.getByRole("button", { name: "Add service" }).click();

    await expect(page.getByRole("status")).toContainText(/highlighted/i);
  });

  test("deactivating a service flips its status", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/services");

    const row = page.getByRole("row", { name: /Pain Management/ });
    await expect(row).toContainText("Active");

    await row.getByRole("button", { name: "Deactivate" }).click();

    const updated = page.getByRole("row", { name: /Pain Management/ });
    await expect(updated).toContainText("Inactive");
    await expect(updated.getByRole("button", { name: "Activate" })).toBeVisible();
  });

  test("editing a service changes its price but keeps its slug", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/services");

    // The edit form lives in a <details> disclosure, closed by default.
    await page.getByText("Edit Pain Management").click();

    const editForm = page.locator("details", { hasText: "Edit Pain Management" });
    await editForm.getByLabel("Price (₦)").fill("17500.00");
    await editForm.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("status")).toContainText(/updated/i);

    const row = page.getByRole("row", { name: /Pain Management/ });
    await expect(row).toContainText("17500.00");
    // The slug is a public URL — repricing or renaming must not break a link.
    await expect(row).toContainText("/pain-management");
  });

  test("a price with three decimals is refused", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/services");

    await page.getByLabel("Service name").fill("Odd Price");
    await page.getByLabel("Duration (minutes)").fill("30");
    // Decimal(12,2) would silently round a third decimal, so the schema rejects it.
    await page.getByLabel("Price (₦)").fill("100.123");
    await page.getByRole("button", { name: "Add service" }).click();

    await expect(page.getByRole("status")).toContainText(/highlighted/i);
  });
});

test.describe("therapist availability", () => {
  test("adding weekly hours lists them under Every week", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/availability");

    await page.getByLabel("Every week").check();
    await page.getByLabel("Day of the week").selectOption("2");
    await page.getByLabel("From", { exact: true }).fill("09:00");
    await page.getByLabel("To", { exact: true }).fill("13:00");
    await page.getByRole("button", { name: "Add entry" }).click();

    await expect(page.getByRole("status")).toContainText(/Availability added/i);
    await expect(page.getByRole("listitem").filter({ hasText: "Tuesday" })).toContainText(
      "09:00–13:00",
    );
  });

  test("a dated entry is labelled as replacing weekly hours", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/availability");

    await page.getByLabel("A specific date").check();
    await page.getByLabel("Date").fill("2026-12-25");
    await page.getByLabel("From", { exact: true }).fill("00:00");
    await page.getByLabel("To", { exact: true }).fill("23:59");
    await page.getByLabel("This is time off, not working hours").check();
    await page.getByLabel("Reason (optional)").fill("Christmas Day");
    await page.getByRole("button", { name: "Add entry" }).click();

    await expect(page.getByRole("status")).toContainText(/Block added/i);

    const entry = page.getByRole("listitem").filter({ hasText: "2026-12-25" });
    await expect(entry).toContainText("Time off");
    await expect(entry).toContainText("Replaces weekly hours");
    await expect(entry).toContainText("Christmas Day");
  });

  test("an end time before the start time is refused", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/availability");

    await page.getByLabel("From", { exact: true }).fill("17:00");
    await page.getByLabel("To", { exact: true }).fill("09:00");
    await page.getByRole("button", { name: "Add entry" }).click();

    await expect(page.getByRole("status")).toContainText(/highlighted/i);
  });

  test("switching therapist changes whose hours are shown", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/availability");

    await page.getByRole("link", { name: /Aisha Bello/ }).click();

    await expect(page).toHaveURL(/therapist=/);
    await expect(page.getByRole("heading", { name: /Aisha Bello's hours/ })).toBeVisible();
  });
});

test.describe("website content", () => {
  test("a testimonial is created as a draft, then published", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/content");

    await page.getByLabel("Patient name").fill("Ada O.");
    await page.getByLabel("Testimonial").fill("I am walking without pain again.");
    await page.getByRole("button", { name: "Add testimonial" }).click();

    await expect(page.getByRole("status")).toContainText(/added/i);

    const entry = page.getByRole("listitem").filter({ hasText: "Ada O." });
    await expect(entry).toContainText("Draft");

    await entry.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Ada O." })).toContainText(
      "Published",
    );
  });

  test("about content persists", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/content");

    // Two FormStatus regions live on this page (about + testimonials), so scope
    // to the about form the way the settings tests scope to their form.
    const aboutForm = page.locator("form").filter({ has: page.getByLabel("About the clinic") });

    await aboutForm.getByLabel("About the clinic").fill("Serving Lagos since 2019.");
    await aboutForm.getByRole("button", { name: "Save about content" }).click();

    await expect(aboutForm.getByRole("status")).toContainText(/saved/i);

    await page.reload();
    await expect(page.getByLabel("About the clinic")).toHaveValue("Serving Lagos since 2019.");
  });

  test("an empty testimonial is refused", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/content");

    const testimonialForm = page.locator("form").filter({ has: page.getByLabel("Patient name") });

    await testimonialForm.getByLabel("Patient name").fill("Nobody");
    await testimonialForm.getByRole("button", { name: "Add testimonial" }).click();

    await expect(testimonialForm.getByRole("status")).toContainText(/highlighted/i);
  });
});

test.describe("settings are admin-only", () => {
  test("a therapist is refused", async ({ page }) => {
    await armStaffAccount(THERAPIST_EMAIL, STAFF_PASSWORD, false);
    await page.goto("/login");
    await page.getByLabel("Email or phone number").fill(THERAPIST_EMAIL);
    await page.getByLabel("Password").fill(STAFF_PASSWORD);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 10_000 }),
      page.getByRole("button", { name: "Log in" }).click(),
    ]);
    await expect(page).toHaveURL(/\/staff$/);

    // Navigation must not offer it…
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByText("Clinic settings", { exact: true })).toHaveCount(0);

    // …and the route itself must refuse, since navigation is not a security
    // boundary (Foundation spec §5.3).
    const response = await page.goto("/staff/settings");
    expect(response?.status()).toBe(403);
  });

  test("a receptionist is refused", async ({ page }) => {
    await armStaffAccount(RECEPTION_EMAIL, STAFF_PASSWORD, false);
    await page.goto("/login");
    await page.getByLabel("Email or phone number").fill(RECEPTION_EMAIL);
    await page.getByLabel("Password").fill(STAFF_PASSWORD);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 10_000 }),
      page.getByRole("button", { name: "Log in" }).click(),
    ]);
    await expect(page).toHaveURL(/\/staff$/);

    const response = await page.goto("/staff/settings");
    expect(response?.status()).toBe(403);
  });

  test("a patient is redirected to their own portal", async ({ page }) => {
    await armPatientAccount(PATIENT_PHONE, PATIENT_PASSWORD);
    await page.goto("/portal/login");
    await page.getByLabel("Phone number").fill(PATIENT_PHONE);
    await page.getByLabel("Password").fill(PATIENT_PASSWORD);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith("/portal/login"), { timeout: 10_000 }),
      page.getByRole("button", { name: "Log in" }).click(),
    ]);
    await expect(page).toHaveURL(/\/portal$/);

    await page.goto("/staff/settings");
    await expect(page).toHaveURL(/\/portal$/);
  });

  test("an unauthenticated visitor is redirected to login", async ({ page }) => {
    await page.goto("/staff/settings");
    await expect(page).toHaveURL(/\/login/);
  });
});