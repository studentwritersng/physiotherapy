import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import { checkRateLimit, recordFailedAttempt, clearAttempts } from "@/server/auth/rate-limit";
import { RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_SECONDS } from "@/lib/constants";

const ID = "+2348010000001";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("rate limiting", () => {
  it("allows a first attempt", async () => {
    expect(await checkRateLimit(ID)).toEqual({ allowed: true });
  });

  it("allows attempts up to the limit", async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS - 1; i++) {
      await recordFailedAttempt(ID, "127.0.0.1");
    }
    expect(await checkRateLimit(ID)).toEqual({ allowed: true });
  });

  it("blocks the attempt after the limit is reached", async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
      await recordFailedAttempt(ID, "127.0.0.1");
    }
    const result = await checkRateLimit(ID);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(RATE_LIMIT_WINDOW_SECONDS);
    }
  });

  it("scopes the limit per identifier", async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
      await recordFailedAttempt(ID, "127.0.0.1");
    }
    expect((await checkRateLimit(ID)).allowed).toBe(false);
    expect((await checkRateLimit("+2348029999999")).allowed).toBe(true);
  });

  it("ignores attempts older than the window", async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
      await recordFailedAttempt(ID, "127.0.0.1");
    }
    const past = new Date(Date.now() - (RATE_LIMIT_WINDOW_SECONDS + 60) * 1000);
    await testPrisma.loginAttempt.updateMany({ data: { attemptedAt: past } });

    expect((await checkRateLimit(ID)).allowed).toBe(true);
  });

  it("clears attempts on a successful login", async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
      await recordFailedAttempt(ID, "127.0.0.1");
    }
    expect((await checkRateLimit(ID)).allowed).toBe(false);

    await clearAttempts(ID);

    expect((await checkRateLimit(ID)).allowed).toBe(true);
  });

  it("normalises the identifier so casing cannot bypass the limit", async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
      await recordFailedAttempt("Staff@Example.com", "127.0.0.1");
    }
    expect((await checkRateLimit("staff@example.com")).allowed).toBe(false);
  });
});
