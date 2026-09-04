import { requirePageRole } from "@/server/auth/page-guard";

export default async function AppointmentsLayout({ children }: { children: React.ReactNode }) {
  await requirePageRole("admin", "therapist", "receptionist");
  return <>{children}</>;
}
