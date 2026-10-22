// STUB (Ratings and finalization package). Per-answer player-vs-item ratings.
import { notImplemented } from "../not-implemented";

/** P(theta, beta, c) = c + (1 - c) / (1 + 10^((beta - theta) / 400)). */
export function pCorrect(theta: number, beta: number, chance: number): number {
  void theta; void beta; void chance;
  return notImplemented("elo.pCorrect");
}

/** Ks(n) = max(24, 174 / (1 + 0.05 n)). */
export function playerK(n: number): number {
  void n;
  return notImplemented("elo.playerK");
}

/** Ki(m) = max(8, 174 / (1 + 0.05 m)). */
export function itemK(m: number): number {
  void m;
  return notImplemented("elo.itemK");
}

/** n reduced by 1 per ELO.idleDaysPerNStep full idle days, never below 0. */
export function effectiveN(n: number, idleDays: number): number {
  void n; void idleDays;
  return notImplemented("elo.effectiveN");
}

export interface EloAnswerUpdate {
  playerDelta: number;
  itemDelta: number;
  p: number;
}

/** One answer: x = 1 correct, 0 wrong or timed out. */
export function eloUpdate(theta: number, n: number, beta: number, m: number, chance: number, correct: boolean): EloAnswerUpdate {
  void theta; void n; void beta; void m; void chance; void correct;
  return notImplemented("elo.eloUpdate");
}
