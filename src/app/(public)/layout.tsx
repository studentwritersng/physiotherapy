import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getClinicSettings } from "@/server/services/clinic-settings";
import { buildWhatsAppLink } from "@/lib/site";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/about", label: "About & Team" },
  // Anchor sections on the landing page; hidden on small screens where the
  // header only fits the core routes plus the booking CTA.
  { href: "/#conditions", label: "Conditions", hideBelow: "lg" as const },
  { href: "/#stories", label: "Patient Stories", hideBelow: "lg" as const },
];

/**
 * Public chrome: nav, footer, sticky WhatsApp button. No session, no role
 * checks — nothing here may call requireSession/requireRole. Contact details
 * come from the live clinic settings, so an admin edit propagates with no
 * deploy (PRD-02 FR3).
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await getClinicSettings();
  const whatsapp = buildWhatsAppLink(
    settings.contactWhatsapp,
    "Hello TetaPhysio, I'd like to make an enquiry.",
  );

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>

      <header className="border-b border-line bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="font-display cursor-pointer text-xl font-semibold text-ivory">
            {settings.clinicName}
          </Link>
          <nav aria-label="Public navigation" className="flex items-center gap-1 sm:gap-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-ivory-dim transition-colors duration-150 hover:text-ivory ${
                  "hideBelow" in item ? `hidden ${item.hideBelow}:inline` : ""
                }`}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/book"
              className="ml-1 inline-flex min-h-11 cursor-pointer items-center rounded-md bg-jade px-4 py-2 text-sm font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
            >
              Book appointment
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <div id="main-content" className="flex-1">
        {children}
      </div>

      <footer className="border-t border-line">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3 md:px-6">
          <div>
            <p className="font-display text-lg font-semibold text-ivory">{settings.clinicName}</p>
            {settings.tagline && <p className="mt-1 text-sm text-ivory-dim">{settings.tagline}</p>}
            {settings.address && <p className="mt-2 text-sm text-ivory-dim">{settings.address}</p>}
          </div>
          <nav aria-label="Footer navigation" className="flex flex-col gap-2">
            {[...NAV, { href: "/book", label: "Book appointment" }].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="cursor-pointer text-sm text-ivory-dim transition-colors duration-150 hover:text-ivory"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-2 text-sm">
            {settings.contactPhone && (
              <a href={`tel:${settings.contactPhone.replace(/\s/g, "")}`} className="cursor-pointer text-ivory-dim hover:text-ivory">
                {settings.contactPhone}
              </a>
            )}
            {settings.contactEmail && (
              <a href={`mailto:${settings.contactEmail}`} className="cursor-pointer text-ivory-dim hover:text-ivory">
                {settings.contactEmail}
              </a>
            )}
          </div>
        </div>
      </footer>

      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat with the clinic on WhatsApp"
          className="fixed bottom-5 right-5 z-40 flex size-14 cursor-pointer items-center justify-center rounded-full bg-jade text-btn-ink shadow-glass transition-opacity duration-200 hover:opacity-90"
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className="size-7"
          >
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.7.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4 0-.5.1-.7l.4-.5c.1-.2.1-.3 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.2-.7.6-.9 1.6-.3 3.7 1.7 5.4 2.3 2 3.9 2.6 4.7 2.8.6.2 1 .2 1.4-.1.4-.3.7-.7.9-1.1.1-.2.1-.4 0-.5l-1.3-.6Z" />
          </svg>
        </a>
      )}
    </div>
  );
}
