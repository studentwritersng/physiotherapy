import { describe, it, expect } from "vitest";
import { parseEnv } from "@/lib/env";

const valid = {
  DATABASE_URL: "postgresql://postgres@localhost:5435/teta_physio_dev",
  SESSION_COOKIE_NAME: "tp_session",
  APP_URL: "http://localhost:3000",
  NODE_ENV: "test",
  SEED_ADMIN_PASSWORD: "changeme1",
  SEED_STAFF_PASSWORD: "changeme1",
  SEED_PATIENT_PASSWORD: "changeme1",
};

describe("parseEnv", () => {
  it("accepts a valid environment", () => {
    const env = parseEnv(valid);
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.SESSION_COOKIE_NAME).toBe("tp_session");
  });

  it("defaults SESSION_COOKIE_NAME when absent", () => {
    const { SESSION_COOKIE_NAME: _omitted, ...rest } = valid;
    expect(parseEnv(rest).SESSION_COOKIE_NAME).toBe("tp_session");
  });

  it("throws when DATABASE_URL is missing", () => {
    const { DATABASE_URL: _omitted, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("throws when DATABASE_URL is not a postgres URL", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://localhost/x" })).toThrow();
  });

  it("throws when a seed password is shorter than 8 characters", () => {
    expect(() => parseEnv({ ...valid, SEED_ADMIN_PASSWORD: "short" })).toThrow();
  });
});
