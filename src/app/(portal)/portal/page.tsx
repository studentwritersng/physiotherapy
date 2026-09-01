import { requireRole } from "@/server/auth/rbac";

export const metadata = { title: "My dashboard — TetaPhysio" };

export default async function PortalDashboardPage() {
  const user = await requireRole("patient");

  return (
    <section>
      <h1 className="font-display text-2xl font-semibold text-ivory">Hello, {user.name}</h1>
      <p className="mt-2 max-w-prose text-ivory-dim">
        Your appointments, treatment information and payments appear here once those sections are
        built (sub-projects 5 and 7).
      </p>
    </section>
  );
}
