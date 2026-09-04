import { PublicImage } from "@/components/PublicImage";
import { getClinicSettings } from "@/server/services/clinic-settings";
import { buildWhatsAppLink } from "@/lib/site";
import type { OpeningHours } from "@/lib/zod/clinic";

export const metadata = {
  title: "Contact — TetaPhysio",
  description: "Call, WhatsApp or visit TetaPhysio physiotherapy clinic in Lagos. Opening hours and directions.",
};

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export default async function ContactPage() {
  const settings = await getClinicSettings();
  const whatsapp = buildWhatsAppLink(
    settings.contactWhatsapp,
    `Hello ${settings.clinicName}, I'd like to make an enquiry.`,
  );
  const hours: OpeningHours = settings.openingHours;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Contact</p>
      <h1 className="font-display mt-2 text-3xl font-semibold text-ivory md:text-4xl">
        Talk to a human
      </h1>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-6">
          <h2 className="font-display text-xl font-semibold text-ivory">Reach us</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {settings.contactPhone && (
              <li>
                <a
                  href={`tel:${settings.contactPhone.replace(/\s/g, "")}`}
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-4 py-2 text-sm font-medium text-ivory transition-colors duration-150 hover:bg-surface-2"
                >
                  Call {settings.contactPhone}
                </a>
              </li>
            )}
            {whatsapp && (
              <li>
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-md bg-jade px-4 py-2 text-sm font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
                >
                  WhatsApp the clinic
                </a>
              </li>
            )}
            {settings.contactEmail && (
              <li>
                <a
                  href={`mailto:${settings.contactEmail}`}
                  className="cursor-pointer text-sm text-jade-text underline hover:opacity-80"
                >
                  {settings.contactEmail}
                </a>
              </li>
            )}
            {settings.address && <li className="text-sm text-ivory-dim">{settings.address}</li>}
          </ul>
        </div>

        <div className="rounded-lg border border-line bg-surface p-6">
          <h2 className="font-display text-xl font-semibold text-ivory">Opening hours</h2>
          <dl className="mt-3 flex flex-col">
            {DAY_KEYS.map((day) => {
              const h = hours[day];
              return (
                <div
                  key={day}
                  className="flex items-baseline justify-between border-b border-dashed border-line py-2 last:border-b-0"
                >
                  <dt className="text-sm font-medium capitalize text-ivory">{day}</dt>
                  <dd className="tabular text-sm text-ivory-dim">
                    {h ? `${h.open} – ${h.close}` : "Closed"}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-line">
        <PublicImage
          file="clinic-exterior.jpg"
          alt={settings.address ? `TetaPhysio clinic at ${settings.address}` : "TetaPhysio clinic building"}
          width={1600}
          height={900}
          className="aspect-[16/9] w-full object-cover"
        />
      </div>
      <p className="mt-2 text-xs text-ivory-faint">
        An embedded map arrives with the clinic's Google Maps listing — until then, the address
        above plus a phone call gets every visitor here.
      </p>
    </main>
  );
}
