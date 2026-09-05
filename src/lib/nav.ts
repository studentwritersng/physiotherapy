import type { UserRole } from "@/generated/prisma/client";

export type NavLink = {
  href: string;
  label: string;
  /** False until the sub-project that builds the destination has shipped. */
  available: boolean;
  note?: string;
};

/**
 * Mirrors the PRD-01 permission matrix. This is navigation only — it is not a
 * security boundary. Hiding a link does not protect the route; requireRole does
 * (spec §5.3).
 */
export function staffLinksFor(role: UserRole): NavLink[] {
  if (role === "patient") return [];

  const dashboard: NavLink = { href: "/staff", label: "Dashboard", available: true };

  const therapist: NavLink[] = [
    { href: "/staff/appointments", label: "My schedule", available: true },
    { href: "/staff/patients", label: "My patients", available: false, note: "Sub-project 6" },
    { href: "/staff/portal-links", label: "Portal links", available: true },
  ];

  const reception: NavLink[] = [
    { href: "/staff/appointments", label: "Appointments", available: true },
    { href: "/staff/patients", label: "Patients", available: false, note: "Sub-project 10" },
    { href: "/staff/payments", label: "Payments", available: false, note: "Sub-project 7" },
    { href: "/staff/portal-links", label: "Portal links", available: true },
  ];

  const adminOnly: NavLink[] = [
    { href: "/staff/staff", label: "Staff", available: false, note: "Sub-project 10" },
    { href: "/staff/reports", label: "Reports", available: false, note: "Sub-project 9" },
    { href: "/staff/settings", label: "Clinic settings", available: true },
  ];

  switch (role) {
    case "therapist":
      return [dashboard, ...therapist];
    case "receptionist":
      return [dashboard, ...reception];
    case "admin":
      return [dashboard, ...reception, ...adminOnly];
  }
}

export function portalLinks(): NavLink[] {
  return [
    { href: "/portal", label: "Dashboard", available: true },
    {
      href: "/portal/appointments",
      label: "Appointments",
      available: true,
    },
    { href: "/portal/profile", label: "My profile", available: true },
    { href: "/portal/intake", label: "Intake form", available: true },
    { href: "/portal/payments", label: "Payments", available: false, note: "Sub-project 7" },
  ];
}
