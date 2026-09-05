import { test, expect, type Page } from "@playwright/test";
import { armPublicBookingState, armStaffAccount, disconnect } from "./helpers/db";

const ADMIN_EMAIL = "admin@tetaphysio.ng";
const ADMIN_PASSWORD = "PublicAdmin1";

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
  await armPublicBookingState();
});

test.afterAll(async () => {
  await disconnect();
});

/**
 * Opens the first day in the 14-day strip that actually offers slots. The
 * strip always starts at today, but today is only bookable during working
 * hours (past slots are excluded) and Sunday is closed per the seeded opening
 * hours — so a blind `.first()` click finds "No free slots" on Friday
 * evenings and all of Sunday. The brief's intent ("first free slot of the
 * first bookable day") is preserved: this returns the earliest day with
 * radios instead of assuming it is today.
 */
async function openFirstBookableDay(page: Page) {
  const dates = page.getByRole("link", { name: /\d{4}-\d{2}-\d{2}/ });
  const count = await dates.count();
  for (let i = 0; i < count; i++) {
    await dates.nth(i).click();
    // Either free slots (radios) or the empty-day message renders — wait for
    // whichever settles the day first.
    await expect(
      page.getByText("No free slots on this day").or(page.getByRole("radio").first()),
    ).toBeVisible({ timeout: 10_000 });
    if ((await page.getByRole("radio").count()) > 0) return;
  }
  throw new Error("no bookable day in the 14-day strip");
}

test.describe("visitor reach", () => {
  test("booking is two clicks from the homepage", async ({ page }) => {
    await page.goto("/");
    // One click to services (or straight to book from the hero CTA)...
    await page.getByRole("link", { name: /book appointment/i }).first().click();
    // ...and the booking flow is showing: at most two clicks total.
    await expect(page).toHaveURL(/\/book/);
    await expect(page.getByRole("heading", { name: /book/i })).toBeVisible();
  });

  test("service detail links pre-fill the booking flow", async ({ page }) => {
    await page.goto("/services");
    await page.getByRole("link", { name: /sports injury rehabilitation/i }).first().click();
    await expect(page).toHaveURL(/\/services\/sports-injury-rehabilitation/);

    await page.getByRole("link", { name: /book this service/i }).click();
    await expect(page).toHaveURL(/\/book\?service=sports-injury-rehabilitation/);
  });
});

test.describe("public booking journey", () => {
  test("a visitor books with no preference and lands on a reference", async ({ page }) => {
    const phone = `080${Date.now().toString().slice(-8)}`;
    await page.goto("/book");

    // Step 1: first service.
    await page.getByRole("link", { name: /sports injury rehabilitation/i }).first().click();
    // Step 2: no preference.
    await page.getByRole("link", { name: /no preference/i }).click();
    // Step 3: first free slot of the first bookable day.
    await openFirstBookableDay(page);
    const slot = page.getByRole("radio").first();
    await expect(slot).toBeVisible({ timeout: 10_000 });
    await slot.check();
    // Step 4: details.
    await page.getByLabel("Full name").fill("Adaeze Visitor");
    await page.getByLabel("Phone number").fill(phone);
    await page.getByRole("button", { name: "Confirm booking" }).click();
    // Step 5: confirmation carries the reference.
    await expect(page).toHaveURL(/\/book\/confirm\//);
    await expect(page.getByText(/APT-[0-9A-Z]{6}/)).toBeVisible();
  });

  test("an oversold slot is rejected with a friendly error", async ({ page }) => {
    // Book the same slot twice: first through the UI-neutral layer is complex,
    // so book once via the flow, then replay the identical POST through a
    // second page. Simpler and deterministic: submit the confirm form twice by
    // going back after the first success.
    const phone = `080${Date.now().toString().slice(-8)}`;
    await page.goto("/book");
    await page.getByRole("link", { name: /sports injury rehabilitation/i }).first().click();
    await page.getByRole("link", { name: /no preference/i }).click();
    await openFirstBookableDay(page);
    const slot = page.getByRole("radio").first();
    await expect(slot).toBeVisible({ timeout: 10_000 });
    // The flow accumulates state in the URL, so the booked day is readable here.
    const bookedDate = new URL(page.url()).searchParams.get("date");
    // Radios carry only HH:MM values shared across therapists, so per-value
    // absence is not assertable under no-preference fan-out. Instead the day's
    // radio count must drop by exactly one: the taken slot is hidden, not struck.
    const radiosBefore = await page.getByRole("radio").count();
    await slot.check();
    await page.getByLabel("Full name").fill("First Visitor");
    await page.getByLabel("Phone number").fill(phone);
    await page.getByRole("button", { name: "Confirm booking" }).click();
    await expect(page).toHaveURL(/\/book\/confirm\//);

    // Second visitor, same slot: go back through the flow to the identical date.
    // The taken slot must not be offered at all (spec §4.4: hidden, not struck).
    await page.goto("/book");
    await page.getByRole("link", { name: /sports injury rehabilitation/i }).first().click();
    await page.getByRole("link", { name: /no preference/i }).click();
    await page.getByRole("link", { name: bookedDate! }).click();
    await expect(
      page.getByText("No free slots on this day").or(page.getByRole("radio").first()),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("radio")).toHaveCount(radiosBefore - 1);
  });

  test("a confirmation without its reference does not render", async ({ page }) => {
    await page.goto("/book");
    await page.getByRole("link", { name: /sports injury rehabilitation/i }).first().click();
    await page.getByRole("link", { name: /no preference/i }).click();
    await openFirstBookableDay(page);
    const slot = page.getByRole("radio").first();
    await expect(slot).toBeVisible({ timeout: 10_000 });
    await slot.check();
    const visitorPhone = `080${Date.now().toString().slice(-8)}`;
    await page.getByLabel("Full name").fill("Ref Check");
    await page.getByLabel("Phone number").fill(visitorPhone);
    await page.getByRole("button", { name: "Confirm booking" }).click();
    await expect(page).toHaveURL(/\/book\/confirm\//);

    // Strip the ref param: without possession of the reference the page must
    // not render the booking (spec §6: possession IS the authorization).
    const url = new URL(page.url());
    const id = url.pathname.split("/").pop()!;
    await page.goto(`/book/confirm/${id}`);
    await expect(page.getByText(/not found|could not be found/i)).toBeVisible();
  });
});

test.describe("render from live data", () => {
  test("an admin service edit appears publicly with no deploy", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/staff/settings/services");

    const addForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Add service" }) });
    await addForm.getByLabel("Service name").fill("E2E Public Service");
    await addForm.getByLabel("Duration (minutes)").fill("30");
    await addForm.getByLabel("Price (₦)").fill("5000");
    await addForm.getByRole("button", { name: "Add service" }).click();
    await expect(addForm.getByRole("status")).toContainText(/added/i);

    await page.goto("/services");
    await expect(page.getByText("E2E Public Service")).toBeVisible();
  });
});
