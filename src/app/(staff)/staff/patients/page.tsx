import Link from "next/link";
import { Card } from "@/components/Card";
import { requirePageRole } from "@/server/auth/page-guard";
import { listPatientsForActor } from "@/server/services/patient";

export const metadata = { title: "Patients — TetaPhysio" };

const PAGE_SIZE = 25;

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await requirePageRole("admin", "therapist", "receptionist");
  const { q, page } = await searchParams;

  const search = q?.trim() ? q.trim() : undefined;
  const pageNum = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);
  // One extra row tells us whether a next page exists; only PAGE_SIZE render.
  const rows = await listPatientsForActor(user, {
    search,
    skip: (pageNum - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
  });
  const hasNext = rows.length > PAGE_SIZE;
  const patients = rows.slice(0, PAGE_SIZE);

  const query = (next: Record<string, string>) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (pageNum > 1 || next.page) params.set("page", next.page ?? String(pageNum));
    for (const [k, v] of Object.entries(next)) {
      if (k !== "page") params.set(k, v);
    }
    const s = params.toString();
    return `/staff/patients${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ivory">Patients</h1>
        <p className="mt-1 text-sm text-ivory-dim">
          {user.role === "therapist"
            ? "Patients you share an appointment with."
            : "Everyone on the books."}
        </p>
      </header>

      <Card title="Search" description="By name, phone, or patient code.">
        <form method="get" action="/staff/patients" className="flex flex-wrap gap-3">
          <label htmlFor="q" className="sr-only">
            Search patients
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={search ?? ""}
            placeholder="Name, phone, or code…"
            className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-base focus:outline-none focus:ring-3 focus:ring-jade"
          />
          <button
            type="submit"
            className="min-h-11 min-w-11 cursor-pointer rounded-md bg-jade px-4 py-2 text-sm font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90"
          >
            Search
          </button>
        </form>
      </Card>

      <Card
        title="Results"
        description={
          patients.length === 0
            ? "No matching patients."
            : `Showing ${patients.length}${hasNext || pageNum > 1 ? ` · page ${pageNum}` : ""}.`
        }
      >
        {patients.length === 0 ? (
          <p className="text-sm text-ivory-dim">Try a different search.</p>
        ) : (
          <ul className="flex flex-col">
            {patients.map((p) => (
              <li
                key={p.id}
                className="border-b border-dashed border-line py-3 last:border-b-0"
              >
                <Link
                  href={`/staff/patients/${p.id}`}
                  className="cursor-pointer font-medium text-ivory hover:text-jade-text"
                >
                  {p.fullName}
                  <span className="block truncate text-xs font-normal text-ivory-faint">
                    {p.patientCode} · {p.phone}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {(pageNum > 1 || hasNext) && (
          <nav aria-label="Patients pages" className="mt-4 flex gap-2">
            {pageNum > 1 && (
              <Link
                href={query({ page: String(pageNum - 1) })}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-4 py-2 text-sm font-medium text-ivory transition-colors duration-150 hover:bg-surface-2"
              >
                Previous
              </Link>
            )}
            {hasNext && (
              <Link
                href={query({ page: String(pageNum + 1) })}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-4 py-2 text-sm font-medium text-ivory transition-colors duration-150 hover:bg-surface-2"
              >
                Next
              </Link>
            )}
          </nav>
        )}
      </Card>
    </div>
  );
}
