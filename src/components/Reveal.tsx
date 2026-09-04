"use client";

import { useEffect, useRef, useState, type ElementType } from "react";

/**
 * Fade/slide reveal on scroll into view (spec §4.3). IntersectionObserver +
 * CSS only — no GSAP, no Lenis. Respects prefers-reduced-motion by rendering
 * children visibly with no transition: the observer still fires, it just
 * never hides anything.
 */
export function Reveal({
  children,
  className,
  as: Tag = "div",
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  as?: "section" | "div";
} & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // `as` is deliberately narrow (section/div only): the call sites need
  // landmarks in exactly two places, and a general ElementType would let a
  // future caller render a span that breaks the heading outline.
  const TagName = Tag as ElementType;
  return (
    <TagName
      ref={ref}
      className={`${className ?? ""} transition-all duration-500 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      }`}
      {...rest}
    >
      {children}
    </TagName>
  );
}
