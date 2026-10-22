// Inline SVG icons: the six power-ups and a few controls. Drawn here, no icon font.

import type { PowerupId } from "@shared/game/types";

export const POWERUP_COLOR: Record<PowerupId, string> = {
  zeus: "var(--color-zeus)",
  aegis: "var(--color-aegis)",
  nemesis: "var(--color-nemesis)",
  oracle: "var(--color-oracle)",
  hermes: "var(--color-hermes)",
  phoenix: "var(--color-phoenix)",
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
    case "zeus":
      return (
        <svg {...common}>
          <path d="M13.5 1.5 4 13.6h6.2L8.6 22.5 20 9.4h-6.4l1.9-7.9z" fill={c} stroke="#fff6" strokeWidth="0.6" strokeLinejoin="round" />
        </svg>
      );
    case "aegis":
      return (
        <svg {...common}>
          <path d="M12 1.8 20.5 5v6.2c0 5.3-3.6 9.3-8.5 11-4.9-1.7-8.5-5.7-8.5-11V5z" fill={c} />
          <path d="M12 4.6 18 6.9v4.4c0 3.9-2.5 6.9-6 8.3-3.5-1.4-6-4.4-6-8.3V6.9z" fill="none" stroke="#0006" strokeWidth="1.2" />
          <circle cx="12" cy="11.6" r="2.4" fill="#0007" />
        </svg>
      );
    case "nemesis":
      return (
        <svg {...common} fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v18M7 21h10M4 6h16" />
          <path d="M6.5 6 3.5 13h6zM17.5 6l-3 7h6z" fill={c} fillOpacity="0.35" />
          <circle cx="12" cy="3.3" r="1.3" fill={c} />
        </svg>
      );
    case "oracle":
      return (
        <svg {...common}>
          <path d="M1.8 12C4.6 6.6 8.2 4.6 12 4.6s7.4 2 10.2 7.4C19.4 17.4 15.8 19.4 12 19.4S4.6 17.4 1.8 12z" fill={c} fillOpacity="0.28" stroke={c} strokeWidth="1.7" />
          <circle cx="12" cy="12" r="3.6" fill={c} />
          <circle cx="13.2" cy="10.8" r="1.1" fill="#fff" />
        </svg>
      );
    case "hermes":
      return (
        <svg {...common}>
          <path
            d="M2.5 15.5C7 7.8 14 4.4 21.8 4c-2 2.2-3.3 3.4-5 4.3 2 .1 3.3.3 4.2 1-2.3 1.9-4.8 2.8-7.6 3 1.4.6 2.3 1 3 1.8-4.6 2.7-9.3 3-13.9 1.4z"
            fill={c}
          />
          <path d="M6 14.6c3-2.6 6.4-4.6 10.4-6" stroke="#0005" strokeWidth="1" fill="none" />
        </svg>
      );
    case "phoenix":
      return (
        <svg {...common}>
          <path
            d="M12 1.8c1.6 3.8 6.6 6.4 6.6 12a6.6 6.6 0 0 1-13.2 0c0-3.2 1.8-5.4 3.2-7.2.2 2.8 1.2 4.2 2.6 4.6-.6-3.3-.2-6.4.8-9.4z"
            fill={c}
          />
          <path d="M12 13.4c1.2 1.4 2.6 2.2 2.6 4a2.6 2.6 0 0 1-5.2 0c0-1.5 1.2-2.6 2.6-4z" fill="#ffe08a" />
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

/** A jagged bolt from the top of the screen to the bottom, for the Zeus banner. */
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
        stroke="var(--color-zeus)"
        strokeWidth="12"
        strokeOpacity="0.35"
      />
    </svg>
  );
}
