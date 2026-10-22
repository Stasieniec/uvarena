// Score, multiplier, damage and timer length. Pure functions; every number
// comes from config.ts.
import { READING_BONUS, SCORING, TIMER_MS_BY_TYPE, scaleMs } from "./config";
import type { AnswerKey, BlindPowerupId, QuestionFull } from "./types";

/** Round score: correct ? round(1000 * (1 - t / (2 * timerMs))) : 0, t clamped to [0, timerMs]. */
export function roundScore(correct: boolean, answeredAt: number | null, shownAt: number, timerMs: number): number {
  if (!correct || answeredAt === null || timerMs <= 0) return 0;
  const t = Math.min(timerMs, Math.max(0, answeredAt - shownAt));
  return Math.round(SCORING.maxScore * (1 - t / (2 * timerMs)));
}

/** Multiplier of a round: x1 up to round 4, then +0.5 per round, frozen after round 20. */
export function multiplier(round: number): number {
  const flat = SCORING.multiplierFlatRounds;
  if (round <= flat) return 1;
  return 1 + SCORING.multiplierStepPerRound * (Math.min(round, SCORING.multiplierCapRound) - flat);
}

/** Question timer before the match time scale: time_s if set, else type timer plus reading bonus. */
export function baseTimerMs(question: Pick<QuestionFull, "type" | "timeS" | "words">): number {
  if (question.timeS !== null && question.timeS > 0) return question.timeS * 1000;
  const extraWords = Math.max(0, question.words - READING_BONUS.freeWords);
  const bonus = Math.min(READING_BONUS.maxMs, Math.ceil(extraWords / READING_BONUS.wordsPerStep) * READING_BONUS.msPerStep);
  return TIMER_MS_BY_TYPE[question.type] + bonus;
}

/** Question timer: time_s * 1000 if set, else type timer plus reading bonus; then the match time scale. */
export function timerMs(question: Pick<QuestionFull, "type" | "timeS" | "words">, timeScale: number): number {
  return scaleMs(baseTimerMs(question), timeScale);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

/** Whether an answer (real ids) matches the key: set equality, equality, identical sequence or map. */
export function isCorrect(key: AnswerKey, answer: AnswerKey | null): boolean {
  if (answer === null) return false;
  switch (key.kind) {
    case "options":
      return answer.kind === "options" && answer.ids.length > 0 && sameSet(key.ids, answer.ids);
    case "bool":
      return answer.kind === "bool" && answer.value === key.value;
    case "order":
      return (
        answer.kind === "order" && answer.ids.length === key.ids.length && key.ids.every((id, i) => answer.ids[i] === id)
      );
    case "match": {
      if (answer.kind !== "match") return false;
      const keys = Object.keys(key.map);
      if (Object.keys(answer.map).length !== keys.length) return false;
      return keys.every((item) => Object.prototype.hasOwnProperty.call(answer.map, item) && answer.map[item] === key.map[item]);
    }
  }
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
  const result: DamageResult = {
    damage: [0, 0],
    hpAfter: [input.hp[0], input.hp[1]],
    capped: false,
    zeusHit: [false, false],
    aegisHeld: [false, false],
    phoenix: [false, false],
  };
  const [s0, s1] = input.scores;
  if (s0 === s1) return result;

  const att = s0 > s1 ? 0 : 1;
  const def = att === 0 ? 1 : 0;
  const raw = (input.scores[att] - input.scores[def]) * input.multiplier;
  const zeus = input.effective[att] === "zeus";
  const cap = zeus ? SCORING.zeusRoundCap : SCORING.roundCap;
  const uncapped = raw * (zeus ? SCORING.zeusFactor : 1);
  let dmg = Math.min(uncapped, cap);
  result.capped = uncapped > cap;
  if (input.effective[def] === "aegis") {
    dmg *= SCORING.aegisFactor;
    result.aegisHeld[def] = true;
  }
  dmg = Math.round(dmg);

  let hp = input.hp[def] - dmg;
  if (hp <= 0 && input.phoenixReady[def]) {
    hp = SCORING.phoenixHp;
    result.phoenix[def] = true;
  }
  result.hpAfter[def] = Math.max(0, hp);
  result.damage[def] = dmg;
  result.zeusHit[att] = zeus && dmg > 0;
  return result;
}
