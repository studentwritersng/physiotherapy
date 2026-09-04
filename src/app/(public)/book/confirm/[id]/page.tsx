import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { bookingReference } from "@/lib/site";
import { TIMEZONE } from "@/lib/constants";

export const metadata = {
  title: "Booking confirmed — TetaPhysio",
  description: "Your appointment request has been received.",
};

/**
 * Reference-gated confirmation: possession of the reference IS the
 * authorization, and it exposes only that booking's own details. No session
 * check — this is the unauthenticated surface.
 */
export default async function ConfirmBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const [{ id }, { ref }] = await Promise.all([params, searchParams]);
  if (ref !== bookingReference(id)) notFound();

  const appointment = await prisma.appointment.findFirst({
    where: { id, deletedAt: null },
    include: {
      patient: { select: { fullName: true } },
      service: { select: { name: true } },
      therapist: { select: { name: true } },
    },
  });
  if (!appointment) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 md:px-6">
      <p className="text-sm font-semibold text-jade-text">Booking received</p>
      <h1 className="font-display mt-2 text-3xl font-semibold text-ivory md:text-4xl">
        Thank you, {appointment.patient.fullName}
      </h1>
      <p className="mt-2 text-ivory-dim">
        Your appointment request is in. Show this reference when you arrive:
      </p>

      <p className="tabular mt-6 inline-block rounded-lg border border-line bg-surface px-5 py-3 font-display text-2xl font-semibold tracking-wide text-ivory">
        {bookingReference(appointment.id)}
      </p>

      <dl className="mt-6 flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
        <div className="flex justify-between gap-4">
          <dt className="text-sm text-ivory-dim">Service</dt>
          <dd className="text-sm font-medium text-ivory">{appointment.service.name}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-sm text-ivory-dim">Therapist</dt>
          <dd className="text-sm font-medium text-ivory">{appointment.therapist?.name ?? "To be assigned"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-sm text-ivory-dim">Date and time</dt>
          <dd className="tabular text-sm font-medium text-ivory">{humanDateTime(appointment.scheduledStart)}</dd>
        </div>
      </dl>

      <div className="mt-6 rounded-lg border border-line bg-surface-2 p-5">
        <h2 className="text-sm font-semibold text-ivory">What happens next</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-ivory-dim">
          <li>The clinic will confirm your appointment by phone or WhatsApp.</li>
          <li>Arrive a few minutes early with your booking reference.</li>
          <li>If you need to change anything, call the clinic — bring the reference.</li>
        </ul>
      </div>

      <p className="mt-6">
        <Link
          href="/"
          className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-4 py-2 text-sm font-medium text-ivory transition-colors duration-150 hover:bg-surface-2"
        >
          Back to home
        </Link>
      </p>
    </main>
  );
}

function humanDateTime(start: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(start);
}
