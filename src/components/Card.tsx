/**
 * The one surface every settings section sits on. Semantic <section> with a real
 * heading, so the four screens have a navigable heading outline rather than a
 * pile of styled divs.
 */
export function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-6">
      <h2 className="text-lg font-semibold text-ivory">{title}</h2>
      {description && <p className="mt-1 text-sm text-ivory-dim">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
