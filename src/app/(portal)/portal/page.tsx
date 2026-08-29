import { requireRole } from "@/server/auth/rbac";

export const metadata = { title: "My dashboard — TetaPhysio" };

export default async function PortalDashboardPage() {
  const user = await requireRole("patient");

  return (
    <section>
      <h1 className="text-2xl font-semibold text-gray-900">Hello, {user.name}</h1>
      <p className="mt-2 max-w-prose text-gray-700">
        Your appointments, treatment information and payments appear here once those sections are
        built (sub-projects 5 and 7).
      </p>
    </section>
  );
}
