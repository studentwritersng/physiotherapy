import { requireRole } from "@/server/auth/rbac";

export default async function AppointmentsLayout({ children }: { children: React.ReactNode }) {
  await requireRole("admin", "therapist", "receptionist");
  return <>{children}</>;
}
