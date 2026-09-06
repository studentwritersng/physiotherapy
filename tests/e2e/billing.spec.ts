import { test, expect, type Page } from "@playwright/test";
import {
  armBillingInvoice,
  armBillingPayment,
  armPortalAccount,
  armStaffAccount,
  deletePortalAccount,
  disconnect,
} from "./helpers/db";

// 8+ characters with a number, per passwordSchema in src/lib/zod/auth.ts.
const STAFF_PASSWORD = "BillingE2E1";
const PATIENT_PASSWORD = "PortalE2E1";

const ADMIN_EMAIL = "admin@tetaphysio.ng";
const RECEPTION_EMAIL = "reception@tetaphysio.ng";

// Dedicated E2E phones (valid per phoneSchema: 080 + 8 digits). Never the
// seeded 08020000001/2, the portal suite's 08020000011–15, or the clinical
// suite's 08020000021–25 — each test arms and deletes its own rows.
const PHONE_CASH = "08020000031";
const PHONE_REVENUE = "08020000032";
const PHONE_HISTORY = "08020000033";
const PHONE_NOKEY = "08020000034";
const PHONE_BLOCKED = "08020000035";

/**
 * Every test arms the fixture it needs (linked patient, invoice, payment), so
 * no test depends on another having run first and the suite is repeatable
 * without db:reset between runs or between the chromium and mobile projects.
 * See tests/e2e/helpers/db.ts. Forged-id and webhook-replay cases are
 * deliberately absent here: they stay integration-covered
 * (billing-staff.test.ts, paystack-webhook.test.ts). Live Paystack is never
 * touched — no key exists in this repo, so Pay Now absence is asserted, never
 * a checkout.
 */
test.afterAll(async () => {
  await disconnect();
});

async function staffLogin(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email or phone number").fill(identifier);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    // 20s: this file's first test takes the cold-server hit, and the
    // full suite hammers the box — a loaded login navigation has exceeded
    // 15s with no product fault (passes warm in ~13s).
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 }),
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

test.describe("billing journeys", () => {
  test("receptionist records cash and the invoice flips to paid", async ({ page }) => {
    // Heavier than the other journeys: staff login plus the full record page
    // plus a server-action round-trip, all on a cold server for the file's
    // first test — hence above the 60s config budget.
    test.setTimeout(120_000);
    const { patientId } = await armPortalAccount({
      localPhone: PHONE_CASH,
      password: PATIENT_PASSWORD,
      name: "E2E Cash",
      email: "e2e-cash@example.com",
      linked: true,
    });
    if (!patientId) throw new Error("billing fixture was not linked");
    // Pre-armed invoice, so the journey is the fast path: fill the prefilled
    // amount, confirm, assert paid.
    await armBillingInvoice(patientId, "12000.00");
    await armStaffAccount(RECEPTION_EMAIL, STAFF_PASSWORD, false);

    try {
      await staffLogin(page, RECEPTION_EMAIL, STAFF_PASSWORD);
      await page.goto(`/staff/patients/${patientId}`);

      const section = page.locator("#billing");
      await expect(section.getByText("owes ₦12000.00")).toBeVisible();

      const started = Date.now();
      await section.getByLabel("Amount (₦)").fill("12000.00");
      await section.getByRole("button", { name: "Record payment" }).click();

      // 30s, not the 5s default: the action round-trips the service plus a
      // full record re-render, which runs long on this machine (the trace of
      // the first run caught the button still aria-busy at 10s on a cold
      // server). Asserted is the durable flip, not the transient
      // "Payment recorded" banner: that banner lives inside the per-invoice
      // form, which unmounts the moment revalidation reports the invoice
      // paid — waiting for it races the re-render by construction.
      await expect(section.getByText("paid · paid ₦12000.00 · owes ₦0.00")).toBeVisible({
        timeout: 30_000,
      });
      // The flip: status line goes paid with nothing left owing, and the
      // per-invoice form unmounts (it only renders while status !== paid).
      // The InvoiceForm's "Create invoice" stays — hence the exact name.
      await expect(section.getByRole("button", { name: "Record payment" })).toHaveCount(0);
      expect(Date.now() - started).toBeLessThan(60_000);
    } finally {
      await deletePortalAccount(PHONE_CASH);
    }
  });

  test("today's revenue groups payments by method", async ({ page }) => {
    const { patientId } = await armPortalAccount({
      localPhone: PHONE_REVENUE,
      password: PATIENT_PASSWORD,
      name: "E2E Revenue",
      email: "e2e-revenue@example.com",
      linked: true,
    });
    if (!patientId) throw new Error("billing fixture was not linked");
    const { invoiceId } = await armBillingInvoice(patientId, "9750.00");
    await armBillingPayment(invoiceId, "9750.00", "cash");
    // Admin, not receptionist: the seed leaves receptionistSeesRevenue off,
    // so only admins see the revenue card here.
    await armStaffAccount(ADMIN_EMAIL, STAFF_PASSWORD, false);

    try {
      await staffLogin(page, ADMIN_EMAIL, STAFF_PASSWORD);
      await page.goto("/staff/payments");

      const revenue = page.locator("section", {
        has: page.getByRole("heading", { name: "Today's revenue" }),
      });
      await expect(revenue).toBeVisible();
      const cashRow = revenue.getByRole("listitem").filter({ hasText: "cash" });
      await expect(cashRow).toBeVisible();
      // >=, not exact: the card sums every payment recorded today, so a
      // leftover from an interrupted run must not fail the journey — our
      // armed payment only needs to be included in the total.
      const rowText = (await cashRow.innerText()) ?? "";
      const match = rowText.match(/₦([\d,]+\.\d{2})/);
      const figure = match?.[1];
      if (!figure) throw new Error(`cash revenue row carries no figure: ${rowText}`);
      expect(Number(figure.replace(/,/g, ""))).toBeGreaterThanOrEqual(9750);

      // The same payment lands in the clinic-wide history with its owner.
      const history = page.locator("section", {
        has: page.getByRole("heading", { name: "Payment history" }),
      });
      await expect(
        history.getByRole("listitem").filter({ hasText: "E2E Revenue" }),
      ).toContainText("₦9750.00");
    } finally {
      await deletePortalAccount(PHONE_REVENUE);
    }
  });

  test("portal payment history renders after a manual payment", async ({ page }) => {
    const { patientId } = await armPortalAccount({
      localPhone: PHONE_HISTORY,
      password: PATIENT_PASSWORD,
      name: "E2E History",
      email: "e2e-history@example.com",
      linked: true,
    });
    if (!patientId) throw new Error("billing fixture was not linked");
    // Partial on purpose: the invoice stays open (Due still renders) while
    // the history gains its row — both halves of the balance card in one go.
    const { invoiceId, invoiceNumber } = await armBillingInvoice(patientId, "10000.00");
    await armBillingPayment(invoiceId, "4000.00", "cash");

    try {
      await portalLogin(page, PHONE_HISTORY, PATIENT_PASSWORD);
      await expect(page).toHaveURL(/\/portal$/);

      await expect(page.getByRole("heading", { name: "Balance" })).toBeVisible();
      await expect(page.getByText("Due ₦6000.00")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Payment history" })).toBeVisible();
      // Narrows to the history row: the invoice row carries the number but no
      // 4000 figure, so only the payment row matches both filters.
      const historyRow = page
        .getByRole("listitem")
        .filter({ hasText: invoiceNumber })
        .filter({ hasText: "₦4000.00" });
      await expect(historyRow).toBeVisible();
      await expect(historyRow).toContainText("cash");
    } finally {
      await deletePortalAccount(PHONE_HISTORY);
    }
  });

  test("Pay Now is absent without a gateway key", async ({ page }) => {
    const { patientId } = await armPortalAccount({
      localPhone: PHONE_NOKEY,
      password: PATIENT_PASSWORD,
      name: "E2E No Key",
      email: "e2e-nokey@example.com",
      linked: true,
    });
    if (!patientId) throw new Error("billing fixture was not linked");
    const { invoiceNumber } = await armBillingInvoice(patientId, "8000.00");

    try {
      await portalLogin(page, PHONE_NOKEY, PATIENT_PASSWORD);
      await expect(page).toHaveURL(/\/portal$/);

      // No key exists in this repo or CI, so no button can render — and there
      // is never a dead Pay Now to click (the page gates on the key first).
      // Live Paystack is never touched here.
      await expect(page.getByRole("button", { name: "Pay Now" })).toHaveCount(0);
      // The manual content is intact: invoice number and amount due render.
      await expect(page.getByText(invoiceNumber).first()).toBeVisible();
      await expect(page.getByText("Due ₦8000.00")).toBeVisible();
    } finally {
      await deletePortalAccount(PHONE_NOKEY);
    }
  });

  test("a patient cannot reach the staff payments page", async ({ page }) => {
    await armPortalAccount({
      localPhone: PHONE_BLOCKED,
      password: PATIENT_PASSWORD,
      name: "E2E Blocked",
      email: "e2e-blocked@example.com",
      linked: true,
    });

    try {
      await portalLogin(page, PHONE_BLOCKED, PATIENT_PASSWORD);
      await expect(page).toHaveURL(/\/portal$/);

      // The staff layout sends patients to their own portal, not a 403.
      await page.goto("/staff/payments");
      await expect(page).toHaveURL(/\/portal/);
    } finally {
      await deletePortalAccount(PHONE_BLOCKED);
    }
  });

  test("the sidebar Payments entry opens the billing page, not a soon badge", async ({
    page,
  }) => {
    const { patientId } = await armPortalAccount({
      localPhone: "08020000036",
      password: PATIENT_PASSWORD,
      name: "E2E Sidebar",
      email: "e2e-sidebar@example.com",
      linked: true,
    });
    if (!patientId) throw new Error("billing fixture was not linked");
    const { invoiceNumber } = await armBillingInvoice(patientId, "5000.00");

    try {
      await portalLogin(page, "08020000036", PATIENT_PASSWORD);
      await expect(page).toHaveURL(/\/portal$/);

      // Below 1180px the sidebar is an off-canvas drawer — open it first.
      // (No-op on desktop, where the toggle is hidden.)
      const drawerToggle = page.getByRole("button", { name: "Open menu" });
      if ((await drawerToggle.count()) > 0) await drawerToggle.click();
      // The entry itself must be a plain link to the billing page — no soon
      // badge. Tapping through the animated drawer flakes on mobile emulation
      // (empty-URL race, unrelated to product behavior), so navigation goes
      // direct after the entry is pinned.
      const sidebar = page.getByRole("navigation", { name: "Main navigation" });
      const paymentsLink = sidebar.getByRole("link", { name: "Payments" });
      await expect(paymentsLink).toBeVisible();
      await expect(paymentsLink).toHaveAttribute("href", "/portal/payments");
      await expect(paymentsLink.getByText("soon")).toHaveCount(0);
      await page.goto("/portal/payments");
      await expect(page).toHaveURL(/\/portal\/payments$/);
      await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
      await expect(page.getByText(invoiceNumber).first()).toBeVisible();
      await expect(page.getByText("Due ₦5000.00")).toBeVisible();
    } finally {
      await deletePortalAccount("08020000036");
    }
  });
});
