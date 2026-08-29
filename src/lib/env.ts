import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z
    .string()
    .refine((v) => v.startsWith("postgresql://") || v.startsWith("postgres://"), {
      message: "DATABASE_URL must be a PostgreSQL connection string",
    }),
  DIRECT_URL: z.string().optional(),
  TEST_DATABASE_URL: z.string().optional(),
  SESSION_COOKIE_NAME: z.string().min(1).default("tp_session"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SEED_ADMIN_PASSWORD: z.string().min(8).default("changeme1"),
  SEED_STAFF_PASSWORD: z.string().min(8).default("changeme1"),
  SEED_PATIENT_PASSWORD: z.string().min(8).default("changeme1"),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${detail}`);
  }
  return Object.freeze(result.data);
}

export const env: Env = parseEnv(process.env);
