import { redirect } from "next/navigation";
import { NavShell } from "@/components/NavShell";
import { getCurrentUser } from "@/server/auth/rbac";
import { portalLinks } from "@/lib/nav";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) redirect("/portal/login");
  if (user.role !== "patient") redirect("/staff");
  if (user.mustResetPassword) redirect("/reset-password");

  return (
    <NavShell user={user} links={portalLinks()}>
      {children}
    </NavShell>
  );
}
