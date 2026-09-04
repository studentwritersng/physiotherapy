export type FormFieldProps = {
  label: string;
  name: string;
  type?: "text" | "email" | "tel" | "password" | "url" | "time" | "number" | "date";
  autoComplete?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  defaultValue?: string | number;
  min?: number;
  max?: number;
  step?: number;
  /** Times, prices and durations line up in a column. */
  tabular?: boolean;
  /**
   * Prefix for the rendered id (and its label/hint/error associations).
   * The submitted `name` is unchanged — Server Actions read by name. Needed
   * wherever one page renders the same form twice (e.g. a service list with
   * an inline edit form per row): duplicate ids break label association,
   * so every label would focus the first row's input.
   */
  idPrefix?: string;
};

export function FormField({
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  hint,
  error,
  defaultValue,
  min,
  max,
  step,
  tabular = false,
  idPrefix,
}: FormFieldProps) {
  const fieldId = idPrefix ? `${idPrefix}-${name}` : name;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {/* A real label, not a placeholder — placeholders vanish on focus and are
          not announced reliably. */}
      <label htmlFor={fieldId} className="text-sm font-medium text-ivory">
        {label}
        {!required && <span className="ml-1 font-normal text-ivory-faint">(optional)</span>}
      </label>
      <input
        id={fieldId}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={step}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={[
          "min-h-11 rounded-md border bg-surface px-3.5 py-2.5 text-base text-ivory",
          "transition-colors duration-150 placeholder:text-ivory-faint",
          tabular ? "tabular" : "",
          error ? "border-orchid" : "border-line",
        ].join(" ")}
      />
      {hint && (
        <p id={hintId} className="text-xs text-ivory-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-orchid">
          {error}
        </p>
      )}
    </div>
  );
}
