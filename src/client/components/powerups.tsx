// The six power-ups: names, kinds, one-line effects (design.md "Power-ups"), and icons.
import { POWERUPS } from "@shared/game/config";
import type { ReactNode } from "react";
import type { PowerupId } from "@shared/game/types";

export interface PowerupInfo {
  id: PowerupId;
  name: string;
  kind: "Blind" | "Quick" | "Passive";
  effect: string;
  /** CSS colour token. */
  color: string;
}

function kindOf(id: PowerupId): PowerupInfo["kind"] {
  if (POWERUPS.blind.includes(id)) return "Blind";
  if (POWERUPS.quick.includes(id)) return "Quick";
  return "Passive";
}

const BASE: Record<PowerupId, Omit<PowerupInfo, "id" | "kind">> = {
  zeus: { name: "Zeus", effect: "Doubles the damage you deal this round. The cap rises to 4,500.", color: "var(--color-zeus)" },
  aegis: { name: "Aegis", effect: "Halves the damage you take this round.", color: "var(--color-aegis)" },
  nemesis: { name: "Nemesis", effect: "Cancels what your opponent armed, and their Phoenix this round.", color: "var(--color-nemesis)" },
  oracle: { name: "Oracle", effect: "Removes wrong options. Not on true or false.", color: "var(--color-oracle)" },
  hermes: { name: "Hermes", effect: "Answer first and your opponent gets 2 seconds instead of 5.", color: "var(--color-hermes)" },
  phoenix: { name: "Phoenix", effect: "The first knockout hit leaves you at 1 HP instead. Once.", color: "var(--color-phoenix)" },
};

export const POWERUP_ORDER: readonly PowerupId[] = ["zeus", "aegis", "nemesis", "oracle", "hermes", "phoenix"];

export function powerupInfo(id: PowerupId): PowerupInfo {
  return { id, kind: kindOf(id), ...BASE[id] };
}

const PATHS: Record<PowerupId, ReactNode> = {
  zeus: <path d="M13.5 2 5 13.5h6L9.5 22 19 9.5h-6.2L13.5 2Z" fill="currentColor" stroke="none" />,
  aegis: (
    <>
      <path d="M12 2.5 4 5.5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10v-6l-8-3Z" fill="currentColor" fillOpacity={0.25} />
      <circle cx="12" cy="11.5" r="3" fill="currentColor" stroke="none" />
    </>
  ),
  nemesis: (
    <>
      <path d="M12 3v18M5 7h14" />
      <path d="M5 7 2.5 13a3 3 0 0 0 5 0L5 7ZM19 7l-2.5 6a3 3 0 0 0 5 0L19 7Z" fill="currentColor" fillOpacity={0.3} />
      <path d="M8 21h8" />
    </>
  ),
  oracle: (
    <>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" fill="currentColor" fillOpacity={0.2} />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
    </>
  ),
  hermes: (
    <>
      <path d="M3 15c4 0 6-2 8-5M3 11c3 0 5-1.5 6.5-3.5M4 19c5 0 9-2 12-7l5-7" />
      <path d="M14 14.5c2.5.5 4.5 0 6.5-1.5" />
    </>
  ),
  phoenix: (
    <path
      d="M12 22c-4 0-7-2.7-7-6.6 0-3.1 2-5.4 3.6-7 .2 2 1 3.3 2.2 3.8-.3-3.6 1-7 4.2-9.2-.3 3 .6 5 2.2 6.7 1.5 1.6 2.8 3.4 2.8 5.9 0 3.9-3.1 6.4-8 6.4Z"
      fill="currentColor"
      fillOpacity={0.35}
    />
  ),
};

export function PowerupIcon({ id, size = 28, className }: { id: PowerupId; size?: number; className?: string }) {
  const info = BASE[id];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: info.color }}
      className={className}
      role="img"
      aria-label={info.name}
    >
      {PATHS[id]}
    </svg>
  );
}
