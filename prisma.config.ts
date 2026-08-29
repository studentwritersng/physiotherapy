import "dotenv/config";
import { defineConfig } from "prisma/config";

// Plain process.env rather than Prisma's env() helper: env() throws when a
// variable is absent, and DIRECT_URL only exists in production (Neon needs a
// non-pooled connection for migrations). Locally there is just DATABASE_URL.
const migrationUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!migrationUrl) {
  throw new Error("Set DATABASE_URL (and DIRECT_URL in production) before running Prisma.");
}

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
