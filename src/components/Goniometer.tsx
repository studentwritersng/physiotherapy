"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The project's standard KPI dial, ported from buildGoniometer() in
 * doc/clinic-dashboard.html: a semicircular arc gauge with tick marks and a
 * needle, mirroring the instrument physiotherapists use to measure joint
 * range of motion. Sub-project 9's reports reuse this component — do not
 * build a second dial.
 *
 * Angle system: -90deg is left (9 o'clock), 0deg is top (12 o'clock),
 * +90deg is right (3 o'clock). Value animates from 0 on scroll into view;
 * with prefers-reduced-motion it renders at the final value immediately.
 */

function polarPoint(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function goniometerArc(
  cx: number,
  cy: number,
  r: number,
  fromAngle: number,
  toAngle: number,
): string {
  const s = polarPoint(cx, cy, r, fromAngle);
  const e = polarPoint(cx, cy, r, toAngle);
  const largeArc = toAngle - fromAngle > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

const TICKS = [-90, -72, -54, -36, -18, 0, 18, 36, 54, 72, 90];

export function Goniometer({
  value,
  max,
  color,
  size = 140,
  label,
  display,
}: {
  value: number;
  max: number;
  color: string;
  size?: number;
  label: string;
  display: string;
}) {
  const cx = size / 2;
  const cy = size / 2 + 6;
  const r = size / 2 - 14;
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Mount-time sync with the OS motion preference. A lazy useState
      // initializer would read matchMedia during render and mismatch SSR.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShown(target);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        const startedAt = performance.now();
        const duration = 900;
        const tick = (at: number) => {
          const t = Math.min(1, (at - startedAt) / duration);
          // Ease-out cubic: fast needle swing that settles, like the real gauge.
          setShown(target * (1 - Math.pow(1 - t, 3)));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, max]);

  const progressAngle = -90 + shown * 180;

  return (
    <div ref={ref} role="img" aria-label={`${label}: ${display}`} className="flex flex-col items-center">
      <svg
        width={size}
        height={size * 0.66}
        viewBox={`0 0 ${size} ${size * 0.66}`}
        aria-hidden="true"
      >
        <path d={goniometerArc(cx, cy, r, -90, 90)} fill="none" stroke="var(--color-track)" strokeWidth="9" strokeLinecap="round" />
        {TICKS.map((a) => {
          const p1 = polarPoint(cx, cy, r + 8, a);
          const p2 = polarPoint(cx, cy, r + 2, a);
          return (
            <line
              key={a}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="var(--color-ivory-faint)"
              strokeWidth="1.4"
            />
          );
        })}
        <path d={goniometerArc(cx, cy, r, -90, progressAngle)} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" />
        {(() => {
          const tip = polarPoint(cx, cy, r - 2, progressAngle);
          return (
            <>
              <line x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke="var(--color-ivory)" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
              <circle cx={cx} cy={cy} r="3" fill="var(--color-ivory)" />
            </>
          );
        })()}
      </svg>
      <p className="font-display -mt-9 text-3xl font-semibold text-ivory">{display}</p>
      <p className="mt-1 text-xs font-semibold tracking-wide text-ivory-dim">{label}</p>
    </div>
  );
}
