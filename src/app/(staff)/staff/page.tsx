import { requireRole } from "@/server/auth/rbac";

export const metadata = { title: "Dashboard — TetaPhysio" };

export default async function StaffDashboardPage() {
  // Redundant with the layout guard by design: a route must not depend on a
  // layout for its authorization.
  const user = await requireRole("admin", "therapist", "receptionist");

  return (
    <section>
      <h1 className="text-2xl font-semibold text-gray-900">Welcome, {user.name}</h1>
      <p className="mt-2 max-w-prose text-gray-700">
        Signed in as <strong>{user.role}</strong>. The operational screens arrive with their
        sub-projects — appointments and the calendar in sub-project 3, clinical documentation in
        sub-project 6, billing in sub-project 7.
      </p>
    </section>
  );
}
