import type { Testimonial } from "@/generated/prisma/client";
import { SubmitButton } from "@/components/SubmitButton";
import { removeTestimonial, toggleTestimonialPublished } from "./actions";

export function TestimonialList({ testimonials }: { testimonials: Testimonial[] }) {
  if (testimonials.length === 0) {
    return <p className="text-sm text-ivory-dim">No testimonials yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {testimonials.map((testimonial) => (
        <li key={testimonial.id} className="rounded-md border border-line p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-ivory">{testimonial.patientName}</span>
            {testimonial.published ? (
              <span className="rounded bg-jade-dim px-2 py-1 text-xs font-medium text-jade-text">
                Published
              </span>
            ) : (
              <span className="rounded bg-surface-2 px-2 py-1 text-xs font-medium text-ivory-dim">
                Draft
              </span>
            )}
          </div>

          <blockquote className="mt-2 text-sm text-ivory">{testimonial.content}</blockquote>

          <div className="mt-3 flex flex-wrap gap-2">
            <form action={toggleTestimonialPublished}>
              <input type="hidden" name="id" value={testimonial.id} />
              <input
                type="hidden"
                name="nextPublished"
                value={testimonial.published ? "false" : "true"}
              />
              <SubmitButton variant={testimonial.published ? "secondary" : "primary"}>
                {testimonial.published ? "Unpublish" : "Publish"}
              </SubmitButton>
            </form>

            <form action={removeTestimonial}>
              <input type="hidden" name="id" value={testimonial.id} />
              <SubmitButton variant="destructive">Delete</SubmitButton>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}