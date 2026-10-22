// STUB (Game engine package). Arming resolution, Oracle and Hermes.
import { notImplemented } from "../not-implemented";
import type { BannerOutcome, BlindPowerupId, PlayerState, PowerupId, QuestionFull, Rng, Side } from "./types";

export interface ArmingResolution {
  effective: [BlindPowerupId | null, BlindPowerupId | null];
  nemesisAgainst: [boolean, boolean];
  /** Banner entries; empty when nobody armed anything (the banner phase is skipped). */
  banner: { side: Side; powerup: PowerupId; outcome: BannerOutcome }[];
}

/** Resolves the arming window, per build-plan.md "Arming resolution". */
export function resolveArming(players: [PlayerState, PlayerState]): ArmingResolution {
  void players;
  return notImplemented("powerups.resolveArming");
}

/** Whether a player may arm or use this power-up now (in loadout, unused, power-ups on, per-round limit). */
export function canUsePowerup(player: PlayerState, powerup: PowerupId, powerupsOn: boolean): boolean {
  void player; void powerup; void powerupsOn;
  return notImplemented("powerups.canUsePowerup");
}

/** Oracle: real option ids to hide (single and cloze k - 2 wrong, multi 1 wrong). [] on ineligible types. */
export function oracleHides(question: QuestionFull, rng: Rng): string[] {
  void question; void rng;
  return notImplemented("powerups.oracleHides");
}
