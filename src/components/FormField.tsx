export type FormFieldProps = {
  label: string;
  name: string;
  type?: "text" | "email" | "tel" | "password";
  autoComplete?: string;
  required?: boolean;
  hint?: string;
};

export function FormField({
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  hint,
}: FormFieldProps) {
  const hintId = hint ? `${name}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1">
      {/* Explicit label/input association, not a placeholder — placeholders
          disappear on focus and are not announced reliably. */}
      <label htmlFor={name} className="text-sm font-medium text-gray-800">
        {label}
        {!required && <span className="ml-1 font-normal text-gray-500">(optional)</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        aria-describedby={hintId}
        className="rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
      {hint && (
        <p id={hintId} className="text-xs text-gray-500">
          {hint}
        </p>
      )}
    </div>
  );
}
