import Link from "next/link";

export const metadata = { title: "Access denied — TetaPhysio" };

/**
 * Rendered with a 403 status whenever a page guard calls forbidden() from
 * next/navigation (see requirePageRole in src/server/auth/page-guard.ts).
 */
export default function Forbidden() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs uppercase tracking-[0.16em] text-gold-text">403</p>
      <h1 className="font-display text-3xl font-medium text-ivory">Access denied</h1>
      <p className="max-w-prose text-sm text-ivory-dim">
        Your account does not have access to this page. If you need it, ask an administrator.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/staff"
          className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-4 py-2 text-sm font-medium text-ivory transition-colors duration-150 hover:bg-surface-2"
        >
          Back to dashboard
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-4 py-2 text-sm font-medium text-ivory transition-colors duration-150 hover:bg-surface-2"
        >
          Log in
        </Link>
      </div>
    </main>
  );
}
