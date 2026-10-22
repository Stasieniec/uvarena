// The six power-ups: names, kinds, one-line effects (design.md "Power-ups"), and icons.
import { PowerupIcon as MatchPowerupIcon } from "../match/components/icons";
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

/** The same drawings as the match screen, so a power-up looks the same everywhere. */
export function PowerupIcon({ id, size = 28, className }: { id: PowerupId; size?: number; className?: string }) {
  return (
    <span role="img" aria-label={BASE[id].name} className={className} style={{ display: "inline-flex", width: size, height: size }}>
      <MatchPowerupIcon id={id} size={size} />
    </span>
  );
}
