import { Card } from "@/components/Card";
import { requirePageRole } from "@/server/auth/page-guard";
import { getClinicSettings } from "@/server/services/clinic-settings";
import { listTestimonials } from "@/server/services/testimonial";
import { addTestimonial, saveAbout, saveSoapLabels } from "./actions";
import { AboutForm } from "./AboutForm";
import { SoapLabelsForm } from "./SoapLabelsForm";
import { TestimonialForm } from "./TestimonialForm";
import { TestimonialList } from "./TestimonialList";

export const metadata = { title: "Website content — TetaPhysio" };

export default async function ContentPage() {
  await requirePageRole("admin");

  const [settings, testimonials] = await Promise.all([getClinicSettings(), listTestimonials()]);

  return (
    <div className="flex flex-col gap-6">
      <Card title="About content" description="Feeds the public About page.">
        <AboutForm aboutContent={settings.aboutContent ?? ""} action={saveAbout} />
      </Card>

      <Card
        title="Session note labels"
        description="Rename the six SOAP fields on the note form. Blank keeps the default."
      >
        <SoapLabelsForm
          initial={(settings.soapLabels ?? {}) as Record<string, string | null>}
          action={saveSoapLabels}
        />
      </Card>

      <Card
        title="Testimonials"
        description="Only published testimonials appear on the website."
      >
        <TestimonialList testimonials={testimonials} />
      </Card>

      <Card title="Add a testimonial">
        <TestimonialForm action={addTestimonial} />
      </Card>
    </div>
  );
}