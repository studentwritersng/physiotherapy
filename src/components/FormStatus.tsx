import type { ActionState } from "@/server/action-state";

/**
 * Success and error banner. The aria-live region means a screen reader announces
 * the outcome without a focus move; role="status" is polite, so it does not
 * interrupt typing.
 *
 * Rendered even when idle so the live region exists in the DOM before the first
 * update — an aria-live region added at the same moment as its content is often
 * not announced.
 */
export function FormStatus({ state }: { state: ActionState }) {
  return (
    <div aria-live="polite" role="status">
      {state.ok === true && (
        <p className="rounded-md bg-jade-dim px-3 py-2 text-sm font-medium text-jade">
          {state.message}
        </p>
      )}
      {state.ok === false && state.message && (
        <p className="rounded-md bg-orchid-dim px-3 py-2 text-sm font-medium text-orchid">
          {state.message}
        </p>
      )}
    </div>
  );
}
