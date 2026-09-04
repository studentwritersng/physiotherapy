import { existsSync } from "node:fs";
import { join } from "node:path";
import Image from "next/image";

/**
 * File-or-placeholder image resolution (spec §4.1). If public/images/<file>
 * exists on disk, render it through next/image with responsive sizes. If not,
 * render a sized SVG-motif placeholder in brand tokens — never a grey box,
 * never a broken image.
 *
 * Server component only: node:fs must never enter the client bundle. The
 * existsSync call hits the OS page cache; it does not touch the network.
 *
 * Supplying a photo later is file replacement with no code change: drop a
 * file with the listed name into public/images/ and the real image renders.
 */
export function PublicImage({
  file,
  alt,
  width,
  height,
  className,
  eager = false,
  fallbackLabel,
}: {
  file: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  eager?: boolean;
  /**
   * Text rendered on the placeholder instead of the dimensions. The about page
   * passes therapist initials so the fallback reads as an intentional avatar
   * tile rather than a spec sheet shrunk into a circle.
   */
  fallbackLabel?: string;
}) {
  const present = existsSync(join(process.cwd(), "public", "images", file));

  if (present) {
    return (
      <Image
        src={`/images/${file}`}
        alt={alt}
        width={width}
        height={height}
        sizes="(max-width: 620px) 100vw, (max-width: 1180px) 50vw, 33vw"
        priority={eager}
        className={className}
      />
    );
  }

  // Sized placeholder: goniometer-arc motif in brand tokens with the expected
  // dimensions baked in, so layout never shifts when the real file lands.
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${alt} (photo coming soon)`}
      className={className}
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width={width} height={height} fill="var(--color-surface-2)" />
      <g
        fill="none"
        stroke="var(--color-jade)"
        strokeOpacity="0.45"
        strokeWidth={Math.max(2, width / 120)}
      >
        <path
          d={`M ${width * 0.2} ${height * 0.78} A ${width * 0.3} ${width * 0.3} 0 0 1 ${width * 0.8} ${height * 0.78}`}
        />
        <line
          x1={width * 0.5}
          y1={height * 0.78}
          x2={width * 0.68}
          y2={height * 0.42}
          stroke="var(--color-ivory)"
          strokeOpacity="0.5"
        />
        <circle cx={width * 0.5} cy={height * 0.78} r={Math.max(3, width / 90)} fill="var(--color-ivory)" fillOpacity="0.5" stroke="none" />
      </g>
      {fallbackLabel ? (
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--color-jade-text)"
          fontSize={width / 4}
          fontFamily="var(--font-display)"
          fontWeight={600}
        >
          {fallbackLabel}
        </text>
      ) : (
        <text
          x={width / 2}
          y={height * 0.92}
          textAnchor="middle"
          fill="var(--color-ivory-faint)"
          fontSize={Math.max(12, width / 40)}
          fontFamily="var(--font-sans)"
        >
          {width} × {height}
        </text>
      )}
    </svg>
  );
}
