"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";
import type { Exercise, TreatmentPlan } from "@/generated/prisma/client";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const inputClass =
  "min-h-11 rounded-md border border-line bg-surface px-3.5 py-2.5 text-base text-ivory placeholder:text-ivory-faint";

const STATUS_LABELS = { active: "Active", on_hold: "On hold", completed: "Completed" } as const;
type PlanStatus = keyof typeof STATUS_LABELS;

/**
 * Plan header form under #plans. All fields optional (in-progress saves); a new
 * plan joins the open episode automatically and starts hidden from the portal.
 */
export function PlanForm({ action, patientId }: { action: Action; patientId: string }) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="patientId" value={patientId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="plan-goals" className="text-sm font-medium text-ivory">
          Goals <span className="font-normal text-ivory-faint">(optional)</span>
        </label>
        <textarea
          id="plan-goals"
          name="goals"
          rows={2}
          aria-invalid={errors.goals ? true : undefined}
          className={inputClass}
        />
        {errors.goals && <p className="text-xs font-medium text-orchid">{errors.goals}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="plan-details" className="text-sm font-medium text-ivory">
          Plan details <span className="font-normal text-ivory-faint">(optional)</span>
        </label>
        <textarea
          id="plan-details"
          name="planDetails"
          rows={2}
          aria-invalid={errors.planDetails ? true : undefined}
          className={inputClass}
        />
        {errors.planDetails && <p className="text-xs font-medium text-orchid">{errors.planDetails}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="plan-frequency" className="text-sm font-medium text-ivory">
            Frequency <span className="font-normal text-ivory-faint">(optional)</span>
          </label>
          <input id="plan-frequency" name="frequency" type="text" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="plan-duration" className="text-sm font-medium text-ivory">
            Duration <span className="font-normal text-ivory-faint">(optional)</span>
          </label>
          <input id="plan-duration" name="duration" type="text" className={inputClass} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="plan-focus" className="text-sm font-medium text-ivory">
          Focus areas <span className="font-normal text-ivory-faint">(optional)</span>
        </label>
        <input id="plan-focus" name="focusAreas" type="text" className={inputClass} />
      </div>

      <FormStatus state={state} />

      <div>
        <SubmitButton>Save plan</SubmitButton>
      </div>
    </form>
  );
}

function StatusSubmit({ value, current }: { value: PlanStatus; current: PlanStatus }) {
  const { pending } = useFormStatus();
  const selected = value === current;
  return (
    <button
      type="submit"
      name="status"
      value={value}
      disabled={pending}
      aria-pressed={selected}
      className={`min-h-11 cursor-pointer rounded-md border px-4 py-2 text-sm font-semibold transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? "border-jade bg-jade-dim text-jade-text"
          : "border-line text-ivory hover:bg-surface-2"
      }`}
    >
      {STATUS_LABELS[value]}
    </button>
  );
}

/**
 * One plan block: summary line, status buttons, portal visibility toggle, and
 * inline exercise rows with per-row visibility toggles plus an adder.
 */
export function PlanBlock({
  plan,
  exercises,
  patientId,
  statusAction,
  visibilityAction,
  exerciseAction,
  exerciseVisibilityAction,
}: {
  plan: TreatmentPlan;
  exercises: Exercise[];
  patientId: string;
  statusAction: Action;
  visibilityAction: Action;
  exerciseAction: Action;
  exerciseVisibilityAction: Action;
}) {
  const [statusState, statusFormAction] = useActionState(statusAction, IDLE_STATE);
  const [visState, visFormAction] = useActionState(visibilityAction, IDLE_STATE);
  const current = (Object.keys(STATUS_LABELS) as PlanStatus[]).includes(plan.status as PlanStatus)
    ? (plan.status as PlanStatus)
    : "active";

  return (
    <div className="border-b border-dashed border-line py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ivory">
          {plan.goals ? plan.goals.slice(0, 120) : "Treatment plan"}
        </p>
        <p className="text-xs text-ivory-faint">
          {plan.patientVisible ? "Visible to patient" : "Hidden from patient"}
        </p>
      </div>
      {(plan.frequency || plan.duration || plan.focusAreas) && (
        <p className="mt-1 text-xs text-ivory-dim">
          {[plan.frequency, plan.duration, plan.focusAreas].filter(Boolean).join(" · ")}
        </p>
      )}
      {plan.planDetails && <p className="mt-1 text-sm text-ivory-dim">{plan.planDetails}</p>}

      <form action={statusFormAction} className="mt-2 flex flex-wrap gap-2" aria-label="Plan status">
        <input type="hidden" name="planId" value={plan.id} />
        <input type="hidden" name="patientId" value={patientId} />
        {(Object.keys(STATUS_LABELS) as PlanStatus[]).map((s) => (
          <StatusSubmit key={s} value={s} current={current} />
        ))}
      </form>
      <FormStatus state={statusState} />

      <form action={visFormAction} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="planId" value={plan.id} />
        <input type="hidden" name="patientId" value={patientId} />
        <input type="hidden" name="patientVisible" value={plan.patientVisible ? "false" : "true"} />
        <SubmitButton variant="secondary">
          {plan.patientVisible ? "Hide from patient" : "Show to patient"}
        </SubmitButton>
      </form>
      <FormStatus state={visState} />

      {exercises.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {exercises.map((ex) => (
            <ExerciseRow
              key={ex.id}
              exercise={ex}
              patientId={patientId}
              action={exerciseVisibilityAction}
            />
          ))}
        </ul>
      )}

      <AddExerciseForm
        action={exerciseAction}
        planId={plan.id}
        patientId={patientId}
        nextSortOrder={exercises.length}
      />
    </div>
  );
}

function ExerciseRow({
  exercise,
  patientId,
  action,
}: {
  exercise: Exercise;
  patientId: string;
  action: Action;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ivory">{exercise.name}</p>
        {exercise.description && <p className="text-xs text-ivory-dim">{exercise.description}</p>}
      </div>
      <form action={formAction} className="flex shrink-0 items-center gap-2">
        <input type="hidden" name="exerciseId" value={exercise.id} />
        <input type="hidden" name="patientId" value={patientId} />
        <input
          type="hidden"
          name="patientVisible"
          value={exercise.patientVisible ? "false" : "true"}
        />
        <span className="text-xs text-ivory-faint">
          {exercise.patientVisible ? "Shown" : "Hidden"}
        </span>
        <button
          type="submit"
          aria-label={`${exercise.patientVisible ? "Hide" : "Show"} ${exercise.name} ${exercise.patientVisible ? "from" : "to"} patient`}
          className="min-h-11 min-w-11 cursor-pointer rounded-md border border-line px-3 py-2 text-xs font-semibold text-ivory transition-colors duration-150 hover:bg-surface-3"
        >
          {exercise.patientVisible ? "Hide" : "Show"}
        </button>
      </form>
      <FormStatus state={state} />
    </li>
  );
}

function AddExerciseForm({
  action,
  planId,
  patientId,
  nextSortOrder,
}: {
  action: Action;
  planId: string;
  patientId: string;
  nextSortOrder: number;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2">
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="sortOrder" value={nextSortOrder} />
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
        <div className="flex flex-col gap-1">
          <label htmlFor={`ex-name-${planId}`} className="sr-only">
            Exercise name
          </label>
          <input
            id={`ex-name-${planId}`}
            name="name"
            type="text"
            required
            placeholder="Exercise name"
            aria-invalid={errors.name ? true : undefined}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`ex-desc-${planId}`} className="sr-only">
            Exercise description
          </label>
          <input
            id={`ex-desc-${planId}`}
            name="description"
            type="text"
            placeholder="Description (optional)"
            className={inputClass}
          />
        </div>
        <SubmitButton>Add exercise</SubmitButton>
      </div>
      {errors.name && <p className="text-xs font-medium text-orchid">{errors.name}</p>}
      <FormStatus state={state} />
    </form>
  );
}
