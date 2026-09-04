/**
 * The one surface every settings section sits on. Semantic <section> with a real
 * heading, so the four screens have a navigable heading outline rather than a
 * pile of styled divs.
 *
 * `accent` paints a 3px top border in a semantic hue: jade for the primary
 * commit step, sky for informational/selection steps, orchid for destructive
 * zones. Default (no accent) stays neutral ivory.
 */
const ACCENTS = {
  jade: "border-t-jade",
  gold: "border-t-gold",
  sky: "border-t-sky",
  orchid: "border-t-orchid",
} as const;

export function Card({
  title,
  description,
  children,
  accent,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  accent?: keyof typeof ACCENTS;
}) {
  return (
    <section
      className={`rise rounded-lg border border-line bg-surface p-6 shadow-glass ${accent ? `border-t-[3px] ${ACCENTS[accent]}` : ""}`}
    >
      <h2 className="font-display text-lg font-semibold text-ivory">{title}</h2>
      {description && <p className="mt-1 text-sm text-ivory-dim">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
