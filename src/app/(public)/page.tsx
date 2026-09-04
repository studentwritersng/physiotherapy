import { getClinicSettings } from "@/server/services/clinic-settings";

export const metadata = { title: "TetaPhysio — Physiotherapy in Lagos" };

export default async function PublicHomePage() {
  const settings = await getClinicSettings();
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <h1 className="font-display text-2xl font-semibold text-ivory">{settings.clinicName}</h1>
      <p className="mt-2 text-ivory-dim">The full homepage lands in Task 2.</p>
    </main>
  );
}
