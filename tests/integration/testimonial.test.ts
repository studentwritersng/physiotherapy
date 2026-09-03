import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, truncateAll } from "../helpers/db";
import {
  createTestimonial,
  deleteTestimonial,
  listPublishedTestimonials,
  listTestimonials,
  reorderTestimonials,
  setTestimonialPublished,
  updateTestimonial,
} from "@/server/services/testimonial";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("testimonials", () => {
  it("creates one, unpublished by default", async () => {
    await createTestimonial({ patientName: "Ada O.", content: "Walking again.", published: false });

    const all = await listTestimonials();
    expect(all).toHaveLength(1);
    expect(all[0]!.published).toBe(false);
  });

  it("excludes unpublished ones from the published list", async () => {
    await createTestimonial({ patientName: "Ada O.", content: "Walking again.", published: false });
    await createTestimonial({ patientName: "Emeka N.", content: "Back pain gone.", published: true });

    expect(await listTestimonials()).toHaveLength(2);

    const published = await listPublishedTestimonials();
    expect(published).toHaveLength(1);
    expect(published[0]!.patientName).toBe("Emeka N.");
  });

  it("toggles published state", async () => {
    await createTestimonial({ patientName: "Ada O.", content: "Walking again.", published: false });
    const [row] = await listTestimonials();

    await setTestimonialPublished(row!.id, true);
    expect(await listPublishedTestimonials()).toHaveLength(1);

    await setTestimonialPublished(row!.id, false);
    expect(await listPublishedTestimonials()).toHaveLength(0);
  });

  it("updates name and content", async () => {
    await createTestimonial({ patientName: "Ada O.", content: "Walking again.", published: true });
    const [row] = await listTestimonials();

    await updateTestimonial(row!.id, {
      patientName: "Ada Obi",
      content: "I am walking again.",
      published: true,
    });

    const [updated] = await listTestimonials();
    expect(updated!.patientName).toBe("Ada Obi");
    expect(updated!.content).toBe("I am walking again.");
  });

  it("deletes one", async () => {
    await createTestimonial({ patientName: "Ada O.", content: "Walking again.", published: true });
    const [row] = await listTestimonials();

    await deleteTestimonial(row!.id);

    expect(await listTestimonials()).toHaveLength(0);
  });

  it("orders both lists by sortOrder", async () => {
    await createTestimonial({ patientName: "First", content: "A", published: true });
    await createTestimonial({ patientName: "Second", content: "B", published: true });
    await createTestimonial({ patientName: "Third", content: "C", published: true });

    const rows = await listTestimonials();
    expect(rows.map((r) => r.patientName)).toEqual(["First", "Second", "Third"]);

    await reorderTestimonials([rows[2]!.id, rows[0]!.id, rows[1]!.id]);

    expect((await listTestimonials()).map((r) => r.patientName)).toEqual([
      "Third",
      "First",
      "Second",
    ]);
    expect((await listPublishedTestimonials()).map((r) => r.patientName)).toEqual([
      "Third",
      "First",
      "Second",
    ]);
  });
});