import { Card } from "@/components/Card";
import { requireRole } from "@/server/auth/rbac";
import { listActiveServices } from "@/server/services/service-catalog";
import { listTherapists } from "@/server/services/availability";
import { getSlotsForDate } from "@/server/services/booking";
import { listPatientsForActor } from "@/server/services/patient";
import { todayKey } from "@/lib/slots";
import { createBooking } from "./actions";
import { BookingForm } from "./BookingForm";

export const metadata = { title: "New booking — TetaPhysio" };

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; therapist?: string; date?: string }>;
}) {
  const user = await requireRole("admin", "receptionist");
  const [{ service, therapist, date }, services, therapists] = await Promise.all([
    searchParams,
    listActiveServices(),
    listTherapists(),
  ]);

  const serviceId = service ?? services[0]?.id ?? "";
  const therapistId = therapist ?? "";
  const dateKey = date ?? todayKey();

  const [slots, patients] = await Promise.all([
    serviceId ? getSlotsForDate(dateKey, serviceId, therapistId === "" ? null : therapistId) : [],
    listPatientsForActor(user, { take: 200 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ivory">New booking</h1>
        <p className="mt-1 text-sm text-ivory-dim">Pick a service, therapist and day — then a slot.</p>
      </header>

      {/* Step 1: GET form. Changing any select reloads the page with new search
          params, which re-renders the slot list server-side. No JavaScript. */}
      <Card title="Service, therapist, day">
        <form method="get" className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="service" className="text-sm font-medium text-ivory">Service</label>
            <select id="service" name="service" defaultValue={serviceId} className="min-h-11 cursor-pointer rounded-md border border-line bg-surface px-3 py-2 text-base text-ivory focus:outline-none focus:ring-3 focus:ring-jade">
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="therapist" className="text-sm font-medium text-ivory">Therapist</label>
            <select id="therapist" name="therapist" defaultValue={therapistId} className="min-h-11 cursor-pointer rounded-md border border-line bg-surface px-3 py-2 text-base text-ivory focus:outline-none focus:ring-3 focus:ring-jade">
              <option value="">No preference</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="date" className="text-sm font-medium text-ivory">Day</label>
            <input id="date" name="date" type="date" defaultValue={dateKey} className="min-h-11 rounded-md border border-line bg-surface px-3 py-2 text-base tabular text-ivory focus:outline-none focus:ring-3 focus:ring-jade" />
          </div>
          <div className="sm:col-span-3">
            <button type="submit" className="min-h-11 cursor-pointer rounded-md border border-line px-4 py-2 text-sm font-medium text-ivory transition-colors duration-150 hover:bg-surface-2">
              Show slots
            </button>
          </div>
        </form>
      </Card>

      {/* Step 2: the booking itself posts to the Server Action. */}
      <Card title="Slot and patient">
        <BookingForm
          action={createBooking}
          patients={patients.map((p) => ({ id: p.id, fullName: p.fullName, phone: p.phone }))}
          slots={slots.map((s) => ({
            start: s.start.toISOString(),
            end: s.end.toISOString(),
            therapistId: s.therapistId,
            therapistName: s.therapistName,
          }))}
          selected={{ serviceId, therapistId, dateKey }}
        />
      </Card>
    </div>
  );
}
