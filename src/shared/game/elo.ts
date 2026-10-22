// Per-answer player-vs-item ratings (Math Garden style): the player's bot
// rating and every question's item rating live on one scale and move after
// each answer. Pure; parameters come from ELO in config.ts.

import { ELO } from "./config";

function kFactor(count: number, k: { min: number; base: number; decay: number }): number {
  const c = Number.isFinite(count) ? Math.max(0, count) : 0;
  return Math.max(k.min, k.base / (1 + k.decay * c));
}

/** P(theta, beta, c) = c + (1 - c) / (1 + 10^((beta - theta) / 400)). */
export function pCorrect(theta: number, beta: number, chance: number): number {
  const c = Number.isFinite(chance) ? Math.min(1, Math.max(0, chance)) : 0;
  return c + (1 - c) / (1 + Math.pow(10, (beta - theta) / 400));
}

/** Ks(n) = max(24, 174 / (1 + 0.05 n)). */
export function playerK(n: number): number {
  return kFactor(n, ELO.playerK);
}

/** Ki(m) = max(8, 174 / (1 + 0.05 m)). */
export function itemK(m: number): number {
  return kFactor(m, ELO.itemK);
}

/** n reduced by 1 per ELO.idleDaysPerNStep full idle days, never below 0. */
export function effectiveN(n: number, idleDays: number): number {
  const days = Number.isFinite(idleDays) ? Math.max(0, Math.floor(idleDays)) : 0;
  const base = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  return Math.max(0, base - Math.floor(days / ELO.idleDaysPerNStep));
}

/** Bot rating shows "?" while the player has fewer rated bot answers than this. */
export function isBotRatingProvisional(n: number): boolean {
  return n < ELO.botProvisionalAnswers;
}

export interface EloAnswerUpdate {
  playerDelta: number;
  itemDelta: number;
  p: number;
}

/**
 * One answer: x = 1 correct, 0 wrong or timed out.
 * theta += Ks(n) * (x - P); beta -= Ki(m) * (x - P).
 */
export function eloUpdate(theta: number, n: number, beta: number, m: number, chance: number, correct: boolean): EloAnswerUpdate {
  const p = pCorrect(theta, beta, chance);
  const surprise = (correct ? 1 : 0) - p;
  return {
    playerDelta: playerK(n) * surprise,
    itemDelta: -itemK(m) * surprise,
    p,
  };
}
