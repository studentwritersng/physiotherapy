import Link from "next/link";
import { Card } from "@/components/Card";
import { requirePageRole } from "@/server/auth/page-guard";
import { listAvailability, listTherapists } from "@/server/services/availability";
import { addAvailability } from "./actions";
import { AvailabilityForm } from "./AvailabilityForm";
import { AvailabilityList } from "./AvailabilityList";

export const metadata = { title: "Therapist availability — TetaPhysio" };

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ therapist?: string }>;
}) {
  await requirePageRole("admin");

  const [{ therapist: requested }, therapists] = await Promise.all([
    searchParams,
    listTherapists(),
  ]);

  if (therapists.length === 0) {
    return (
      <Card title="Therapist availability">
        <p className="text-sm text-ivory-dim">
          No active therapists yet. Staff accounts are created in a later sub-project; until then the
          seeded therapists are the ones available.
        </p>
      </Card>
    );
  }

  // Selection lives in the URL rather than client state, so this server
  // component can load the rows directly and the link is shareable.
  const selected = therapists.find((t) => t.id === requested) ?? therapists[0]!;
  const rows = await listAvailability(selected.id);

  return (
    <div className="flex flex-col gap-6">
      <Card title="Therapist" description="Choose whose hours to edit.">
        <ul className="flex flex-wrap gap-2">
          {therapists.map((therapist) => {
            const isSelected = therapist.id === selected.id;
            return (
              <li key={therapist.id}>
                <Link
                  href={`/staff/settings/availability?therapist=${therapist.id}`}
                  aria-current={isSelected ? "true" : undefined}
                  className={`inline-flex min-h-11 cursor-pointer items-center rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-3 focus:ring-jade ${
                    isSelected
                      ? "bg-jade text-btn-ink"
                      : "border border-line text-ivory hover:bg-surface-2"
                  }`}
                >
                  {therapist.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card
        title={`${selected.name}'s hours`}
        description="Clinic opening hours are applied on top of these, so no slot is ever offered while the clinic is shut."
      >
        <AvailabilityList rows={rows} />
      </Card>

      <Card title="Add an entry">
        <AvailabilityForm therapistId={selected.id} action={addAvailability} />
      </Card>
    </div>
  );
}