import "dotenv/config";

// Prisma 7 does not load .env itself. Without this import, every Prisma call in a
// test fails with an opaque PrismaClientKnownRequestError instead of a missing-URL error.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
