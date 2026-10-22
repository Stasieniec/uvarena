// STUB (Game engine package). Bot answer model, power-up policy and ladder.
import { notImplemented } from "../not-implemented";
import type { BotInit, BotLevel, BotPlan, BotQuestionPlan, PowerupId, QuestionFull, Rng } from "./types";

/** Strength R: ladder 1050 + 150 * (L - 1); Echo: player's bot rating - 75; test levels per config. */
export function botStrength(level: BotLevel, playerBotRating: number | null): number {
  void level; void playerBotRating;
  return notImplemented("bot.botStrength");
}

/** Builds the BotInit the match factory passes in MatchInit. */
export function botInit(level: BotLevel, playerBotRating: number | null): BotInit {
  void level; void playerBotRating;
  return notImplemented("bot.botInit");
}

/** Match-long plan and a 3-power-up loadout, drawn with the match PRNG at init. */
export function planBot(init: BotInit, powerupsOn: boolean, rng: Rng): { plan: BotPlan; loadout: PowerupId[] } {
  void init; void powerupsOn; void rng;
  return notImplemented("bot.planBot");
}

/** Per-question plan when a question is shown. */
export function planBotQuestion(
  plan: BotPlan,
  question: QuestionFull,
  round: number,
  shownAt: number,
  timerMs: number,
  rng: Rng,
): BotQuestionPlan {
  void plan; void question; void round; void shownAt; void timerMs; void rng;
  return notImplemented("bot.planBotQuestion");
}
