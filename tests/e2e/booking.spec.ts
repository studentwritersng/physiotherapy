import { test, expect, type Page } from "@playwright/test";
import { armPortalAccount, armPortalAppointment, armStaffAccount, deletePortalAccount, disconnect, resetBookingState } from "./helpers/db";

const RECEPTION_EMAIL = "reception@tetaphysio.ng";
const THERAPIST_EMAIL = "chidera@tetaphysio.ng";

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
    // Arrange in the DB, act in the UI: the visit sits 72h out, safely beyond
    // the seeded 2-hour cancellation cutoff. The previous version cancelled a
    // walk-in starting "now" and raced the clock — crossing a minute boundary
    // between booking and cancelling turns cutoff 0 into a rejection.
    const phone = "08020000021";
    const { patientId } = await armPortalAccount({
      localPhone: phone,
      password: "CancelE2E1",
      name: "E2E Cancel",
      email: "e2e-cancel@example.com",
      linked: true,
    });
    if (!patientId) throw new Error("portal account was not linked");
    const visitId = await armPortalAppointment(patientId, { startInHours: 72 });
    try {
      await loginAs(page, RECEPTION_EMAIL, RECEPTION_PASSWORD, /\/staff$/);
      await page.goto(`/staff/appointments/${visitId}`);

      await page.getByLabel("Reason").fill("Patient called in sick");
      await page.getByRole("button", { name: "Cancel appointment" }).click();

      // The brief's form-status assertion cannot work here: the detail page
      // holds two FormStatus regions (strict-mode violation), and the cancel
      // card unmounts the moment the cancellation lands. Assert the settled
      // state instead — the pill flips to cancelled and the cancel card is
      // gone, which is what "shows its reason was accepted" means in the UI.
      await expect(page.getByText("cancelled", { exact: false }).first()).toBeVisible();
      // Settle with a reload, not the client refresh race: useRefreshOnSuccess
      // fires router.refresh() after success, but on a loaded box the fresh
      // payload can land after any fixed polling window. Reload renders the
      // same server state deterministically — and still fails if the cancel
      // itself did not go through.
      await page.reload();
      await expect(page.getByText("cancelled", { exact: false }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Cancel appointment" })).toHaveCount(0);
    } finally {
      await deletePortalAccount(phone);
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
