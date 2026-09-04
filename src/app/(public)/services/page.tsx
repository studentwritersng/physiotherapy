import Link from "next/link";
import { PublicImage } from "@/components/PublicImage";
import { Reveal } from "@/components/Reveal";
import { listActiveServices } from "@/server/services/service-catalog";

export const metadata = {
  title: "Services — TetaPhysio",
  description: "Explore our physiotherapy services: sports rehab, post-surgery recovery, pain management and more.",
};

export default async function ServicesPage() {
  const services = await listActiveServices();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <h1 className="font-display text-3xl font-semibold text-ivory md:text-4xl">Services</h1>
      <p className="mt-2 max-w-prose text-ivory-dim">
        Every treatment below is delivered by a licensed therapist and bookable online.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s, i) => (
          <Reveal key={s.id} className={i % 3 === 1 ? "sm:translate-y-0" : ""}>
            <Link
              href={`/services/${s.slug}`}
              className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors duration-150 hover:bg-surface-2"
            >
              <PublicImage
                file={`service-${s.slug}.jpg`}
                alt={s.name}
                width={1200}
                height={800}
                className="aspect-[3/2] w-full object-cover"
              />
              <span className="flex flex-1 flex-col p-5">
                <span className="font-semibold text-ivory group-hover:text-jade-text">{s.name}</span>
                {s.description && (
                  <span className="mt-2 line-clamp-3 text-sm text-ivory-dim">{s.description}</span>
                )}
                <span className="tabular mt-3 text-sm font-semibold text-ivory">
                  ₦{Number(s.defaultPrice.toString()).toFixed(2)}
                  <span className="font-normal text-ivory-faint"> · {s.defaultDurationMinutes} min</span>
                </span>
              </span>
            </Link>
          </Reveal>
        ))}
      </div>

      {services.length === 0 && (
        <p className="mt-8 text-ivory-dim">Service details are being updated — call the clinic to book.</p>
      )}
    </main>
  );
}
