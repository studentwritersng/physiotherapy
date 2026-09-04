import { PublicImage } from "@/components/PublicImage";
import { Reveal } from "@/components/Reveal";
import { getClinicSettings } from "@/server/services/clinic-settings";
import { listPublicTherapists } from "@/server/services/staff-list";

export const metadata = {
  title: "About — TetaPhysio",
  description: "The story, mission and therapists behind TetaPhysio physiotherapy clinic in Lagos.",
};

export default async function AboutPage() {
  const [settings, therapists] = await Promise.all([getClinicSettings(), listPublicTherapists()]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 md:px-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">About</p>
      <h1 className="font-display mt-2 text-3xl font-semibold text-ivory md:text-4xl">
        {settings.clinicName}
      </h1>

      {settings.aboutContent ? (
        <div className="mt-6 flex max-w-prose flex-col gap-4 text-[15px] leading-relaxed text-ivory-dim">
          {settings.aboutContent.split(/\n\n+/).map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      ) : (
        <p className="mt-6 max-w-prose text-ivory-dim">
          Care details are being written — call the clinic to hear our story directly.
        </p>
      )}

      <h2 className="font-display mt-12 text-2xl font-semibold text-ivory">Meet the therapists</h2>
      {therapists.length === 0 ? (
        <p className="mt-4 text-ivory-dim">Therapist profiles are being added.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {therapists.map((t) => (
            <Reveal key={t.id} className="rounded-lg border border-line bg-surface p-6">
              <div className="flex items-center gap-4">
                {t.photoUrl ? (
                  // Admin-pasted URL (upload arrives in sub-project 6): plain img,
                  // not PublicImage, because this file is not in public/images/.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.photoUrl}
                    alt={`Portrait of ${t.name}`}
                    width={80}
                    height={80}
                    loading="lazy"
                    className="size-20 flex-none rounded-full object-cover"
                  />
                ) : (
                  // No pasted URL: fall through to the curated file
                  // public/images/staff-<slug>.jpg, else an initials tile via
                  // the fallback label.
                  <PublicImage
                    file={`staff-${t.slug}.jpg`}
                    alt={`Portrait of ${t.name}`}
                    width={800}
                    height={800}
                    fallbackLabel={t.name
                      .split(" ")
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join("")}
                    className="size-20 flex-none rounded-full object-cover"
                  />
                )}
                <div>
                  <h3 className="font-semibold text-ivory">{t.name}</h3>
                  {t.title && <p className="text-sm text-ivory-dim">{t.title}</p>}
                  {t.qualifications && (
                    <p className="mt-1 text-xs text-ivory-faint">{t.qualifications}</p>
                  )}
                </div>
              </div>
              {t.bio && <p className="mt-3 text-sm leading-relaxed text-ivory-dim">{t.bio}</p>}
            </Reveal>
          ))}
        </div>
      )}
    </main>
  );
}
