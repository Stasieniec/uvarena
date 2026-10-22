// Synthetic question pool and match runners for the simulation tests.
import { botInit } from "@shared/game/bot";
import { nextDeadline } from "@shared/game/engine";
import { createRng } from "@shared/game/rng";
import { selectQuestions, selectionTarget } from "@shared/game/select";
import type { BotLevel, QuestionFull, QuestionType } from "@shared/game/types";
import { Driver, botVsBot, makeQuestion } from "./helpers";

/** 400 questions of the four playable types, ratings spread around 1500. */
export function syntheticPool(seed = 1, size = 400): QuestionFull[] {
  const rng = createRng(seed);
  const types: QuestionType[] = ["single", "single", "single", "single", "multi", "truefalse", "truefalse", "cloze"];
  return Array.from({ length: size }, (_, i) => {
    const type = rng.pick(types);
    const rating = Math.round(1500 + 220 * rng.normal());
    const words = rng.int(8, 60);
    const base = { id: `syn-${i}`, rating, words };
    if (type === "truefalse") {
      return makeQuestion({ ...base, type, prompt: null, statement: "S", options: [], key: { kind: "bool", value: rng.next() < 0.5 }, chance: 0.5 });
    }
    if (type === "multi") return makeQuestion({ ...base, type, key: { kind: "options", ids: ["a", "c"] }, chance: 1 / 15 });
    const k = rng.int(3, 4);
    const options = makeQuestion().options.slice(0, k);
    return makeQuestion({ ...base, type, options, key: { kind: "options", ids: [options[rng.int(0, k - 1)]!.id] }, chance: 1 / k });
  });
}

export function pickQuestions(pool: QuestionFull[], strengths: number[], seed: number): QuestionFull[] {
  const target = selectionTarget({ mode: "ranked", playerBotRatings: strengths, botStrength: null });
  return selectQuestions(pool, { target, count: 25, seenRecently: new Set(), lastSeen: new Map(), rng: createRng(seed) });
}

/** Strength of a bot as an Echo bot level: Echo plays at rating - 75, so pass strength + 75. */
export function echoAt(strength: number) {
  return botInit(-1, strength + 75);
}

export function runToEnd(d: Driver, maxSteps = 5000): void {
  for (let i = 0; i < maxSteps; i++) {
    if (d.state.phase === "finished" || d.state.phase === "cancelled") return;
    const t = nextDeadline(d.state);
    if (t === null) throw new Error(`stuck in ${d.state.phase}`);
    d.tick(Math.max(d.now, t));
  }
  throw new Error("match did not end");
}

export function simMatch(levelA: BotLevel, levelB: BotLevel, seed: number, pool: QuestionFull[], powerups = true): Driver {
  const sa = botInit(levelA, null).strength;
  const sb = botInit(levelB, null).strength;
  const d = botVsBot(levelA, levelB, seed, pickQuestions(pool, [sa, sb], seed), powerups);
  runToEnd(d);
  return d;
}
