import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicImage } from "@/components/PublicImage";
import { getServiceBySlug, listActiveServices } from "@/server/services/service-catalog";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service) return { title: "Service not found — TetaPhysio" };
  return {
    title: `${service.name} — TetaPhysio`,
    description: service.description ?? `Book ${service.name} at TetaPhysio Lagos.`,
  };
}

/** Pre-render every live service page at build time; unknown slugs notFound(). */
export async function generateStaticParams() {
  const services = await listActiveServices();
  return services.map((s) => ({ slug: s.slug }));
}

export default async function ServiceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service || !service.active) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 md:px-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Services</p>
      <h1 className="font-display mt-2 text-3xl font-semibold text-ivory md:text-4xl">{service.name}</h1>

      <div className="mt-6 overflow-hidden rounded-lg border border-line">
        <PublicImage
          file={`service-${service.slug}.jpg`}
          alt={service.name}
          width={1200}
          height={800}
          eager
          className="aspect-[3/2] w-full object-cover"
        />
      </div>

      {service.description && (
        <p className="mt-6 max-w-prose text-[15px] leading-relaxed text-ivory-dim">{service.description}</p>
      )}

      <dl className="mt-6 flex flex-wrap gap-6">
        <div>
          <dt className="text-xs uppercase tracking-wider text-ivory-faint">Session length</dt>
          <dd className="tabular mt-1 text-lg font-semibold text-ivory">{service.defaultDurationMinutes} min</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-ivory-faint">Price from</dt>
          <dd className="tabular mt-1 text-lg font-semibold text-ivory">
            ₦{Number(service.defaultPrice.toString()).toFixed(2)}
          </dd>
        </div>
      </dl>

      <Link
        href={`/book?service=${service.slug}`}
        className="mt-8 inline-flex min-h-11 cursor-pointer items-center rounded-md bg-jade px-6 py-3 text-base font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
      >
        Book this service
      </Link>
    </main>
  );
}
