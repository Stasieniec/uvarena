// Bot answer model, power-up policy and ladder. See build-plan.md "Bot model".
// Everything random goes through the match PRNG.
import {
  BOT_LADDER,
  BOT_MODEL,
  BOT_POLICY,
  BOT_STRENGTH,
  ECHO,
  ELO,
  POWERUPS,
  TEST_BOTS,
} from "./config";
import { baseTimerMs, isCorrect } from "./scoring";
import type {
  AnswerKey,
  BlindPowerupId,
  BotInit,
  BotLevel,
  BotPlan,
  BotQuestionPlan,
  PlayerState,
  PowerupId,
  QuestionFull,
  Rng,
} from "./types";
import { POWERUP_IDS } from "./types";

const LADDER_MIN = 1;
const LADDER_MAX = BOT_LADDER.length;

export function isTestBot(level: BotLevel): boolean {
  return level === TEST_BOTS.dummy.level || level === TEST_BOTS.perfect.level;
}

/** Weak bots (ladder levels below BOT_POLICY.smartFromLevel) pick their power-up rounds at random. */
export function isWeakBot(level: BotLevel): boolean {
  return level >= LADDER_MIN && level < BOT_POLICY.smartFromLevel;
}

/** Strength R: ladder 1050 + 150 * (L - 1); Echo: player's bot rating - 75; test levels per config. */
export function botStrength(level: BotLevel, playerBotRating: number | null): number {
  if (level === ECHO.level) return Math.round((playerBotRating ?? ELO.startBotRating) + ECHO.ratingOffset);
  return BOT_STRENGTH.ladderBase + BOT_STRENGTH.ladderStep * (level - 1);
}

function botName(level: BotLevel): string {
  if (level === ECHO.level) return ECHO.name;
  if (level === TEST_BOTS.dummy.level) return TEST_BOTS.dummy.name;
  if (level === TEST_BOTS.perfect.level) return TEST_BOTS.perfect.name;
  const entry = BOT_LADDER.find((b) => b.level === level);
  if (!entry) throw new Error(`unknown bot level ${level}`);
  return entry.name;
}

/** Builds the BotInit the match factory passes in MatchInit. */
export function botInit(level: BotLevel, playerBotRating: number | null): BotInit {
  if (level !== ECHO.level && !isTestBot(level) && (level < LADDER_MIN || level > LADDER_MAX)) {
    throw new Error(`unknown bot level ${level}`);
  }
  return { level, name: botName(level), strength: botStrength(level, playerBotRating) };
}

/** Speed level s = clamp(1 + (R - 1050) / 150, 1, 8). */
export function botSpeed(strength: number): number {
  const s = 1 + (strength - BOT_STRENGTH.ladderBase) / BOT_STRENGTH.ladderStep;
  return Math.min(LADDER_MAX, Math.max(LADDER_MIN, s));
}

/** Match-long plan and a 3-power-up loadout, drawn with the match PRNG at init. */
export function planBot(init: BotInit, powerupsOn: boolean, rng: Rng): { plan: BotPlan; loadout: PowerupId[] } {
  const loadout = powerupsOn ? rng.shuffle(POWERUP_IDS).slice(0, POWERUPS.loadoutSize) : [];
  const weak = isWeakBot(init.level);
  const draw = (range: readonly [number, number]) => rng.int(range[0], range[1]);
  const plan: BotPlan = {
    level: init.level,
    strength: init.strength,
    speed: botSpeed(init.strength),
    bibiRound: loadout.includes("bibi") ? draw(weak ? BOT_POLICY.weakRounds : BOT_POLICY.bibiRounds) : null,
    shieldRound: weak && loadout.includes("shield") ? draw(BOT_POLICY.weakRounds) : null,
    q: null,
  };
  return { plan, loadout };
}

/**
 * The blind power-up a bot arms at the start of this round's arming window,
 * or null. A planned round that loses on priority moves to the next round.
 */
export function botArmChoice(bot: PlayerState, round: number, canUse: (p: BlindPowerupId) => boolean): BlindPowerupId | null {
  const plan = bot.bot;
  if (!plan) return null;
  const due: Record<BlindPowerupId, boolean> = {
    bibi: plan.bibiRound !== null && round >= plan.bibiRound,
    shield: plan.shieldRound !== null ? round >= plan.shieldRound : bot.hp < BOT_POLICY.shieldBelowHp,
  };
  for (const p of BOT_POLICY.priority) {
    const id = p as BlindPowerupId;
    if (due[id] && canUse(id)) return id;
  }
  return null;
}

/** Chance of knowing the answer: 1 / (1 + 10^((beta - R) / 400)). */
export function pKnow(itemRating: number, strength: number): number {
  return 1 / (1 + Math.pow(10, (itemRating - strength) / 400));
}

/**
 * A uniform random answer from the type's answer space, in real ids. `exclude`
 * removes options (50:50 hides) from the draw.
 */
export function randomAnswer(question: QuestionFull, rng: Rng, exclude: readonly string[] = []): AnswerKey {
  const ids = question.options.map((o) => o.id).filter((id) => !exclude.includes(id));
  switch (question.type) {
    case "truefalse":
      return { kind: "bool", value: rng.next() < 0.5 };
    case "single":
    case "cloze":
      return { kind: "options", ids: [rng.pick(ids)] };
    case "multi": {
      // Uniform over non-empty subsets, by rejection.
      for (;;) {
        const chosen = ids.filter(() => rng.next() < 0.5);
        if (chosen.length > 0) return { kind: "options", ids: chosen };
      }
    }
    case "order":
      return { kind: "order", ids: rng.shuffle(ids) };
    case "match": {
      const targets = (question.targets ?? []).map((t) => t.id);
      const map: Record<string, string> = {};
      for (const id of ids) map[id] = rng.pick(targets);
      return { kind: "match", map };
    }
  }
}

/** A wrong answer (test bot Dummy), or null when the type has none. */
export function wrongAnswer(question: QuestionFull, rng: Rng): AnswerKey | null {
  const key = question.key;
  if (key.kind === "bool") return { kind: "bool", value: !key.value };
  for (let i = 0; i < 50; i++) {
    const a = randomAnswer(question, rng);
    if (!isCorrect(key, a)) return a;
  }
  return null;
}

function copyKey(key: AnswerKey): AnswerKey {
  switch (key.kind) {
    case "options":
      return { kind: "options", ids: key.ids.slice() };
    case "order":
      return { kind: "order", ids: key.ids.slice() };
    case "bool":
      return { kind: "bool", value: key.value };
    case "match":
      return { kind: "match", map: { ...key.map } };
  }
}

/**
 * Per-question plan when a question is shown. Times are computed on the
 * production timer and then scaled by timerMs / baseTimer, so test-mode
 * matches keep the same shape at a faster pace.
 */
export function planBotQuestion(
  plan: BotPlan,
  question: QuestionFull,
  round: number,
  shownAt: number,
  timerMs: number,
  rng: Rng,
): BotQuestionPlan {
  if (isTestBot(plan.level)) {
    const test = plan.level === TEST_BOTS.perfect.level ? TEST_BOTS.perfect : TEST_BOTS.dummy;
    const answer = test.alwaysCorrect ? copyKey(question.key) : wrongAnswer(question, rng);
    const at = Math.min(shownAt + test.answerMs, shownAt + Math.floor(timerMs * BOT_MODEL.maxTimerFraction));
    return {
      round,
      knows: test.alwaysCorrect,
      answer: answer ?? copyKey(question.key),
      answerAt: answer ? at : null,
      fiftyAt: null,
      fastAt: null,
      lateGuessResolved: false,
    };
  }

  const base = baseTimerMs(question);
  const ratio = base > 0 ? timerMs / base : 1;
  const knows = rng.next() < pKnow(question.rating, plan.strength);
  const answer = knows ? copyKey(question.key) : randomAnswer(question, rng);

  let t: number;
  if (knows) {
    const factor = BOT_MODEL.speedBase - BOT_MODEL.speedSlope * (plan.speed - 1);
    t = BOT_MODEL.baseMsByType[question.type] * factor * Math.exp(rng.normal() * BOT_MODEL.timeSigma) + BOT_MODEL.msPerWord * question.words;
  } else {
    const { min, max } = BOT_MODEL.unknownTimerFraction;
    t = (min + (max - min) * rng.next()) * base;
  }
  const floor = BOT_MODEL.floorBaseMs + BOT_MODEL.floorMsPerWord * question.words;
  t = Math.min(Math.max(t, floor), BOT_MODEL.maxTimerFraction * base);
  const answerAt = shownAt + Math.round(t * ratio);

  const fiftyAt =
    !knows && POWERUPS.fifty.eligibleTypes.includes(question.type) ? shownAt + Math.round(BOT_POLICY.fiftyAtMs * ratio) : null;
  const fastAt = knows && round >= BOT_POLICY.fastFromRound ? shownAt + Math.round(BOT_POLICY.fastAtMs * ratio) : null;

  return {
    round,
    knows,
    answer,
    answerAt,
    fiftyAt: fiftyAt !== null && fiftyAt < answerAt ? fiftyAt : null,
    fastAt: fastAt !== null && fastAt < answerAt ? fastAt : null,
    lateGuessResolved: false,
  };
}
