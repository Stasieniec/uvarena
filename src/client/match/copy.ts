// Every line of match screen copy, from design.md. Dry and short; the power-up
// lines are the only place with capitals and exclamation marks.

import type { BannerOutcome, EndReason, PowerupId, QuestionType } from "@shared/game/types";

export const POWERUP_NAMES: Record<PowerupId, string> = {
  zeus: "Zeus",
  aegis: "Aegis",
  nemesis: "Nemesis",
  oracle: "Oracle",
  hermes: "Hermes",
  phoenix: "Phoenix",
};

/** One-line effect, for button titles and the intro loadouts. */
export const POWERUP_HINTS: Record<PowerupId, string> = {
  zeus: "Double the damage you deal this round.",
  aegis: "Halve the damage you take this round.",
  nemesis: "Cancel what they armed this round.",
  oracle: "Remove wrong options.",
  hermes: "Answer first and they get 2 seconds.",
  phoenix: "Survive one knockout at 1 HP.",
};

export const POWERUP_KIND_LABEL: Record<PowerupId, string> = {
  zeus: "Blind",
  aegis: "Blind",
  nemesis: "Blind",
  oracle: "Quick",
  hermes: "Quick",
  phoenix: "Passive",
};

export const LINES = {
  zeus: "ZEUS, STRIKE THEM DOWN!",
  aegis: "THE AEGIS HOLDS.",
  aegisSub: "Athena sends her regards.",
  nemesisHit: "NEMESIS HAS READ YOUR PLANS.",
  nemesisWatch: "NEMESIS IS WATCHING.",
  nemesisWastedSub: "Nothing to read.",
  oracle: "THE ORACLE HAS SPOKEN.",
  oracleOpponent: "They asked the Oracle.",
  hermes: "HERMES IS ALREADY THERE.",
  hermesOpponent: "They called on Hermes.",
  phoenix: "FROM THE ASHES!",
  phoenixSub: "1 HP. Do not get excited.",
  zeusFizzle: "Zeus is unimpressed.",
  opponentAnswered: "Opponent answered",
  opponentDisconnected: "Opponent disconnected",
  savedToMissed: "Saved to missed questions",
  armHint: "Tap a glowing power-up to arm it.",
  armHintSub: "Your opponent cannot see what you armed.",
  armNothing: "Get ready.",
  lockIn: "Lock in",
  selectAll: "Select all that apply",
  lockedIn: "Locked in",
  waiting: "Waiting for your opponent",
  tooLate: "Too late",
  timeUp: "Time",
  holdToSurrender: "Hold to surrender",
  anotherDevice: "Playing on another device",
  anotherDeviceSub: "This match moved to another tab or phone.",
  playHere: "Play here",
  reconnecting: "Reconnecting",
  connecting: "Connecting",
  notFound: "Match not found.",
  notYours: "This is not your match.",
  finishing: "Working out the ratings.",
} as const;

/** Small label at the top of the question card. */
export const TYPE_LABEL: Record<QuestionType, string> = {
  truefalse: "True or false",
  single: "Pick one",
  cloze: "Fill the blank",
  multi: LINES.selectAll,
  order: "Put in order",
  match: "Match",
};

/** The main line of a banner card. Null for outcomes that only show the other card. */
export function bannerLine(powerup: PowerupId, outcome: BannerOutcome): string {
  if (powerup === "nemesis") {
    if (outcome === "nemesis_hit") return LINES.nemesisHit;
    return LINES.nemesisWatch;
  }
  if (powerup === "zeus") return LINES.zeus;
  if (powerup === "aegis") return LINES.aegis;
  if (powerup === "oracle") return LINES.oracle;
  if (powerup === "hermes") return LINES.hermes;
  return LINES.phoenix;
}

export function bannerSub(powerup: PowerupId, outcome: BannerOutcome): string | null {
  if (powerup === "aegis" && outcome === "active") return LINES.aegisSub;
  if (powerup === "nemesis" && outcome === "nemesis_wasted") return LINES.nemesisWastedSub;
  return null;
}

export type ResultWord = "WIN" | "LOSS" | "DRAW" | "VOID" | "CANCELLED";

export function resultWord(result: "win" | "loss" | "draw" | "void" | "cancelled"): ResultWord {
  return ({ win: "WIN", loss: "LOSS", draw: "DRAW", void: "VOID", cancelled: "CANCELLED" } as const)[result];
}

/** One line under WIN/LOSS explaining how it ended, or null when HP says it all. */
export function endReasonLine(reason: EndReason, result: "win" | "loss" | "draw" | "void" | "cancelled"): string | null {
  switch (reason) {
    case "hp":
      return null;
    case "rounds":
      return result === "draw" ? "Level after sudden death." : "Twenty rounds. More HP wins.";
    case "surrender":
      return result === "win" ? "They surrendered." : "You surrendered.";
    case "abandon":
      return result === "win" ? "Your opponent left." : "You left the match.";
    case "void":
      return "Both players left. No rating change.";
    case "no_show":
      return "Your opponent never showed up. No rating change.";
    case "expired":
      return "Nobody joined. No rating change.";
    case "cancelled":
      return "The match was cancelled. No rating change.";
  }
}
