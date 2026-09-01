import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="font-display text-2xl font-semibold text-ivory">TetaPhysio</h1>
      <p className="mt-2 text-ivory-dim">The public website is delivered in sub-project 4.</p>
      <nav className="mt-6 flex gap-4">
        <Link className="cursor-pointer font-medium text-jade-text underline hover:opacity-80" href="/login">
          Staff login
        </Link>
        <Link
          className="cursor-pointer font-medium text-jade-text underline hover:opacity-80"
          href="/portal/login"
        >
          Patient login
        </Link>
      </nav>
    </main>
  );
}
