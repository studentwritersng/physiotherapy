"use client";

/**
 * A GET form that submits itself the moment any field changes, so filters
 * apply instantly without an extra click. The submit button stays for
 * no-JavaScript users — with JS it is redundant but harmless (the change
 * event fires first and the GET is idempotent).
 */
export function AutoSubmitForm({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <form
      method="get"
      className={className}
      onChange={(e) => e.currentTarget.requestSubmit()}
    >
      {children}
    </form>
  );
}
