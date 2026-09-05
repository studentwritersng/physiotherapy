import { describe, it, expect } from "vitest";
import { staffLinksFor, portalLinks } from "@/lib/nav";

describe("staff navigation", () => {
  it("gives a therapist schedule and patients but no staff or settings", () => {
    const labels = staffLinksFor("therapist").map((l) => l.label);
    expect(labels).toContain("My schedule");
    expect(labels).toContain("My patients");
    expect(labels).not.toContain("Staff");
    expect(labels).not.toContain("Clinic settings");
    expect(labels).not.toContain("Reports");
  });

  it("gives a receptionist appointments, patients and payments but no clinical notes", () => {
    const labels = staffLinksFor("receptionist").map((l) => l.label);
    expect(labels).toContain("Appointments");
    expect(labels).toContain("Patients");
    expect(labels).toContain("Payments");
    expect(labels).not.toContain("Clinical notes");
    expect(labels).not.toContain("Staff");
  });

  it("gives an admin everything", () => {
    const labels = staffLinksFor("admin").map((l) => l.label);
    for (const expected of [
      "Dashboard",
      "Appointments",
      "Patients",
      "Payments",
      "Staff",
      "Reports",
      "Clinic settings",
    ]) {
      expect(labels).toContain(expected);
    }
  });

  it("gives a patient role no staff navigation at all", () => {
    expect(staffLinksFor("patient")).toHaveLength(0);
  });

  it("marks links whose sub-project has not shipped as unavailable with a note", () => {
    const links = staffLinksFor("admin");
    const unavailable = links.filter((l) => !l.available);
    expect(unavailable.length).toBeGreaterThan(0);
    for (const link of unavailable) {
      expect(link.note).toBeTruthy();
    }
  });

  it("marks Appointments and My schedule available after sub-project 3", () => {
    const therapistLinks = staffLinksFor("therapist");
    expect(therapistLinks.find((l) => l.label === "My schedule")).toMatchObject({
      href: "/staff/appointments",
      available: true,
    });
    const receptionLinks = staffLinksFor("receptionist");
    expect(receptionLinks.find((l) => l.label === "Appointments")).toMatchObject({
      href: "/staff/appointments",
      available: true,
    });
  });

  it("gives the patient portal its five sections", () => {
    const labels = portalLinks().map((l) => l.label);
    expect(labels).toEqual(["Dashboard", "Appointments", "My profile", "Intake form", "Payments"]);
  });
});
