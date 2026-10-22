// STUB (Game engine package). Score, multiplier, damage and timer length.
import { notImplemented } from "../not-implemented";
import type { AnswerKey, BlindPowerupId, QuestionFull } from "./types";

/** Round score: correct ? round(1000 * (1 - t / (2 * timerMs))) : 0, t clamped to [0, timerMs]. */
export function roundScore(correct: boolean, answeredAt: number | null, shownAt: number, timerMs: number): number {
  void correct; void answeredAt; void shownAt; void timerMs;
  return notImplemented("scoring.roundScore");
}

/** Multiplier of a round: x1 up to round 4, then +0.5 per round, frozen after round 20. */
export function multiplier(round: number): number {
  void round;
  return notImplemented("scoring.multiplier");
}

/** Question timer: time_s * 1000 if set, else type timer plus reading bonus; then the match time scale. */
export function timerMs(question: Pick<QuestionFull, "type" | "timeS" | "words">, timeScale: number): number {
  void question; void timeScale;
  return notImplemented("scoring.timerMs");
}

/** Whether an answer (real ids) matches the key: set equality, equality, identical sequence or map. */
export function isCorrect(key: AnswerKey, answer: AnswerKey | null): boolean {
  void key; void answer;
  return notImplemented("scoring.isCorrect");
}

export interface DamageInput {
  scores: [number, number];
  multiplier: number;
  effective: [BlindPowerupId | null, BlindPowerupId | null];
  hp: [number, number];
  /** Phoenix available: in loadout, unused, and not hit by Nemesis this round. */
  phoenixReady: [boolean, boolean];
}

export interface DamageResult {
  /** Damage taken per side; at most one side is non-zero. */
  damage: [number, number];
  hpAfter: [number, number];
  capped: boolean;
  /** Zeus active and dealt damage. */
  zeusHit: [boolean, boolean];
  /** Aegis active and halved damage. */
  aegisHeld: [boolean, boolean];
  phoenix: [boolean, boolean];
}

/** Damage for one round, per build-plan.md "Score, multiplier, damage". */
export function computeDamage(input: DamageInput): DamageResult {
  void input;
  return notImplemented("scoring.computeDamage");
}
