import Link from "next/link";
import { requirePageRole } from "@/server/auth/page-guard";
import { getClinicSettings } from "@/server/services/clinic-settings";
import { requireLinkedPatientId } from "@/server/services/portal";
import { getLatestIntake } from "@/server/services/intake";
import { portalSubmitIntake } from "./actions";
import { IntakeForm } from "./IntakeForm";

export const metadata = { title: "Intake form — TetaPhysio" };

export default async function PortalIntakePage() {
  const user = await requirePageRole("patient");
  const patientId = await requireLinkedPatientId(user.id);

  if (!patientId) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <div className="rounded-lg border border-line bg-surface p-6">
          <h1 className="font-display text-2xl font-medium text-ivory">Intake form</h1>
          <p className="mt-2 text-sm text-ivory-dim">
            Your online account is not linked to a patient record yet, so there is no form to
            fill in. Linking usually happens at your next visit.
          </p>
        </div>
      </section>
    );
  }

  const [latest, settings] = await Promise.all([
    getLatestIntake(patientId),
    getClinicSettings(),
  ]);

  // PRD-12 §4 in one plain-language sentence: what is collected, why, and
  // that it is used to provide treatment and communicate with the patient.
  const consentText =
    `I agree that ${settings.clinicName} may collect and keep the health ` +
    `information I provide in this form, and use it to provide my treatment ` +
    `and communicate with me about my care.`;

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="font-display mt-1 text-3xl font-medium text-ivory">Intake form</h1>
        <p className="mt-1 text-sm text-ivory-dim">
          Tell us about your condition before your visit so your therapist can prepare.
        </p>
      </header>

      <div className="rounded-lg border border-line bg-surface p-6">
        {latest?.submittedAt && (
          <p className="mb-4 rounded-md bg-jade-dim px-3 py-2 text-sm font-medium text-jade-text">
            You already submitted this form — saving again updates your answers.{" "}
            <Link
              href="/portal"
              className="cursor-pointer underline hover:opacity-80"
            >
              Back to dashboard
            </Link>
          </p>
        )}
        <IntakeForm action={portalSubmitIntake} initial={latest} consentText={consentText} />
      </div>
    </section>
  );
}
