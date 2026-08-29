import { redirect } from "next/navigation";
import { NavShell } from "@/components/NavShell";
import { getCurrentUser } from "@/server/auth/rbac";
import { staffLinksFor } from "@/lib/nav";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) redirect("/login");
  // A patient reaching a staff route is sent to their own portal, not shown a 403.
  if (user.role === "patient") redirect("/portal");
  // Forced change before anything else renders (PRD-01 §3.2).
  if (user.mustResetPassword) redirect("/reset-password");

  return (
    <NavShell user={user} links={staffLinksFor(user.role)}>
      {children}
    </NavShell>
  );
}
