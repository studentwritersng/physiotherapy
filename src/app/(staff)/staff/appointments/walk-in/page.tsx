import { Card } from "@/components/Card";
import { FormField } from "@/components/FormField";
import { requireRole } from "@/server/auth/rbac";
import { listActiveServices } from "@/server/services/service-catalog";
import { listTherapists } from "@/server/services/availability";
import { findWalkInMatch } from "@/server/services/booking";
import { confirmWalkIn } from "./actions";
import { WalkInConfirm } from "./WalkInForm";

export const metadata = { title: "Walk-in — TetaPhysio" };

export default async function WalkInPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string; service?: string; therapist?: string }>;
}) {
  await requireRole("admin", "receptionist");
  const [{ phone, service, therapist }, services, therapists] = await Promise.all([
    searchParams,
    listActiveServices(),
    listTherapists(),
  ]);

  const match = phone ? await findWalkInMatch(phone) : null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ivory">Walk-in booking</h1>
        <p className="mt-1 text-sm text-ivory-dim">
          Phone first — matching patients are one tap, new ones take a name.
        </p>
      </header>

      <Card title="Find or start a record">
        <form method="get" className="grid gap-4 sm:grid-cols-2">
          <FormField label="Phone number" name="phone" type="tel" tabular defaultValue={phone ?? ""} />
          <div className="flex flex-col gap-1">
            <label htmlFor="wi-service" className="text-sm font-medium text-ivory">Service</label>
            <select id="wi-service" name="service" defaultValue={service ?? services[0]?.id ?? ""} className="min-h-11 cursor-pointer rounded-md border border-line bg-surface px-3 py-2 text-base text-ivory focus:outline-none focus:ring-3 focus:ring-jade">
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="wi-therapist" className="text-sm font-medium text-ivory">Therapist</label>
            <select id="wi-therapist" name="therapist" defaultValue={therapist ?? ""} className="min-h-11 cursor-pointer rounded-md border border-line bg-surface px-3 py-2 text-base text-ivory focus:outline-none focus:ring-3 focus:ring-jade">
              <option value="">Choose who sees them now</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" className="min-h-11 cursor-pointer rounded-md border border-line px-4 py-2 text-sm font-medium text-ivory transition-colors duration-150 hover:bg-surface-2">
              Look up
            </button>
          </div>
        </form>
      </Card>

      {phone && (
        <Card title={match ? "Link this patient" : "New patient"}>
          <WalkInConfirm
            action={confirmWalkIn}
            phone={phone}
            match={match ? { id: match.id, fullName: match.fullName, phone: match.phone } : null}
            serviceId={service ?? services[0]?.id ?? ""}
            therapistId={therapist ?? ""}
          />
        </Card>
      )}
    </div>
  );
}
