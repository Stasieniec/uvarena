// Inline SVG icons: the four power-ups and a few controls, as 1.8 px line
// drawings in the text colour. Drawn here, no icon font.

import type { PowerupId } from "@shared/game/types";

export const POWERUP_COLOR: Record<PowerupId, string> = {
  bibi: "var(--color-bibi)",
  shield: "var(--color-shield)",
  fifty: "var(--color-fifty)",
  fast: "var(--color-fast)",
};

interface IconProps {
  size?: number;
  className?: string;
  color?: string;
}

/** Line drawings of the four power-ups, in the text colour unless told otherwise. */
export function PowerupIcon({ id, size = 24, className, color, strokeWidth = 1.8 }: IconProps & { id: PowerupId; strokeWidth?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    className,
    fill: "none",
    stroke: color ?? "currentColor",
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  } as const;
  switch (id) {
    case "bibi":
      return (
        <svg {...common}>
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3z" />
        </svg>
      );
    case "fifty":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4v16" />
        </svg>
      );
    case "fast":
      return (
        <svg {...common}>
          <path d="M4 6l6 6-6 6" />
          <path d="M12 6l6 6-6 6" />
        </svg>
      );
  }
}

export function FlagIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}

export function SoundIcon({ on, size = 18, className }: IconProps & { on: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {on ? (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      ) : (
        <path d="M16 9.5l5 5M21 9.5l-5 5" />
      )}
    </svg>
  );
}

export function CheckIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  );
}

export function CrossIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** A jagged bolt from the top of the screen to the bottom, for the Bibi banner. */
export function LightningBolt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 400" preserveAspectRatio="none" aria-hidden>
      <polyline
        points="58,0 44,60 62,92 36,160 58,196 30,262 52,300 38,400"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinejoin="miter"
      />
      <polyline points="44,60 22,104 30,128" fill="none" stroke="#fff" strokeWidth="2.5" />
      <polyline points="58,196 80,236 72,262" fill="none" stroke="#fff" strokeWidth="2.5" />
      <polyline
        points="58,0 44,60 62,92 36,160 58,196 30,262 52,300 38,400"
        fill="none"
        stroke="var(--color-bibi)"
        strokeWidth="12"
        strokeOpacity="0.35"
      />
    </svg>
  );
}
