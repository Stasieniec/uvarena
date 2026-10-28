// Power-up rules: the per-round limit, the banner of armed power-ups, and
// 50:50's hidden options. Bibi and Shield are applied in scoring.ts.
import { POWERUPS } from "./config";
import type { BlindPowerupId, PlayerState, PowerupId, QuestionFull, Rng, Side } from "./types";
import { POWERUP_IDS } from "./types";

export interface BannerEntry {
  side: Side;
  powerup: BlindPowerupId;
}

/**
 * A stored loadout the game can still use: the right size, distinct, and only
 * power-ups that exist now. A loadout saved before a power-up was removed fails.
 */
export function isValidLoadout(value: unknown): value is PowerupId[] {
  return (
    Array.isArray(value) &&
    value.length === POWERUPS.loadoutSize &&
    new Set(value).size === value.length &&
    value.every((v) => (POWERUP_IDS as readonly unknown[]).includes(v))
  );
}

export function isBlind(powerup: PowerupId): powerup is BlindPowerupId {
  return POWERUPS.blind.includes(powerup);
}

/**
 * The banner of a round: every armed power-up, side 0 first. Empty when
 * nobody armed anything (the banner phase is skipped).
 */
export function armedBanner(players: [PlayerState, PlayerState]): BannerEntry[] {
  const out: BannerEntry[] = [];
  for (const side of [0, 1] as const) {
    const armed = players[side].r.armed;
    if (armed !== null) out.push({ side, powerup: armed });
  }
  return out;
}

/**
 * Whether a player may arm or use this power-up now: power-ups on, in the
 * loadout, not spent, and within the one-per-round limit. During arming the
 * player's current armed choice may be switched, so it does not count against
 * a blind power-up; for a quick one, anything armed this round does.
 */
export function canUsePowerup(player: PlayerState, powerup: PowerupId, powerupsOn: boolean): boolean {
  if (!powerupsOn) return false;
  if (!player.loadout.includes(powerup) || player.used.includes(powerup)) return false;
  if (player.r.quick !== null) return false;
  if (isBlind(powerup)) return true;
  return player.r.armed === null;
}

/** 50:50: real option ids to hide (single and cloze k - 2 wrong, multi 1 wrong). [] on ineligible types. */
export function fiftyHides(question: QuestionFull, rng: Rng): string[] {
  if (!POWERUPS.fifty.eligibleTypes.includes(question.type)) return [];
  if (question.key.kind !== "options") return [];
  const keyIds = new Set(question.key.ids);
  const wrong = question.options.map((o) => o.id).filter((id) => !keyIds.has(id));
  const count =
    question.type === "multi"
      ? Math.min(POWERUPS.fifty.multiWrongHidden, wrong.length)
      : Math.max(0, wrong.length - POWERUPS.fifty.singleWrongKept);
  if (count === 0) return [];
  return rng.shuffle(wrong).slice(0, count);
}
