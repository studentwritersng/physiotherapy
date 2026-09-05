import { Card } from "@/components/Card";
import { requirePageRole } from "@/server/auth/page-guard";
import { listUnlinkedPortalUsers } from "@/server/services/portal-links";
import { linkPortalAccount } from "./actions";
import { LinkCandidateForm } from "./LinkCandidateForm";

export const metadata = { title: "Portal links — TetaPhysio" };

export default async function PortalLinksPage() {
  await requirePageRole("admin", "therapist", "receptionist");

  const rows = await listUnlinkedPortalUsers();

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="Portal links"
        description="New self-registrations waiting for staff to link them to a clinic record. Matching is by phone number — approve only when you are sure it is the same person."
      >
        {rows.length === 0 ? (
          <p className="text-sm text-ivory-dim">No unlinked portal accounts.</p>
        ) : (
          <ul className="flex flex-col gap-6">
            {rows.map((row) => (
              <li key={row.id} className="border-b border-line pb-6 last:border-0 last:pb-0">
                <p className="font-medium text-ivory">{row.name}</p>
                <p className="tabular text-sm text-ivory-dim">
                  {row.phone}
                  {row.email ? ` · ${row.email}` : ""}
                </p>
                {row.candidates.length === 0 ? (
                  <p className="mt-2 text-sm text-ivory-dim">
                    No matching clinic record — link after their next visit.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-4">
                    {row.candidates.map((candidate) => (
                      <li key={candidate.id}>
                        <LinkCandidateForm
                          action={linkPortalAccount}
                          userId={row.id}
                          patientId={candidate.id}
                          patientLabel={`${candidate.fullName} — ${candidate.status}`}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
