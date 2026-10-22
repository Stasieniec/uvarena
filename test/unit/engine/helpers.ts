// Test helpers for the engine: fixture questions, match inits and a small
// driver that steps the reducer and records every outbound frame.
import { readFileSync } from "node:fs";
import { expect } from "vitest";
import { botInit } from "@shared/game/bot";
import { botPlayer, initState, nextDeadline, step } from "@shared/game/engine";
import { createRng } from "@shared/game/rng";
import { answerToOpaque } from "@shared/game/view";
import { ServerMessageSchema, type ServerMessage } from "@shared/protocol";
import { BankFileSchema } from "@shared/question-schema";
import type {
  AnswerKey,
  BlindPowerupId,
  BotLevel,
  Effect,
  EngineEvent,
  MatchInit,
  MatchState,
  Outbound,
  PlayerInit,
  PowerupId,
  QuestionFull,
  QuickPowerupId,
  Side,
  StepResult,
} from "@shared/game/types";

export const T0 = 1_800_000_000_000;

export function fixtureQuestions(course = "agai"): QuestionFull[] {
  const raw = JSON.parse(readFileSync(new URL("../../fixtures/questions.json", import.meta.url), "utf8"));
  const bank = BankFileSchema.parse(raw);
  return bank.questions
    .filter((q) => q.courseId === course)
    .map((q) => ({
      id: q.id,
      rev: q.rev,
      courseId: q.courseId,
      lectureId: q.lectureId,
      type: q.type,
      prompt: q.prompt,
      statement: q.statement,
      codeLang: q.codeLang,
      options: q.options,
      targets: q.targets,
      key: q.key,
      shuffle: q.shuffle,
      whyShort: q.whyShort,
      timeS: q.timeS,
      words: q.words,
      chance: q.chance,
      rating: q.startRating,
      ratingN: 0,
    }));
}

let qCounter = 0;

/** A single-choice question with options a to d, key a, a 20 s timer. */
export function makeQuestion(over: Partial<QuestionFull> = {}): QuestionFull {
  qCounter += 1;
  return {
    id: `test-q${qCounter}`,
    rev: 1,
    courseId: "agai",
    lectureId: "L1",
    type: "single",
    prompt: "Which one?",
    statement: null,
    codeLang: null,
    options: [
      { id: "a", text: "Alpha" },
      { id: "b", text: "Bravo" },
      { id: "c", text: "Charlie" },
      { id: "d", text: "Delta" },
    ],
    targets: null,
    key: { kind: "options", ids: ["a"] },
    shuffle: true,
    whyShort: "Because alpha.",
    timeS: null,
    words: 10,
    chance: 0.25,
    rating: 1500,
    ratingN: 0,
    ...over,
  };
}

export function trueFalse(value = true): QuestionFull {
  return makeQuestion({ type: "truefalse", prompt: null, statement: "It is so.", options: [], key: { kind: "bool", value }, chance: 0.5 });
}

export function multiQ(): QuestionFull {
  return makeQuestion({ type: "multi", key: { kind: "options", ids: ["a", "b"] }, chance: 1 / 15 });
}

export function human(userId: string, over: Partial<PlayerInit> = {}): PlayerInit {
  return {
    userId,
    name: userId,
    avatarUrl: null,
    loadout: ["zeus", "aegis", "oracle"],
    botRating: 1500,
    botRatingN: 40,
    ranked: { r: 1500, rd: 80, vol: 0.06 },
    ...over,
  };
}

export function questions(n = 25, make: (i: number) => QuestionFull = () => makeQuestion()): QuestionFull[] {
  return Array.from({ length: n }, (_, i) => make(i));
}

export function rankedInit(over: Partial<MatchInit> = {}): MatchInit {
  return {
    matchId: "m1",
    courseId: "agai",
    mode: "ranked",
    rated: true,
    settings: { powerups: true, lectures: null },
    joinCode: null,
    createdAt: T0,
    seed: 12345,
    humans: [human("alice"), human("bob")],
    bot: null,
    questions: questions(),
    timeScale: 1,
    ...over,
  };
}

export function botMatchInit(level: BotLevel, over: Partial<MatchInit> = {}): MatchInit {
  return rankedInit({ mode: "bot", rated: true, humans: [human("alice")], bot: botInit(level, 1500), ...over });
}

/** Steps the reducer, keeps the state and records every frame and effect. */
export class Driver {
  state: MatchState;
  now: number;
  log: (Outbound & { at: number })[] = [];
  effects: Effect[] = [];
  last: StepResult;

  constructor(init: MatchInit, now = T0) {
    this.now = now;
    this.last = initState(init, now);
    this.state = this.last.state;
  }

  private apply(res: StepResult): StepResult {
    this.last = res;
    this.state = res.state;
    for (const o of res.out) {
      const parsed = ServerMessageSchema.safeParse(o.msg);
      if (!parsed.success) throw new Error(`invalid ${o.msg.type} frame: ${parsed.error.message}`);
      this.log.push({ ...o, at: this.now });
    }
    this.effects.push(...res.effects);
    return res;
  }

  /** Applies an event at `at` (default: the current time). */
  event(event: EngineEvent, at = this.now): StepResult {
    if (at < this.now) throw new Error("time runs forward");
    this.now = at;
    return this.apply(step(this.state, event, at));
  }

  tick(at = this.now): StepResult {
    return this.event({ type: "tick" }, at);
  }

  /** Ticks at every deadline until `pred` holds (checked before each tick). */
  until(pred: (s: MatchState) => boolean, maxSteps = 500): void {
    for (let i = 0; i < maxSteps; i++) {
      if (pred(this.state)) return;
      const d = nextDeadline(this.state);
      if (d === null) throw new Error(`no deadline while waiting (phase ${this.state.phase})`);
      this.tick(Math.max(this.now, d));
    }
    throw new Error("until: condition never held");
  }

  /** Runs to the next phase equal to `phase` (round optional). */
  toPhase(phase: MatchState["phase"], round?: number): void {
    this.until((s) => s.phase === phase && (round === undefined || s.round === round));
  }

  connectAll(): void {
    for (const side of [0, 1] as Side[]) {
      if (this.state.players[side]?.kind === "human") this.event({ type: "connect", side });
    }
  }

  msgs<T extends ServerMessage["type"]>(side: Side, type: T): Extract<ServerMessage, { type: T }>[] {
    return this.log.filter((o) => o.to === side && o.msg.type === type).map((o) => o.msg) as Extract<ServerMessage, { type: T }>[];
  }

  lastMsg<T extends ServerMessage["type"]>(side: Side, type: T): Extract<ServerMessage, { type: T }> {
    const all = this.msgs(side, type);
    const m = all[all.length - 1];
    if (!m) throw new Error(`no ${type} message to side ${side}`);
    return m;
  }

  /** The newest out frames of the last step. */
  out(side: Side): ServerMessage[] {
    return this.last.out.filter((o) => o.to === side).map((o) => o.msg);
  }

  /** Correct answer for this side in its opaque ids. */
  correct(side: Side): AnswerKey {
    const q = this.state.q;
    if (!q) throw new Error("no question");
    return answerToOpaque(q.question.key, q, side);
  }

  /** A wrong answer in this side's opaque ids. */
  wrong(side: Side): AnswerKey {
    const q = this.state.q;
    if (!q) throw new Error("no question");
    const key = q.question.key;
    if (key.kind === "bool") return { kind: "bool", value: !key.value };
    if (key.kind !== "options") throw new Error("wrong(): options or bool only");
    const wrongReal = q.question.options.find((o) => !key.ids.includes(o.id));
    if (!wrongReal) throw new Error("no wrong option");
    return answerToOpaque({ kind: "options", ids: [wrongReal.id] }, q, side);
  }

  answer(side: Side, answer: AnswerKey, at = this.now): StepResult {
    return this.event({ type: "answer", side, round: this.state.round, answer }, at);
  }

  arm(side: Side, powerup: BlindPowerupId | null, at = this.now): StepResult {
    return this.event({ type: "arm", side, round: this.state.round, powerup }, at);
  }

  use(side: Side, powerup: QuickPowerupId, at = this.now): StepResult {
    return this.event({ type: "use", side, round: this.state.round, powerup }, at);
  }

  get q() {
    const q = this.state.q;
    if (!q) throw new Error("no question");
    return q;
  }
}

/** A connected ranked match driven to the first arming phase. */
export function startedRanked(over: Partial<MatchInit> = {}): Driver {
  const d = new Driver(rankedInit(over));
  d.connectAll();
  d.toPhase("arming", 1);
  return d;
}

/** Plays rounds with nobody answering until the given round's arming phase. */
export function skipToRound(d: Driver, round: number): void {
  d.until((s) => s.phase === "arming" && s.round === round);
}

/** Bot-vs-bot match state, ready to tick. Side 0 is replaced by a second bot. */
export function botVsBot(levelA: BotLevel, levelB: BotLevel, seed: number, qs: QuestionFull[], powerups = true): Driver {
  const d = new Driver({
    ...rankedInit(),
    matchId: `sim-${seed}`,
    mode: "bot",
    seed,
    humans: [human("placeholder")],
    bot: botInit(levelB, null),
    settings: { powerups, lectures: null },
    questions: qs,
  });
  const a = botPlayer(botInit(levelA, null), powerups, createRng(seed ^ 0x9e3779b9));
  d.state = { ...d.state, players: [a, d.state.players[1]] };
  return d;
}

export function expectError(d: Driver, side: Side, code: string): void {
  const errs = d.out(side).filter((m) => m.type === "error");
  expect(errs.map((e) => (e.type === "error" ? e.code : ""))).toEqual([code]);
}

export type { PowerupId };
