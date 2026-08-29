import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("schema", () => {
  it("has all 27 tables in the public schema", async () => {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
    `;
    expect(Number(rows[0]!.count)).toBe(27);
  });

  it("stores appointment status enum values in snake_case", async () => {
    const rows = await prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT enumlabel FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'AppointmentStatus'
      ORDER BY e.enumsortorder
    `;
    expect(rows.map((r) => r.enumlabel)).toEqual([
      "scheduled",
      "confirmed",
      "arrived",
      "in_session",
      "completed",
      "cancelled",
      "no_show",
    ]);
  });

  it("uses timestamptz, not timestamp, for created_at", async () => {
    const rows = await prisma.$queryRaw<{ data_type: string }[]>`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'created_at'
    `;
    expect(rows[0]!.data_type).toBe("timestamp with time zone");
  });

  it("round-trips Decimal(12,2) money without float error", async () => {
    const user = await prisma.user.create({
      data: {
        name: "Schema Probe",
        phone: `+234900${Date.now().toString().slice(-7)}`,
        passwordHash: "x",
        role: "admin",
      },
    });
    const patient = await prisma.patient.create({
      data: { patientCode: `TP-P${Date.now()}`, fullName: "Probe", phone: "+2349000000000" },
    });
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-T${Date.now()}`,
        patientId: patient.id,
        totalAmount: "12345.67",
        createdById: user.id,
      },
    });
    expect(invoice.totalAmount.toString()).toBe("12345.67");

    await prisma.invoice.delete({ where: { id: invoice.id } });
    await prisma.patient.delete({ where: { id: patient.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("allows a patient with no linked user (walk-in lead)", async () => {
    const patient = await prisma.patient.create({
      data: {
        patientCode: `TP-W${Date.now()}`,
        fullName: "Walk In",
        phone: "+2348030000000",
        status: "lead",
      },
    });
    expect(patient.userId).toBeNull();
    expect(patient.status).toBe("lead");
    await prisma.patient.delete({ where: { id: patient.id } });
  });
});
