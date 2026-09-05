import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import { approvePortalLink, listUnlinkedPortalUsers } from "@/server/services/portal-links";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("portal linking", () => {
  it("lists unlinked logins with same-phone candidates", async () => {
    const user = await testPrisma.user.create({
      data: {
        name: "Newbie",
        phone: "08030000011",
        email: "n@example.com",
        passwordHash: "x",
        role: "patient",
      },
    });
    await testPrisma.patient.create({
      data: { patientCode: "T-000101", fullName: "Newbie", phone: "08030000011", status: "lead" },
    });
    const rows = await listUnlinkedPortalUsers();
    expect(rows.map((r) => r.id)).toContain(user.id);
    expect(rows.find((r) => r.id === user.id)!.candidates).toHaveLength(1);
  });

  it("links once and refuses a second link", async () => {
    const user = await testPrisma.user.create({
      data: {
        name: "Newbie",
        phone: "08030000012",
        email: "n@example.com",
        passwordHash: "x",
        role: "patient",
      },
    });
    const patient = await testPrisma.patient.create({
      data: { patientCode: "T-000102", fullName: "Newbie", phone: "08030000012", status: "lead" },
    });
    await approvePortalLink(user.id, patient.id);
    const linked = await testPrisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
    expect(linked.userId).toBe(user.id);
    expect(linked.status).toBe("registered");
    await expect(approvePortalLink(user.id, patient.id)).rejects.toThrow(/already linked/);
  });
});
