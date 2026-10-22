// Power-up rules: arming resolution (Zeus, Aegis, Nemesis), the per-round
// limit, and Oracle's hidden options. Phoenix is applied in scoring.ts.
import { POWERUPS } from "./config";
import type { BannerOutcome, BlindPowerupId, PlayerState, PowerupId, QuestionFull, Rng, Side } from "./types";

export interface ArmingResolution {
  effective: [BlindPowerupId | null, BlindPowerupId | null];
  nemesisAgainst: [boolean, boolean];
  /** Banner entries; empty when nobody armed anything (the banner phase is skipped). */
  banner: { side: Side; powerup: PowerupId; outcome: BannerOutcome }[];
}

export function isBlind(powerup: PowerupId): powerup is BlindPowerupId {
  return POWERUPS.blind.includes(powerup);
}

/** Holds a Phoenix that has not fired yet. */
export function phoenixAvailable(player: PlayerState): boolean {
  return player.loadout.includes("phoenix") && !player.phoenixUsed;
}

/**
 * Resolves the arming window, per build-plan.md "Arming resolution":
 * a Nemesis cancels whatever the other side armed (and blocks its Phoenix this
 * round); two Nemeses cancel each other and block nothing.
 */
export function resolveArming(players: [PlayerState, PlayerState]): ArmingResolution {
  const armed: [BlindPowerupId | null, BlindPowerupId | null] = [players[0].r.armed, players[1].r.armed];
  const res: ArmingResolution = { effective: [null, null], nemesisAgainst: [false, false], banner: [] };
  for (const i of [0, 1] as const) {
    const o: Side = i === 0 ? 1 : 0;
    const mine = armed[i];
    const theirs = armed[o];
    res.effective[i] = theirs === "nemesis" ? null : mine;
    res.nemesisAgainst[i] = theirs === "nemesis" && mine !== "nemesis";
    if (mine === null) continue;
    let outcome: BannerOutcome;
    if (theirs === "nemesis") outcome = "cancelled";
    else if (mine !== "nemesis") outcome = "active";
    else if (theirs !== null) outcome = "nemesis_hit";
    else if (phoenixAvailable(players[o])) outcome = "nemesis_watch";
    else outcome = "nemesis_wasted";
    res.banner.push({ side: i, powerup: mine, outcome });
  }
  return res;
}

/**
 * Whether a player may arm or use this power-up now: power-ups on, in the
 * loadout, not spent, not passive, and within the one-per-round limit. During
 * arming the player's current armed choice may be switched, so it does not
 * count against a blind power-up; for a quick one, anything armed this round
 * (even if Nemesis cancelled it) does.
 */
export function canUsePowerup(player: PlayerState, powerup: PowerupId, powerupsOn: boolean): boolean {
  if (!powerupsOn) return false;
  if (POWERUPS.passive.includes(powerup)) return false;
  if (!player.loadout.includes(powerup) || player.used.includes(powerup)) return false;
  if (player.r.quick !== null) return false;
  if (isBlind(powerup)) return true;
  return player.r.armed === null;
}

/** Oracle: real option ids to hide (single and cloze k - 2 wrong, multi 1 wrong). [] on ineligible types. */
export function oracleHides(question: QuestionFull, rng: Rng): string[] {
  if (!POWERUPS.oracle.eligibleTypes.includes(question.type)) return [];
  if (question.key.kind !== "options") return [];
  const keyIds = new Set(question.key.ids);
  const wrong = question.options.map((o) => o.id).filter((id) => !keyIds.has(id));
  const count =
    question.type === "multi"
      ? Math.min(POWERUPS.oracle.multiWrongHidden, wrong.length)
      : Math.max(0, wrong.length - POWERUPS.oracle.singleWrongKept);
  if (count === 0) return [];
  return rng.shuffle(wrong).slice(0, count);
}
