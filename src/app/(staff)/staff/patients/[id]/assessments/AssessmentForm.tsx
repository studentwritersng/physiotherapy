"use client";

import { useActionState, useState } from "react";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";
import type { Assessment, EpisodeOfCare } from "@/generated/prisma/client";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

type Initial = Pick<
  Assessment,
  "chiefComplaint" | "history" | "examination" | "assessment" | "treatmentGoals" | "treatmentPlan"
>;

const FIELDS: { name: keyof Initial; label: string }[] = [
  { name: "chiefComplaint", label: "Chief complaint" },
  { name: "history", label: "History" },
  { name: "examination", label: "Examination" },
  { name: "assessment", label: "Assessment" },
  { name: "treatmentGoals", label: "Treatment goals" },
  { name: "treatmentPlan", label: "Treatment plan" },
];

/**
 * Assessment form under #assessments. All fields optional (in-progress saves);
 * values arrive via defaultValue so resubmission edits the latest assessment.
 * The episode picker defaults to automatic (join the open episode, or
 * auto-create from the complaint); "new" reveals the reason field.
 */
export function AssessmentForm({
  action,
  patientId,
  openEpisodes,
  latest,
}: {
  action: Action;
  patientId: string;
  openEpisodes: EpisodeOfCare[];
  latest: Initial | null;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const [choice, setChoice] = useState("");
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="patientId" value={patientId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="assess-episode" className="text-sm font-medium text-ivory">
          Episode
        </label>
        <select
          id="assess-episode"
          name="episodeId"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="min-h-11 cursor-pointer rounded-md border border-line bg-surface px-3.5 py-2.5 text-base text-ivory"
        >
          <option value="">
            {openEpisodes.length > 0
              ? "Automatic — join the current episode"
              : "Start a new episode from this assessment"}
          </option>
          {openEpisodes.map((e) => (
            <option key={e.id} value={e.id}>
              {e.reason}
            </option>
          ))}
          <option value="new">Start a new episode…</option>
        </select>
      </div>

      {choice === "new" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="assess-new-reason" className="text-sm font-medium text-ivory">
            New episode reason
          </label>
          <input
            id="assess-new-reason"
            name="newEpisodeReason"
            type="text"
            required
            className="min-h-11 rounded-md border border-line bg-surface px-3.5 py-2.5 text-base text-ivory placeholder:text-ivory-faint"
          />
        </div>
      )}

      {FIELDS.map((field) => (
        <div key={field.name} className="flex flex-col gap-1.5">
          <label htmlFor={`assess-${field.name}`} className="text-sm font-medium text-ivory">
            {field.label} <span className="font-normal text-ivory-faint">(optional)</span>
          </label>
          <textarea
            id={`assess-${field.name}`}
            name={field.name}
            rows={2}
            defaultValue={latest?.[field.name] ?? ""}
            aria-invalid={errors[field.name] ? true : undefined}
            className="min-h-11 rounded-md border border-line bg-surface px-3.5 py-2.5 text-base text-ivory transition-colors duration-150 placeholder:text-ivory-faint"
          />
          {errors[field.name] && (
            <p className="text-xs font-medium text-orchid">{errors[field.name]}</p>
          )}
        </div>
      ))}

      <FormStatus state={state} />

      <div>
        <SubmitButton>Save assessment</SubmitButton>
      </div>
    </form>
  );
}

export function DischargeEpisodeButton({
  action,
  patientId,
  episode,
}: {
  action: Action;
  patientId: string;
  episode: EpisodeOfCare;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);

  return (
    <form action={formAction} className="mt-2 flex flex-col items-start gap-1.5">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="episodeId" value={episode.id} />
      <SubmitButton variant="secondary">Discharge episode</SubmitButton>
      <FormStatus state={state} />
    </form>
  );
}
