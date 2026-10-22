// The preview against the real engine: a bot match run in the browser with
// initState/step/nextDeadline, doing the MatchRoom's part (connect, alarms,
// match_end after "finalize") locally. Messages are exactly what the engine
// sends to side 0. Dev builds and tests only.

import { QUESTIONS } from "@shared/game/config";
import { botInit } from "@shared/game/bot";
import { initState, nextDeadline, step } from "@shared/game/engine";
import { matchEnd } from "@shared/game/view";
import type {
  BotLevel,
  EngineEvent,
  MatchState,
  PowerupId,
  QuestionFull,
  SideEndSummary,
  StepResult,
} from "@shared/game/types";
import type { ClientMessage } from "@shared/protocol";
import type { BankFile } from "@shared/question-schema";
import type { MatchClock } from "../clock";
import type { MatchTransport, TransportListener } from "../transport";

/** Bank questions as the match factory would hand them to the engine (playable types only). */
export function questionsFromBank(bank: BankFile, courseId: string): QuestionFull[] {
  return bank.questions
    .filter((q) => q.courseId === courseId && QUESTIONS.uiTypes.includes(q.type))
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

export interface EngineHarnessOptions {
  questions: QuestionFull[];
  botLevel: BotLevel;
  loadout: PowerupId[];
  seed: number;
  /** Defaults to the wall clock. */
  now?: () => number;
  /** Defaults to setTimeout. */
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

/** Maps a client message from side 0 to an engine event. */
export function toEvent(msg: ClientMessage): EngineEvent {
  switch (msg.type) {
    case "ready":
      return { type: "ready", side: 0 };
    case "arm":
      return { type: "arm", side: 0, round: msg.round, powerup: msg.powerup };
    case "use":
      return { type: "use", side: 0, round: msg.round, powerup: msg.powerup };
    case "answer":
      return { type: "answer", side: 0, round: msg.round, answer: msg.answer };
    case "surrender":
      return { type: "surrender", side: 0 };
    case "rematch":
      return { type: "rematch", side: 0 };
  }
}

export class EngineHarness implements MatchTransport, MatchClock {
  state: MatchState | null = null;
  private listener: TransportListener | null = null;
  private timer: unknown = null;
  private readonly clockNow: () => number;
  private readonly schedule: (fn: () => void, ms: number) => unknown;
  private readonly cancel: (handle: unknown) => void;

  constructor(private readonly opts: EngineHarnessOptions) {
    this.clockNow = opts.now ?? Date.now;
    this.schedule = opts.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    this.cancel = opts.cancel ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  now(): number {
    return this.clockNow();
  }

  start(listener: TransportListener): void {
    this.listener = listener;
    const now = this.now();
    const res = initState(
      {
        matchId: `dev-engine-${this.opts.seed}`,
        courseId: this.opts.questions[0]?.courseId ?? "agai",
        mode: "bot",
        rated: true,
        settings: { powerups: this.opts.loadout.length > 0, lectures: null },
        joinCode: null,
        createdAt: now,
        seed: this.opts.seed >>> 0,
        humans: [
          {
            userId: "dev-you",
            name: "you",
            avatarUrl: null,
            loadout: this.opts.loadout,
            botRating: 1500,
            botRatingN: 40,
            ranked: null,
          },
        ],
        bot: botInit(this.opts.botLevel, 1500),
        questions: this.opts.questions,
        timeScale: 1,
      },
      now,
    );
    listener.onStatus("open");
    this.apply(res, now);
    this.event({ type: "connect", side: 0 });
  }

  send(msg: ClientMessage): boolean {
    if (!this.state) return false;
    this.event(toEvent(msg));
    return true;
  }

  reconnectNow(): void {
    // Simulated reconnect: the engine marks the side connected and sends a snapshot.
    if (!this.state) return;
    this.listener?.onStatus("open");
    this.event({ type: "connect", side: 0 });
  }

  /** Simulated drop: the engine sees a disconnect; frames are lost until reconnectNow(). */
  drop(ms: number): void {
    if (!this.state || !this.listener) return;
    this.event({ type: "disconnect", side: 0 });
    const listener = this.listener;
    this.listener = null;
    listener.onStatus("reconnecting");
    this.schedule(() => {
      this.listener = listener;
      this.reconnectNow();
    }, ms);
  }

  stop(): void {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    this.listener = null;
    this.state = null;
  }

  private event(ev: EngineEvent): void {
    if (!this.state) return;
    const now = Math.max(this.now(), this.state.createdAt);
    this.apply(step(this.state, ev, now), now);
  }

  private apply(res: StepResult, now: number): void {
    this.state = res.state;
    for (const o of res.out) if (o.to === 0) this.listener?.onMessage(o.msg, now);
    for (const e of res.effects) {
      if (e.kind === "finalize" || e.kind === "cancelled") {
        // What the MatchRoom does after its D1 batch: mark finalized, then match_end.
        this.state = { ...this.state, finalized: true, endSummaries: e.kind === "finalize" ? this.fakeSummaries(this.state) : null };
        this.listener?.onMessage(matchEnd(this.state, 0, now), now);
      }
    }
    this.arm();
  }

  /** No D1 here: a plausible bot rating change so the end screen has something to count. */
  private fakeSummaries(s: MatchState): [SideEndSummary, SideEndSummary] {
    const missed = s.rounds.filter((r) => !r.sides[0].correct).length;
    const won = s.result?.winner === 0;
    const side = (i: number): SideEndSummary => ({
      ranked: null,
      bot: i === 0 ? { before: 1500, after: won ? 1531 : 1484, provisional: false } : null,
      pairCapped: false,
      missedCount: i === 0 ? missed : 0,
    });
    return [side(0), side(1)];
  }

  private arm(): void {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    if (!this.state) return;
    const at = nextDeadline(this.state);
    if (at === null) return;
    this.timer = this.schedule(() => {
      this.timer = null;
      if (!this.state) return;
      const now = this.now();
      if (now < at) return this.arm();
      this.apply(step(this.state, { type: "tick" }, now), now);
    }, Math.max(0, at - this.now()));
  }
}
