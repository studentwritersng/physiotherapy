"use client";

import { useActionState, useState } from "react";
import { FormStatus } from "@/components/FormStatus";
import { SubmitButton } from "@/components/SubmitButton";
import { IDLE_STATE, type ActionState } from "@/server/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

type ItemRow = { description: string; quantity: string; unitPrice: string };

const EMPTY_ROW: ItemRow = { description: "", quantity: "1", unitPrice: "" };

/**
 * Invoice creator for the hub billing section. The patient is preselected
 * (hidden field); item rows are client-side add/remove with plain useState
 * and post as one action via repeated field names.
 */
export function InvoiceForm({ action, patientId }: { action: Action; patientId: string }) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const [rows, setRows] = useState<ItemRow[]>([{ ...EMPTY_ROW }]);
  const errors = state.ok === false ? state.fieldErrors : {};

  const setRow = (index: number, patch: Partial<ItemRow>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="patientId" value={patientId} />

      <div className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <fieldset
            key={i}
            className="grid gap-3 rounded-md border border-line bg-surface-2 p-3 sm:grid-cols-[1fr_5rem_8rem_auto]"
          >
            <legend className="sr-only">Item {i + 1}</legend>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`item-desc-${i}`} className="text-sm font-medium text-ivory">
                Description
              </label>
              <input
                id={`item-desc-${i}`}
                name="descriptions"
                type="text"
                value={row.description}
                onChange={(e) => setRow(i, { description: e.target.value })}
                placeholder="Physiotherapy session"
                aria-invalid={errors[`items.${i}.description`] ? true : undefined}
                className="min-h-11 rounded-md border border-line bg-surface px-3 py-2 text-base text-ivory transition-colors duration-150 placeholder:text-ivory-faint"
              />
              {errors[`items.${i}.description`] && (
                <p className="text-xs font-medium text-orchid">{errors[`items.${i}.description`]}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`item-qty-${i}`} className="text-sm font-medium text-ivory">
                Qty
              </label>
              <input
                id={`item-qty-${i}`}
                name="quantities"
                type="number"
                min={1}
                max={100}
                step={1}
                value={row.quantity}
                onChange={(e) => setRow(i, { quantity: e.target.value })}
                aria-invalid={errors[`items.${i}.quantity`] ? true : undefined}
                className="tabular min-h-11 rounded-md border border-line bg-surface px-3 py-2 text-base text-ivory transition-colors duration-150"
              />
              {errors[`items.${i}.quantity`] && (
                <p className="text-xs font-medium text-orchid">{errors[`items.${i}.quantity`]}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`item-price-${i}`} className="text-sm font-medium text-ivory">
                Unit price (₦)
              </label>
              <input
                id={`item-price-${i}`}
                name="unitPrices"
                type="text"
                inputMode="decimal"
                value={row.unitPrice}
                onChange={(e) => setRow(i, { unitPrice: e.target.value })}
                placeholder="15000.00"
                aria-invalid={errors[`items.${i}.unitPrice`] ? true : undefined}
                className="tabular min-h-11 rounded-md border border-line bg-surface px-3 py-2 text-base text-ivory transition-colors duration-150 placeholder:text-ivory-faint"
              />
              {errors[`items.${i}.unitPrice`] && (
                <p className="text-xs font-medium text-orchid">{errors[`items.${i}.unitPrice`]}</p>
              )}
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                disabled={rows.length === 1}
                aria-label={`Remove item ${i + 1}`}
                className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border border-line px-3 py-2 text-sm font-semibold text-ivory transition-colors duration-150 hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
              >
                −
              </button>
            </div>
          </fieldset>
        ))}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, { ...EMPTY_ROW }])}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-4 py-2 text-sm font-semibold text-ivory transition-colors duration-150 hover:bg-surface-2"
        >
          + Add item
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="invoice-notes" className="text-sm font-medium text-ivory">
          Notes <span className="font-normal text-ivory-faint">(optional)</span>
        </label>
        <textarea
          id="invoice-notes"
          name="notes"
          rows={2}
          aria-invalid={errors["notes"] ? true : undefined}
          className="min-h-11 rounded-md border border-line bg-surface px-3.5 py-2.5 text-base text-ivory transition-colors duration-150 placeholder:text-ivory-faint"
        />
        {errors["notes"] && <p className="text-xs font-medium text-orchid">{errors["notes"]}</p>}
      </div>

      {errors["items"] && <p className="text-xs font-medium text-orchid">{errors["items"]}</p>}

      <FormStatus state={state} />

      <div>
        <SubmitButton>Create invoice</SubmitButton>
      </div>
    </form>
  );
}

/**
 * Per-invoice inline payment. Amount is prefilled with the remainder so the
 * common full-payment case is two fields (amount, method) plus confirm —
 * the under-15-seconds check. Reference and notes stay optional.
 */
export function PaymentForm({
  action,
  patientId,
  invoiceId,
  remainder,
}: {
  action: Action;
  patientId: string;
  invoiceId: string;
  remainder: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const errors = state.ok === false ? state.fieldErrors : {};

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`pay-amount-${invoiceId}`} className="text-sm font-medium text-ivory">
            Amount (₦)
          </label>
          <input
            id={`pay-amount-${invoiceId}`}
            name="amount"
            type="text"
            inputMode="decimal"
            required
            defaultValue={remainder}
            aria-invalid={errors["amount"] ? true : undefined}
            className="tabular min-h-11 rounded-md border border-line bg-surface px-3 py-2 text-base text-ivory transition-colors duration-150"
          />
          {errors["amount"] && (
            <p className="text-xs font-medium text-orchid">{errors["amount"]}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`pay-method-${invoiceId}`} className="text-sm font-medium text-ivory">
            Method
          </label>
          <select
            id={`pay-method-${invoiceId}`}
            name="method"
            required
            defaultValue="cash"
            className="min-h-11 cursor-pointer rounded-md border border-line bg-surface px-3 py-2 text-base text-ivory"
          >
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="pos">POS</option>
          </select>
          {errors["method"] && (
            <p className="text-xs font-medium text-orchid">{errors["method"]}</p>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`pay-ref-${invoiceId}`} className="text-sm font-medium text-ivory">
            Reference <span className="font-normal text-ivory-faint">(optional)</span>
          </label>
          <input
            id={`pay-ref-${invoiceId}`}
            name="reference"
            type="text"
            className="min-h-11 rounded-md border border-line bg-surface px-3 py-2 text-base text-ivory transition-colors duration-150 placeholder:text-ivory-faint"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`pay-notes-${invoiceId}`} className="text-sm font-medium text-ivory">
            Notes <span className="font-normal text-ivory-faint">(optional)</span>
          </label>
          <input
            id={`pay-notes-${invoiceId}`}
            name="notes"
            type="text"
            className="min-h-11 rounded-md border border-line bg-surface px-3 py-2 text-base text-ivory transition-colors duration-150 placeholder:text-ivory-faint"
          />
        </div>
      </div>

      <FormStatus state={state} />

      <div>
        <SubmitButton>Record payment</SubmitButton>
      </div>
    </form>
  );
}
