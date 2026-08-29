import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">TetaPhysio</h1>
      <p className="mt-2 text-gray-600">The public website is delivered in sub-project 4.</p>
      <nav className="mt-6 flex gap-4">
        <Link className="text-blue-700 underline" href="/login">
          Staff login
        </Link>
        <Link className="text-blue-700 underline" href="/portal/login">
          Patient login
        </Link>
      </nav>
    </main>
  );
}
