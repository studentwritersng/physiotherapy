import { Fragment } from "react";
import type { Service } from "@/generated/prisma/client";
import { SubmitButton } from "@/components/SubmitButton";
import type { ActionState } from "@/server/action-state";
import { ServiceForm } from "./ServiceForm";
import { toggleServiceActive } from "./actions";

/**
 * A real <table> because this is tabular data — a screen reader announces row
 * and column relationships that a grid of divs cannot.
 */
export function ServiceList({
  services,
  editAction,
}: {
  services: Service[];
  editAction: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  if (services.length === 0) {
    return (
      <p className="text-sm text-ivory-dim">
        No services yet. Add the first one below — it will appear on the public website and in the
        booking form.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Clinic services</caption>
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="py-2 pr-4 font-semibold">Name</th>
            <th scope="col" className="py-2 pr-4 font-semibold">Duration</th>
            <th scope="col" className="py-2 pr-4 font-semibold">Price</th>
            <th scope="col" className="py-2 pr-4 font-semibold">Status</th>
            <th scope="col" className="py-2 font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {services.map((service) => (
            <Fragment key={service.id}>
              <tr className="border-b border-line">
                <th scope="row" className="py-3 pr-4 text-left font-medium">
                  {service.name}
                  <span className="block tabular text-xs text-ivory-faint">/{service.slug}</span>
                </th>
                <td className="py-3 pr-4 tabular">{service.defaultDurationMinutes} min</td>
                <td className="py-3 pr-4 tabular">₦{service.defaultPrice.toString()}</td>
                <td className="py-3 pr-4">
                  {service.active ? (
                    <span className="rounded bg-jade-dim px-2 py-1 text-xs font-medium text-jade-text">
                      Active
                    </span>
                  ) : (
                    <span className="rounded bg-surface-2 px-2 py-1 text-xs font-medium text-ivory-dim">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="py-3">
                  <form action={toggleServiceActive}>
                    <input type="hidden" name="id" value={service.id} />
                    <input
                      type="hidden"
                      name="nextActive"
                      value={service.active ? "false" : "true"}
                    />
                    <SubmitButton variant={service.active ? "destructive" : "primary"}>
                      {service.active ? "Deactivate" : "Activate"}
                    </SubmitButton>
                  </form>
                </td>
              </tr>
              <tr className="border-b border-line">
                <td colSpan={5} className="py-2">
                  {/* Native <details>: a disclosure with zero client JS, closed by
                      default so the table stays scannable. */}
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-jade">
                      Edit {service.name}
                    </summary>
                    <div className="mt-3">
                      <ServiceForm
                        action={editAction}
                        submitLabel="Save changes"
                        values={{
                          id: service.id,
                          name: service.name,
                          description: service.description ?? "",
                          defaultDurationMinutes: service.defaultDurationMinutes,
                          defaultPrice: service.defaultPrice.toString(),
                          imageUrl: service.imageUrl ?? "",
                        }}
                      />
                    </div>
                  </details>
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}