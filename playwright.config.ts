import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Serial: every test shares one seeded database, so parallel runs would race.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // 60s, not the 30s default: on a memory-constrained machine the argon2id
  // password hashes (19MB each, several per login flow), Chromium, and next
  // start compete for RAM, and cold-boot tests otherwise time out without any
  // product assertion failing. This changes no assertion, only the budget.
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // The primary target is a mid-range Android phone (PRD-04 FR4).
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npx next start -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
