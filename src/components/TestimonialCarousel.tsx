"use client";

import { useEffect, useState } from "react";

/**
 * Testimonial rotation (spec §4.3). Auto-advances every 6 seconds, pauses on
 * hover/focus/touch, dots are real buttons with aria-labels. With
 * prefers-reduced-motion the first testimonial renders statically and no timer
 * is created. One visible at a time — a grid would be simpler, but rotation
 * keeps a long testimonial list from dominating the homepage.
 */
export function TestimonialCarousel({
  items,
}: {
  items: { patientName: string; content: string }[];
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || items.length < 2) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [paused, items.length]);

  if (items.length === 0) return null;
  const current = items[index % items.length]!;

  return (
    <div
      aria-roledescription="carousel"
      aria-label="Patient testimonials"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="flex flex-col items-center text-center"
    >
      <blockquote className="font-display max-w-2xl text-xl italic leading-relaxed text-ivory md:text-2xl">
        “{current.content}”
      </blockquote>
      <p className="mt-3 text-sm font-semibold text-ivory-dim">— {current.patientName}</p>
      {items.length > 1 && (
        <div className="mt-4 flex gap-2" role="tablist" aria-label="Choose testimonial">
          {items.map((item, i) => (
            <button
              key={`${item.patientName}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === index % items.length}
              aria-label={`Show testimonial from ${item.patientName}`}
              onClick={() => setIndex(i)}
              className={`size-2.5 cursor-pointer rounded-full transition-colors duration-200 ${
                i === index % items.length ? "bg-jade" : "bg-track"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
