export const metadata = {
  title: "Privacy policy — TetaPhysio",
  description: "How TetaPhysio collects, uses and protects your information.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6">
      <h1 className="font-display text-3xl font-semibold text-ivory">Privacy policy</h1>
      <div className="mt-6 flex flex-col gap-5 text-[15px] leading-relaxed text-ivory-dim">
        <p>
          TetaPhysio collects your name, phone number and any medical details you share so the
          clinic can treat you and communicate with you about your care. The clinic sees only
          what is needed to run appointments, treatment and billing.
        </p>
        <p>
          Your clinical notes are visible to your treating therapist and the clinic administrator
          only — never to other patients, and never sold or shared for marketing.
        </p>
        <p>
          You may ask the clinic at any time to see the information held about you, or to have
          your identifying details removed. Removing your details keeps anonymised visit and
          payment records the clinic is obliged to retain, but nothing that identifies you.
        </p>
        <p>
          To make a request, call the clinic or message on WhatsApp using the details on the{" "}
          <a href="/contact" className="cursor-pointer font-medium text-jade-text underline hover:opacity-80">
            contact page
          </a>
          .
        </p>
      </div>
    </main>
  );
}
