// Every line of match screen copy, from design.md. Dry and short; the power-up
// lines are the only place with capitals and exclamation marks.

import type { EndReason, PowerupId, QuestionType } from "@shared/game/types";

export const POWERUP_NAMES: Record<PowerupId, string> = {
  bibi: "Bibi",
  shield: "Shield",
  fifty: "50:50",
  fast: "Gotta Go Fast",
};

/** One-line effect, for button titles and the intro loadouts. */
export const POWERUP_HINTS: Record<PowerupId, string> = {
  bibi: "Double the damage you deal this round.",
  shield: "Halve the damage you take this round.",
  fifty: "Remove wrong options.",
  fast: "Answer first and they get 5 seconds.",
};

export const POWERUP_KIND_LABEL: Record<PowerupId, string> = {
  bibi: "Blind",
  shield: "Blind",
  fifty: "Quick",
  fast: "Quick",
};

/**
 * Banner pictures. The files are added to public/powerups/ separately; every
 * banner still works without them.
 */
export const POWERUP_IMAGES = {
  bibi: "/powerups/bibi.png",
  fiftyLogo: "/powerups/milionerzy-logo.png",
  fiftyHost: "/powerups/milionerzy-host.png",
} as const;

export const LINES = {
  bibi: "BENJAMIN NETANYAHU, STRIKE HIM DOWN!",
  /** The Bibi line as the banner sets it, one part per row. */
  bibiParts: ["BENJAMIN NETANYAHU,", "STRIKE HIM", "DOWN!"],
  shieldTitle: "Shield up.",
  shieldSub: "Damage halved this round.",
  fifty: "FIFTY FIFTY.",
  fiftyOpponent: "They used 50:50.",
  fast: "GOTTA GO FAST.",
  fastOpponent: "They used Gotta Go Fast.",
  bibiFizzle: "Bibi is unimpressed.",
  opponentAnswered: "Opponent answered",
  opponentDisconnected: "Opponent disconnected",
  savedToMissed: "Saved to missed questions",
  reportQuestion: "Report",
  reportedQuestion: "Reported",
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

export type ResultWord = "WIN" | "LOSS" | "DRAW" | "VOID" | "CANCELLED";

export function resultWord(result: "win" | "loss" | "draw" | "void" | "cancelled"): ResultWord {
  return ({ win: "WIN", loss: "LOSS", draw: "DRAW", void: "VOID", cancelled: "CANCELLED" } as const)[result];
}

/** One line under WIN/LOSS explaining how it ended, or null when HP says it all. */
export function endReasonLine(
  reason: EndReason,
  result: "win" | "loss" | "draw" | "void" | "cancelled",
  opponentName: string | null = null,
): string | null {
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
      return `${opponentName ?? "Your opponent"} never showed up. No rating change.`;
    case "expired":
      return "Nobody joined. No rating change.";
    case "cancelled":
      return "The match was cancelled. No rating change.";
  }
}
