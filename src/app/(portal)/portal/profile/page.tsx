import { requirePageRole } from "@/server/auth/page-guard";
import { requireLinkedPatientId } from "@/server/services/portal";
import { getProfile } from "@/server/services/profile";
import { portalUpdateProfile } from "./actions";
import { ProfileForm, type ProfileInitial } from "./ProfileForm";

export const metadata = { title: "My profile — TetaPhysio" };

/** @db.Date row → YYYY-MM-DD for `<input type="date">`; "" when unset. */
function toDateInput(value: Date | null): string {
  if (!value) return "";
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

export default async function PortalProfilePage() {
  const user = await requirePageRole("patient");
  const patientId = await requireLinkedPatientId(user.id);

  if (!patientId) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <div className="rounded-lg border border-line bg-surface p-6">
          <h1 className="font-display text-2xl font-medium text-ivory">My profile</h1>
          <p className="mt-2 text-sm text-ivory-dim">
            Your online account is not linked to a patient record yet, so there is nothing to
            edit. Linking usually happens at your next visit.
          </p>
        </div>
      </section>
    );
  }

  const profile = await getProfile(patientId);

  if (!profile) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <div className="rounded-lg border border-line bg-surface p-6">
          <h1 className="font-display text-2xl font-medium text-ivory">My profile</h1>
          <p className="mt-2 text-sm text-ivory-dim">
            We could not find your patient record. Contact the clinic and we will sort it out.
          </p>
        </div>
      </section>
    );
  }

  const initial: ProfileInitial = {
    fullName: profile.fullName,
    phone: profile.phone,
    email: profile.email,
    dateOfBirth: toDateInput(profile.dateOfBirth),
    address: profile.address,
    emergencyContactName: profile.emergencyContactName,
    emergencyContactPhone: profile.emergencyContactPhone,
    basicMedicalInfo: profile.basicMedicalInfo,
  };

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="font-display mt-1 text-3xl font-medium text-ivory">My profile</h1>
        <p className="mt-1 text-sm text-ivory-dim">
          Keep your contact details up to date so the clinic can reach you.
        </p>
      </header>

      {/* Spec §6: rows predating required email carry null until the patient adds it. */}
      {!profile.email && (
        <div className="rounded-lg border border-gold/40 bg-gold-dim p-5">
          <h2 className="font-display text-lg font-medium text-ivory">Add your email address</h2>
          <p className="mt-1 text-sm text-ivory-dim">
            Add your email so the clinic can reach you with appointment updates and reminders.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-6">
        <ProfileForm action={portalUpdateProfile} initial={initial} />
      </div>
    </section>
  );
}
