import type { Page } from "@playwright/test";

/**
 * Opens the sidebar drawer on viewports where it is off-canvas (≤1180px).
 * On desktop the hamburger is display:none, so this is a no-op there —
 * making it safe to call unconditionally before any sidebar interaction.
 */
export async function openNavForMobile(page: Page): Promise<void> {
  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) {
    await menu.click();
  }
}
