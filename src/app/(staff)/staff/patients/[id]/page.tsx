import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/Card";
import { requirePageRole } from "@/server/auth/page-guard";
import { ForbiddenError } from "@/server/auth/rbac";
import {
  assertCanReadClinical,
  getPatientForActor,
} from "@/server/services/patient";
import { getRecordTimeline } from "@/server/services/clinical";
import { getPlansWithExercises, getSoapLabels, listPatientAppointments } from "@/server/services/clinical";
import { dischargeOpenEpisode, saveAssessment } from "./assessments/actions";
import { AssessmentForm, DischargeEpisodeButton } from "./assessments/AssessmentForm";
import { saveSessionNote } from "./notes/actions";
import { NoteForm } from "./notes/NoteForm";
import {
  saveExercise,
  savePlan,
  setExerciseVisibility,
  setPlanStatus,
  setPlanVisibility,
} from "./plans/actions";
import { PlanBlock, PlanForm } from "./plans/PlanForms";
import { getLatestIntake } from "@/server/services/intake";
import { TIMEZONE } from "@/lib/constants";
import type { EpisodeOfCare } from "@/generated/prisma/client";

export const metadata = { title: "Patient record — TetaPhysio" };

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

type EpisodeGroup<T> = { episode: EpisodeOfCare | null; items: T[] };

/**
 * Groups one record type's rows under their episode (newest episode first,
 * ungrouped rows last), newest row first inside each group. Later tasks render
 * their forms and lists into these same anchored sections.
 */
function groupByEpisode<T extends { episodeId: string | null; id: string }>(
  items: T[],
  episodes: EpisodeOfCare[],
): EpisodeGroup<T>[] {
  const byId = new Map(episodes.map((e) => [e.id, e]));
  const order = new Map<string | null, number>();
  episodes.forEach((e, i) => order.set(e.id, i));
  const buckets = new Map<string | null, T[]>();
  for (const item of items) {
    const key = item.episodeId;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => {
      const oa = a === null ? Number.MAX_SAFE_INTEGER : (order.get(a) ?? Number.MAX_SAFE_INTEGER);
      const ob = b === null ? Number.MAX_SAFE_INTEGER : (order.get(b) ?? Number.MAX_SAFE_INTEGER);
      return oa - ob;
    })
    .map(([key, group]) => ({ episode: key === null ? null : (byId.get(key) ?? null), items: group }));
}

function EpisodeLabel({ episode }: { episode: EpisodeOfCare | null }) {
  if (!episode) return <span className="text-ivory-faint">Outside episodes</span>;
  return (
    <span>
      {episode.reason}{" "}
      <span className="font-normal text-ivory-faint">
        · {episode.status.replace("_", " ")} · since{" "}
        {new Intl.DateTimeFormat("en-NG", {
          timeZone: TIMEZONE,
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(episode.startedAt)}
      </span>
    </span>
  );
}

export default async function PatientRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageRole("admin", "therapist", "receptionist");
  const { id } = await params;

  // Forged ids fail closed: null means "not yours or not real", and both
  // render the same 404 so ids cannot be probed.
  const patient = await getPatientForActor(user, id);
  if (!patient) notFound();

  const intake = await getLatestIntake(patient.id);

  // Receptionists keep the profile + intake page but never receive clinical
  // rows: the arrays are filtered to empty server-side, not merely hidden.
  let canReadClinical = true;
  try {
    assertCanReadClinical(user);
  } catch (error) {
    if (error instanceof ForbiddenError) canReadClinical = false;
    else throw error;
  }
  const timeline = canReadClinical
    ? await getRecordTimeline(patient.id)
    : { assessments: [], notes: [], plans: [], documents: [], episodes: [] };

  const assessmentGroups = groupByEpisode(timeline.assessments, timeline.episodes);
  const openEpisodes = timeline.episodes.filter((e) => e.status === "active");
  const latestAssessment = timeline.assessments[0] ?? null;
  const noteGroups = groupByEpisode(timeline.notes, timeline.episodes);
  const plansWithExercises = canReadClinical ? await getPlansWithExercises(patient.id) : [];
  const planGroups = groupByEpisode(plansWithExercises, timeline.episodes);
  const documentGroups = groupByEpisode(timeline.documents, timeline.episodes);

  // Note form data: labels for the six fields, appointments for the picker.
  // Admins are read-only on notes (only the appointed therapist writes), so
  // they receive the list without the form.
  const labels = canReadClinical ? await getSoapLabels() : null;
  const patientAppointments = canReadClinical ? await listPatientAppointments(patient.id) : [];
  const appointmentOptions = patientAppointments.map((a) => ({
    id: a.id,
    scheduledStart: a.scheduledStart,
    hasNote: a.sessionNote !== null,
  }));
  const canWriteNotes = user.role === "therapist";

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link
          href="/staff/patients"
          className="cursor-pointer text-sm text-ivory-dim hover:text-jade-text"
        >
          ← All patients
        </Link>
        <h1 className="font-display mt-1 text-2xl font-semibold text-ivory">
          {patient.fullName}
        </h1>
        <p className="mt-1 text-sm text-ivory-dim">
          {patient.patientCode} · {patient.phone}
        </p>
      </header>

      <Card title="Profile" description="Registration details.">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ivory-faint">Full name</dt>
            <dd className="font-medium text-ivory">{patient.fullName}</dd>
          </div>
          <div>
            <dt className="text-ivory-faint">Patient code</dt>
            <dd className="tabular font-medium text-ivory">{patient.patientCode}</dd>
          </div>
          <div>
            <dt className="text-ivory-faint">Phone</dt>
            <dd className="tabular font-medium text-ivory">{patient.phone}</dd>
          </div>
          {patient.email && (
            <div>
              <dt className="text-ivory-faint">Email</dt>
              <dd className="font-medium text-ivory">{patient.email}</dd>
            </div>
          )}
          {patient.dateOfBirth && (
            <div>
              <dt className="text-ivory-faint">Date of birth</dt>
              <dd className="tabular font-medium text-ivory">
                {new Intl.DateTimeFormat("en-NG", {
                  timeZone: TIMEZONE,
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }).format(patient.dateOfBirth)}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-ivory-faint">Status</dt>
            <dd className="font-medium text-ivory">{patient.status}</dd>
          </div>
          {patient.basicMedicalInfo && (
            <div className="sm:col-span-2">
              <dt className="text-ivory-faint">Basic medical info</dt>
              <dd className="text-ivory">{patient.basicMedicalInfo}</dd>
            </div>
          )}
        </dl>
      </Card>

      <Card title="Intake" description="Latest submitted intake form.">
        {!intake ? (
          <p className="text-sm text-ivory-dim">No intake submitted yet.</p>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {(
              [
                ["Reason for visit", intake.reasonForVisit],
                ["Medical history", intake.medicalHistory],
                ["Previous injuries", intake.previousInjuries],
                ["Previous surgeries", intake.previousSurgeries],
                ["Current medications", intake.currentMedications],
                ["Allergies", intake.allergies],
                ["Referring doctor", intake.referringDoctor],
              ] as const
            ).map(
              ([label, value]) =>
                value && (
                  <div key={label} className={label === "Reason for visit" ? "sm:col-span-2" : undefined}>
                    <dt className="text-ivory-faint">{label}</dt>
                    <dd className="text-ivory">{value}</dd>
                  </div>
                ),
            )}
            {intake.submittedAt && (
              <p className="tabular text-xs text-ivory-faint sm:col-span-2">
                Submitted {formatDateTime(intake.submittedAt)}
              </p>
            )}
          </dl>
        )}
      </Card>

      {!canReadClinical ? (
        <Card
          title="Clinical record"
          description="Restricted to therapists and admins."
        >
          <p className="text-sm text-ivory-dim">
            Assessments, notes, plans, and documents are visible to clinical staff only.
          </p>
        </Card>
      ) : (
        <>
          <section id="assessments" aria-label="Assessments" className="scroll-mt-6">
            <Card
              title="Assessments"
              description={
                timeline.assessments.length === 0
                  ? "No assessments yet."
                  : `${timeline.assessments.length} assessment${timeline.assessments.length === 1 ? "" : "s"}, grouped by episode.`
              }
            >
              {assessmentGroups.map(({ episode, items }) => (
                <div key={episode?.id ?? "none"} className="mb-4 last:mb-0">
                  <h3 className="text-sm font-semibold text-ivory-dim">
                    <EpisodeLabel episode={episode} />
                  </h3>
                  <ul className="mt-1 flex flex-col">
                    {items.map((a) => (
                      <li
                        key={a.id}
                        className="border-b border-dashed border-line py-2 text-sm last:border-b-0"
                      >
                        <span className="font-medium text-ivory">
                          {a.chiefComplaint || "Assessment"}
                        </span>{" "}
                        <span className="tabular text-xs text-ivory-faint">
                          {formatDateTime(a.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {openEpisodes.map((episode) => (
                <DischargeEpisodeButton
                  key={episode.id}
                  action={dischargeOpenEpisode}
                  patientId={patient.id}
                  episode={episode}
                />
              ))}
              <AssessmentForm
                action={saveAssessment}
                patientId={patient.id}
                openEpisodes={openEpisodes}
                latest={latestAssessment}
              />
            </Card>
          </section>

          <section id="notes" aria-label="Session notes" className="scroll-mt-6">
            <Card
              title="Session notes"
              description={
                timeline.notes.length === 0
                  ? "No session notes yet."
                  : `${timeline.notes.length} note${timeline.notes.length === 1 ? "" : "s"}, grouped by episode.`
              }
            >
              {noteGroups.map(({ episode, items }) => (
                <div key={episode?.id ?? "none"} className="mb-4 last:mb-0">
                  <h3 className="text-sm font-semibold text-ivory-dim">
                    <EpisodeLabel episode={episode} />
                  </h3>
                  <ul className="mt-1 flex flex-col">
                    {items.map((n) => (
                      <li
                        key={n.id}
                        className="border-b border-dashed border-line py-2 text-sm last:border-b-0"
                      >
                        <span className="font-medium text-ivory">
                          {n.subjective
                            ? n.subjective.slice(0, 120)
                            : "Session note"}
                        </span>{" "}
                        <span className="tabular text-xs text-ivory-faint">
                          {formatDateTime(n.createdAt)}
                        </span>
                        {n.editedAt && (
                          <span className="ml-2 text-xs font-medium text-gold">
                            Edited {formatDateTime(n.editedAt)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {canWriteNotes && labels && (
                <NoteForm
                  action={saveSessionNote}
                  patientId={patient.id}
                  appointments={appointmentOptions}
                  existingNotes={timeline.notes}
                  labels={labels}
                />
              )}
            </Card>
          </section>

          <section id="plans" aria-label="Treatment plans" className="scroll-mt-6">
            <Card
              title="Treatment plans"
              description={
                plansWithExercises.length === 0
                  ? "No treatment plans yet."
                  : `${plansWithExercises.length} plan${plansWithExercises.length === 1 ? "" : "s"}, grouped by episode.`
              }
            >
              {planGroups.map(({ episode, items }) => (
                <div key={episode?.id ?? "none"} className="mb-4 last:mb-0">
                  <h3 className="text-sm font-semibold text-ivory-dim">
                    <EpisodeLabel episode={episode} />
                  </h3>
                  <div className="mt-1 flex flex-col">
                    {items.map((p) => (
                      <PlanBlock
                        key={p.id}
                        plan={p}
                        exercises={p.exercises}
                        patientId={patient.id}
                        statusAction={setPlanStatus}
                        visibilityAction={setPlanVisibility}
                        exerciseAction={saveExercise}
                        exerciseVisibilityAction={setExerciseVisibility}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <PlanForm action={savePlan} patientId={patient.id} />
            </Card>
          </section>

          <section id="documents" aria-label="Documents" className="scroll-mt-6">
            <Card
              title="Documents"
              description={
                timeline.documents.length === 0
                  ? "No documents yet."
                  : `${timeline.documents.length} document${timeline.documents.length === 1 ? "" : "s"}, grouped by episode.`
              }
            >
              {documentGroups.map(({ episode, items }) => (
                <div key={episode?.id ?? "none"} className="mb-4 last:mb-0">
                  <h3 className="text-sm font-semibold text-ivory-dim">
                    <EpisodeLabel episode={episode} />
                  </h3>
                  <ul className="mt-1 flex flex-col">
                    {items.map((d) => (
                      <li
                        key={d.id}
                        className="border-b border-dashed border-line py-2 text-sm last:border-b-0"
                      >
                        <span className="font-medium text-ivory">{d.fileName}</span>{" "}
                        <span className="text-xs text-ivory-faint">
                          {d.documentType.replace("_", " ")} ·{" "}
                        </span>
                        <span className="tabular text-xs text-ivory-faint">
                          {formatDateTime(d.uploadedAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
