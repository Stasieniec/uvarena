// The four power-ups: names, kinds, one-line effects (design.md "Power-ups"), and icons.
import { PowerupIcon as MatchPowerupIcon } from "../match/components/icons";
import { POWERUPS, TIMING } from "@shared/game/config";
import type { PowerupId } from "@shared/game/types";
import { POWERUP_NAMES } from "../match/copy";

export interface PowerupInfo {
  id: PowerupId;
  name: string;
  kind: "Blind" | "Quick";
  effect: string;
  /** CSS colour token. */
  color: string;
}


const BASE: Record<PowerupId, Omit<PowerupInfo, "id" | "kind" | "name">> = {
  bibi: { effect: "Doubles the damage you deal this round. The cap rises to 4,500.", color: "var(--color-bibi)" },
  shield: { effect: "Halves the damage you take this round.", color: "var(--color-shield)" },
  fifty: { effect: "Removes wrong options: two of three on a four-option question. Not on true or false.", color: "var(--color-fifty)" },
  fast: {
    effect: `Answer first and your opponent gets ${TIMING.fastCountdownMs / 1000} seconds instead of ${TIMING.countdownMs / 1000}.`,
    color: "var(--color-fast)",
  },
};

export const POWERUP_ORDER: readonly PowerupId[] = ["bibi", "shield", "fifty", "fast"];

export function powerupInfo(id: PowerupId): PowerupInfo {
  return { id, name: POWERUP_NAMES[id], kind: POWERUPS.blind.includes(id) ? "Blind" : "Quick", ...BASE[id] };
}

/** The same drawings as the match screen, so a power-up looks the same everywhere. */
export function PowerupIcon({ id, size = 28, className }: { id: PowerupId; size?: number; className?: string }) {
  return (
    <span role="img" aria-label={POWERUP_NAMES[id]} className={className} style={{ display: "inline-flex", width: size, height: size }}>
      <MatchPowerupIcon id={id} size={size} />
    </span>
  );
}
