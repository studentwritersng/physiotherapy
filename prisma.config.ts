import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * `prisma generate` does not touch the database — it only reads the schema. But
 * this config module is loaded for EVERY prisma command, so throwing here on a
 * missing URL breaks `generate` too. That is what failed the Vercel build:
 * `npm run build` runs `prisma generate` during install/build, before any
 * database env var is necessarily present.
 *
 * So resolve the URL if it is there and leave it empty otherwise. Commands that
 * genuinely need a connection (`migrate deploy`, `db seed`) fail on their own
 * with a clear Prisma error; commands that do not are unaffected.
 *
 * DIRECT_URL is preferred because Neon's pooled endpoint cannot run migrations:
 * PgBouncer's transaction mode does not support the advisory locks and prepared
 * statements `prisma migrate` relies on.
 */
const migrationUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: migrationUrl,
  },
});
