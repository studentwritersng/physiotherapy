import { Card } from "@/components/Card";
import { requireRole } from "@/server/auth/rbac";
import { getClinicSettings } from "@/server/services/clinic-settings";
import { saveOpeningHours, saveSettings } from "./actions";
import { OpeningHoursEditor } from "./OpeningHoursEditor";
import { SettingsForm } from "./SettingsForm";

export const metadata = { title: "Clinic settings — TetaPhysio" };

export default async function ClinicSettingsPage() {
  await requireRole("admin");

  const settings = await getClinicSettings();

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="Clinic details"
        description="Shown on the public website and in patient messages."
      >
        <SettingsForm settings={settings} action={saveSettings} />
      </Card>

      <Card
        title="Opening hours"
        description="The booking engine offers no slot outside these hours, whatever a therapist's availability says."
      >
        <OpeningHoursEditor openingHours={settings.openingHours} action={saveOpeningHours} />
      </Card>
    </div>
  );
}