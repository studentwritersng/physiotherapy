"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";

export function AboutForm({
  aboutContent,
  action,
}: {
  aboutContent: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="aboutContent" className="text-sm font-medium text-ivory">
          About the clinic
        </label>
        <textarea
          id="aboutContent"
          name="aboutContent"
          rows={8}
          defaultValue={aboutContent}
          aria-describedby="aboutContent-hint"
          className="rounded-md border border-line bg-surface px-3 py-2 text-base focus:outline-none focus:ring-3 focus:ring-jade"
        />
        <p id="aboutContent-hint" className="text-xs text-ivory-faint">
          Plain text. Shown on the public About page.
        </p>
      </div>

      <FormStatus state={state} />

      <div>
        <SubmitButton>Save about content</SubmitButton>
      </div>
    </form>
  );
}