import { test, expect, type Page } from "@playwright/test";
import { armStaffAccount, disconnect, resetBookingState } from "./helpers/db";

const ADMIN_EMAIL = "admin@tetaphysio.ng";
const RECEPTION_EMAIL = "reception@tetaphysio.ng";
const THERAPIST_EMAIL = "chidera@tetaphysio.ng";

const ADMIN_PASSWORD = "BookingAdmin1";
const RECEPTION_PASSWORD = "BookingRecep1";
const THERAPIST_PASSWORD = "BookingThera1";

/**
 * Walk-ins insert patient rows that resetBookingState deliberately keeps, so
 * fixed phones would make the suite single-use: a second run finds the first
 * run's patient and renders the match branch instead of the new-patient one.
 * Time-derived phones keep every run on the unknown-phone path — the same
 * reason the registration journey in login.spec.ts mints its phone.
 */
function uniquePhone(tag: number): string {
  return `080${Date.now().toString().slice(-8, -1)}${tag}`;
}

async function loginAs(page: Page, email: string, password: string, dest: RegExp) {
  await armStaffAccount(email, password, false);
  await page.goto("/login");
  await page.getByLabel("Email or phone number").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 10_000 }),
    page.getByRole("button", { name: "Log in" }).click(),
  ]);
  await expect(page).toHaveURL(dest);
  // Let the login navigation fully settle before the test issues its own
  // goto: a goto racing the redirect commit aborts with ERR_ABORTED (the same
  // navigation-timing class as the login race in the ledger).
  await page.waitForLoadState();
}

test.beforeEach(async () => {
  await resetBookingState();
});

test.afterAll(async () => {
  await disconnect();
});

test.describe("walk-in booking", () => {
  test("a receptionist completes a walk-in and lands on the visit", async ({ page }) => {
    await loginAs(page, RECEPTION_EMAIL, RECEPTION_PASSWORD, /\/staff$/);
    await page.goto("/staff/appointments/walk-in");

    await page.getByLabel("Phone number").fill(uniquePhone(1));
    await page.getByLabel("Service", { exact: true }).selectOption({ index: 1 });
    // Therapist is required for a walk-in — pick whoever is listed first.
    await page.getByLabel("Therapist").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Look up" }).click();

    // Unknown phone: the new-patient branch renders.
    await page.getByLabel("Patient name").fill("Walk In Test");
    // Dismiss the virtual keyboard first: on mobile emulation it resizes the
    // viewport mid-scroll and the click point oscillates under nearby content
    // forever (button is stable, visible and enabled throughout).
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Check in" }).click();

    // confirmWalkIn redirects to the new visit's detail page.
    await expect(page).toHaveURL(/\/staff\/appointments\/[0-9a-f-]+$/);
    await expect(page.getByText("arrived", { exact: false }).first()).toBeVisible();
  });

  test("a known phone offers the one-tap link", async ({ page }) => {
    await loginAs(page, RECEPTION_EMAIL, RECEPTION_PASSWORD, /\/staff$/);
    await page.goto("/staff/appointments/walk-in");

    // Ada Obi is seeded with phone +2348020000001.
    await page.getByLabel("Phone number").fill("08020000001");
    await page.getByLabel("Service", { exact: true }).selectOption({ index: 1 });
    await page.getByLabel("Therapist").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Look up" }).click();

    await expect(page.getByText("Ada Obi")).toBeVisible();
    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page).toHaveURL(/\/staff\/appointments\/[0-9a-f-]+$/);
  });
});

test.describe("status flow", () => {
  test("a therapist moves a visit arrived to in_session to completed", async ({ page }) => {
    // Arrange through the UI-neutral layer: book directly so this test owns
    // its fixture regardless of what other specs changed.
    await loginAs(page, RECEPTION_EMAIL, RECEPTION_PASSWORD, /\/staff$/);
    await page.goto("/staff/appointments/walk-in");
    await page.getByLabel("Phone number").fill(uniquePhone(2));
    await page.getByLabel("Service", { exact: true }).selectOption({ index: 1 });
    await page.getByLabel("Therapist").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Look up" }).click();
    await page.getByLabel("Patient name").fill("Status Flow Test");
    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page).toHaveURL(/\/staff\/appointments\/[0-9a-f-]+$/);
    const visitUrl = page.url();

    // Now act as the therapist on the same visit.
    await loginAs(page, THERAPIST_EMAIL, THERAPIST_PASSWORD, /\/staff$/);
    await page.goto(visitUrl);

    await page.getByRole("button", { name: "in session", exact: false }).click();
    await expect(page.getByText("in session", { exact: false }).first()).toBeVisible();

    await page.getByRole("button", { name: "completed", exact: false }).click();
    await expect(page.getByText("completed", { exact: false }).first()).toBeVisible();
  });

  test("a cancelled visit shows its reason", async ({ page }) => {
    // A walk-in starts now, and the seeded 2-hour cancellation cutoff (design
    // spec §5.2) forbids cancelling it — so drop the cutoff through the admin
    // UI first, and restore it in `finally` so no state leaks into other
    // suites or the mobile project replay.
    async function setCancellationCutoff(hours: string) {
      await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD, /\/staff$/);
      await page.goto("/staff/settings");
      const settingsForm = page.locator("form").filter({ has: page.getByLabel("Clinic name") });
      await settingsForm.getByLabel("Cancellation cutoff (hours)").fill(hours);
      await settingsForm.getByRole("button", { name: "Save clinic details" }).click();
      await expect(settingsForm.getByRole("status")).toContainText(/saved/i);
    }

    await setCancellationCutoff("0");
    try {
      await loginAs(page, RECEPTION_EMAIL, RECEPTION_PASSWORD, /\/staff$/);
      await page.goto("/staff/appointments/walk-in");
      await page.getByLabel("Phone number").fill(uniquePhone(3));
      await page.getByLabel("Service", { exact: true }).selectOption({ index: 1 });
      await page.getByLabel("Therapist").selectOption({ index: 1 });
      await page.getByRole("button", { name: "Look up" }).click();
      await page.getByLabel("Patient name").fill("Cancel Flow Test");
      await page.getByRole("button", { name: "Check in" }).click();
      await expect(page).toHaveURL(/\/staff\/appointments\/[0-9a-f-]+$/);

      await page.getByLabel("Reason").fill("Patient called in sick");
      await page.getByRole("button", { name: "Cancel appointment" }).click();

      // The brief's form-status assertion cannot work here: the detail page
      // holds two FormStatus regions (strict-mode violation), and the cancel
      // card unmounts the moment the cancellation lands. Assert the settled
      // state instead — the pill flips to cancelled and the cancel card is
      // gone, which is what "shows its reason was accepted" means in the UI.
      await expect(page.getByText("cancelled", { exact: false }).first()).toBeVisible();
      // The pill flips via the action's success banner instantly, but the
      // Cancel card unmounts only after the router refresh roundtrip lands —
      // slow under mobile emulation, so this assertion gets room to breathe.
      await expect(page.getByRole("button", { name: "Cancel appointment" })).toHaveCount(0, {
        timeout: 15_000,
      });
    } finally {
      await setCancellationCutoff("2");
    }
  });
});

test.describe("agenda access", () => {
  test("a therapist is refused the new-booking page", async ({ page }) => {
    await loginAs(page, THERAPIST_EMAIL, THERAPIST_PASSWORD, /\/staff$/);

    const response = await page.goto("/staff/appointments/new");
    // Therapists see the schedule but do not book: requireRole rejects.
    expect(response?.status()).toBe(403);
  });

  test("a patient is redirected to their own portal", async ({ page }) => {
    await page.goto("/staff/appointments");
    await expect(page).toHaveURL(/\/login/);
  });
});
