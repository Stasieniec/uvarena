// The four power-ups: names, kinds, one-line effects (design.md "Power-ups"), and icons.
import { PowerupIcon as MatchPowerupIcon } from "../match/components/icons";
import type { ReactNode } from "react";
import { POWERUPS, SCORING, TIMING } from "@shared/game/config";
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

/** A number or key word inside an effect line: text colour, semibold. */
function Em({ children }: { children: ReactNode }) {
  return <b className="font-semibold whitespace-nowrap text-text">{children}</b>;
}

/** The picker's effect line, with the numbers picked out (Broadcast picker rows). */
export function PowerupEffect({ id }: { id: PowerupId }) {
  switch (id) {
    case "bibi":
      return (
        <>
          Your damage <Em>x{SCORING.bibiFactor}</Em> this round, cap <Em>{SCORING.bibiRoundCap.toLocaleString("en-US")}</Em>. Fizzles if you deal none.
        </>
      );
    case "shield":
      return (
        <>
          Damage you take this round is <Em>{SCORING.shieldFactor === 0.5 ? "halved" : `x${SCORING.shieldFactor}`}</Em>.
        </>
      );
    case "fifty":
      // A four-option question has three wrong options; 50:50 keeps singleWrongKept of them.
      return (
        <>
          Removes <Em>{3 - POWERUPS.fifty.singleWrongKept}</Em> wrong options. {POWERUPS.fifty.multiWrongHidden === 1 ? "One" : POWERUPS.fifty.multiWrongHidden} on
          multiple select. Not on true or false.
        </>
      );
    case "fast":
      return (
        <>
          Answer first and your opponent gets <Em>{TIMING.fastCountdownMs / 1000} s</Em> instead of {TIMING.countdownMs / 1000}.
        </>
      );
  }
}
