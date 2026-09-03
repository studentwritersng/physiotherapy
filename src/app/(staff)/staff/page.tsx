import { requireRole } from "@/server/auth/rbac";

export const metadata = { title: "Dashboard — TetaPhysio" };

export default async function StaffDashboardPage() {
  // Redundant with the layout guard by design: a route must not depend on a
  // layout for its authorization.
  const user = await requireRole("admin", "therapist", "receptionist");

  return (
    <section className="flex flex-col gap-6">
      <header>
        <p className="text-xs uppercase tracking-[0.16em] text-gold-text">
          {new Date().toLocaleDateString("en-NG", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "Africa/Lagos",
          })}
        </p>
        <h1 className="font-display mt-1 text-3xl font-medium text-ivory">
          Good to see you — <span className="italic text-jade-text">{user.name}.</span>
        </h1>
        <p className="mt-2 max-w-prose text-sm text-ivory-dim">
          Signed in as <strong>{user.role}</strong>. The operational screens arrive with their
          sub-projects — appointments and the calendar in sub-project 3, clinical documentation in
          sub-project 6, billing in sub-project 7.
        </p>
      </header>
    </section>
  );
}
