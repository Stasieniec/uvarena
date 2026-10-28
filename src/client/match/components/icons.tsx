// Inline SVG icons: the four power-ups and a few controls. Drawn here, no icon font.

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

export function PowerupIcon({ id, size = 24, className, color }: IconProps & { id: PowerupId }) {
  const c = color ?? POWERUP_COLOR[id];
  const common = { width: size, height: size, viewBox: "0 0 24 24", className, "aria-hidden": true } as const;
  switch (id) {
    case "bibi":
      return (
        <svg {...common}>
          <path d="M13.5 1.5 4 13.6h6.2L8.6 22.5 20 9.4h-6.4l1.9-7.9z" fill={c} stroke="#fff6" strokeWidth="0.6" strokeLinejoin="round" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 2 20 5v6.3c0 5.1-3.4 9-8 10.7-4.6-1.7-8-5.6-8-10.7V5z" fill={c} />
          <path d="M12 2v20" stroke="#0004" strokeWidth="1.2" />
        </svg>
      );
    case "fifty":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" fill="none" stroke={c} strokeWidth="1.8" />
          <path d="M12 2a10 10 0 0 0 0 20z" fill={c} />
          <text x="7.2" y="14.6" fontSize="6.6" fontWeight="800" textAnchor="middle" fill="#0b0a3a" fontFamily="Inter, sans-serif">
            50
          </text>
          <text x="16.8" y="14.6" fontSize="6.6" fontWeight="800" textAnchor="middle" fill={c} fontFamily="Inter, sans-serif">
            50
          </text>
        </svg>
      );
    case "fast":
      return (
        <svg {...common} fill="none" stroke={c} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 8h6M1 12h7M2 16h6" strokeWidth="1.8" />
          <path d="M11 5l7 7-7 7" strokeWidth="2.6" />
          <path d="M16 5l7 7-7 7" strokeWidth="2.6" opacity="0.55" />
        </svg>
      );
  }
}

export function FlagIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M5 2.5v19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 3.5c3.5-1.6 6.2 1.8 12.5.2v9.4C12.2 14.7 9.5 11.3 6 12.9z" fill="currentColor" />
    </svg>
  );
}

export function SoundIcon({ on, size = 22, className }: IconProps & { on: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="currentColor" />
      {on ? (
        <>
          <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
          <path d="M18.3 6.3a8 8 0 0 1 0 11.4" />
        </>
      ) : (
        <path d="M16 9.5l5 5M21 9.5l-5 5" />
      )}
    </svg>
  );
}

export function CheckIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  );
}

export function CrossIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
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
