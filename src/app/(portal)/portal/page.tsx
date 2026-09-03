import { requireRole } from "@/server/auth/rbac";

export const metadata = { title: "My dashboard — TetaPhysio" };

export default async function PortalDashboardPage() {
  const user = await requireRole("patient");

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
          Hello, <span className="italic text-jade-text">{user.name}.</span>
        </h1>
        <p className="mt-2 max-w-prose text-sm text-ivory-dim">
          Your appointments, treatment information and payments appear here once those sections are
          built (sub-projects 5 and 7).
        </p>
      </header>
    </section>
  );
}
