// Match screen reducer: phase flow, optimistic taps, stale frames, spent
// power-ups, reveal effects, snapshots and rematch.
import { describe, expect, it } from "vitest";
import type { ServerMessage, SnapshotMessage, PlayerView } from "@shared/protocol";
import {
  MatchStore,
  canArm,
  canSurrender,
  canUseQuick,
  initialMatchState,
  matchReducer,
  type MatchAction,
  type MatchUiState,
} from "../../../src/client/match/state";
import { POWERUPS } from "@shared/game/config";

const T = 1_800_000_000_000;

const player = (name: string, over: Partial<PlayerView> = {}): PlayerView => ({
  kind: "human",
  userId: name,
  name,
  avatarUrl: null,
  botLevel: null,
  hp: 6000,
  loadout: ["zeus", "aegis", "oracle"],
  used: [],
  phoenixUsed: false,
  connected: true,
  ready: true,
  rating: { value: 1500, provisional: true },
  ...over,
});

function run(msgs: (ServerMessage | MatchAction)[], start: MatchUiState = initialMatchState()): MatchUiState {
  return msgs.reduce<MatchUiState>(
    (s, m) => matchReducer(s, "serverNow" in m ? { type: "server", msg: m } : m),
    start,
  );
}

const intro: ServerMessage = {
  type: "intro",
  serverNow: T,
  phaseEndsAt: T + 4000,
  you: player("you"),
  opponent: player("them", { loadout: ["nemesis", "hermes", "phoenix"] }),
  mode: "ranked",
  rated: true,
};

const arming = (round: number, at = T + 4000): ServerMessage => ({
  type: "arming",
  serverNow: at,
  round,
  multiplier: round <= 4 ? 1 : 1 + 0.5 * (round - 4),
  phaseEndsAt: at + 3000,
  armable: ["zeus", "aegis"],
});

const question = (round: number, at: number, questionType: "single" | "multi" | "truefalse" = "single"): ServerMessage => ({
  type: "question",
  serverNow: at,
  questionType,
  round,
  prompt: questionType === "truefalse" ? null : "Which?",
  statement: questionType === "truefalse" ? "It is so." : null,
  codeLang: null,
  options:
    questionType === "truefalse"
      ? []
      : [
          { id: "o1", text: "One" },
          { id: "o2", text: "Two" },
          { id: "o3", text: "Three" },
        ],
  targets: null,
  timerMs: 20000,
  shownAt: at,
  deadline: at + 20000,
  multiplier: 1,
});

const reveal = (round: number, at: number, over: Partial<Extract<ServerMessage, { type: "reveal" }>> = {}): ServerMessage => ({
  type: "reveal",
  serverNow: at,
  round,
  key: { kind: "options", ids: ["o1"] },
  yourAnswer: { kind: "options", ids: ["o1"] },
  opponentAnswer: { kind: "options", ids: ["o2"] },
  yourCorrect: true,
  opponentCorrect: false,
  yourMs: 3000,
  opponentMs: 6000,
  yourScore: 925,
  opponentScore: 0,
  multiplier: 1,
  damageToYou: 0,
  damageToOpponent: 925,
  capped: false,
  zeus: null,
  aegis: null,
  phoenix: null,
  hp: { you: 6000, opponent: 5075 },
  whyShort: "Because.",
  savedToMissed: false,
  phaseEndsAt: at + 5000,
  ...over,
});

describe("match reducer", () => {
  it("walks intro, arming, question, answer, reveal", () => {
    const tQ = T + 7000;
    let s = run([intro, arming(1)]);
    expect(s.phase).toBe("arming");
    expect(s.round).toBe(1);
    expect(s.phaseStartedAt).toBe(T + 4000);
    expect(canArm(s, "zeus")).toBe(true);
    expect(canArm(s, "nemesis")).toBe(false);

    s = run([question(1, tQ)], s);
    expect(s.phase).toBe("question");
    expect(s.question?.type).toBe("single");
    expect(s.yourDeadline).toBe(tQ + 20000);

    s = run([{ type: "local_answer", round: 1, answer: { kind: "options", ids: ["o1"] } }], s);
    expect(s.yourAnswer).toEqual({ kind: "options", ids: ["o1"] });
    // A second tap does not replace the locked answer.
    s = run([{ type: "local_answer", round: 1, answer: { kind: "options", ids: ["o2"] } }], s);
    expect(s.yourAnswer).toEqual({ kind: "options", ids: ["o1"] });

    s = run([{ type: "answer_ack", serverNow: tQ + 3000, round: 1, countdownEnd: tQ + 8000 }], s);
    expect(s.countdownEnd).toBe(tQ + 8000);

    s = run([reveal(1, tQ + 6000)], s);
    expect(s.phase).toBe("reveal");
    expect(s.opponent?.hp).toBe(5075);
    expect(s.revealFx).toMatchObject({ live: true, before: { you: 6000, opponent: 6000 } });
    expect(s.reveal?.damageToOpponent).toBe(925);
  });

  it("takes the question type from questionType, not the message tag", () => {
    const s = run([intro, arming(1), question(1, T + 7000, "multi")]);
    expect(s.question?.type).toBe("multi");
  });

  it("drops the deadline to the countdown when the opponent answers first", () => {
    const tQ = T + 7000;
    const s = run([intro, arming(1), question(1, tQ), { type: "opponent_answered", serverNow: tQ + 4000, round: 1, countdownEnd: tQ + 9000 }]);
    expect(s.opponentAnswered).toBe(true);
    expect(s.yourDeadline).toBe(tQ + 9000);
  });

  it("ignores frames for older rounds", () => {
    const s = run([intro, arming(2), question(1, T + 100), { type: "armed_ack", serverNow: T, round: 1, powerup: "zeus" }]);
    expect(s.phase).toBe("arming");
    expect(s.round).toBe(2);
    expect(s.armed).toBeNull();
  });

  it("marks banner items, quick power-ups and Phoenix as used", () => {
    const tQ = T + 8500;
    let s = run([
      intro,
      arming(1),
      { type: "local_arm", round: 1, powerup: "zeus" },
      { type: "armed_ack", serverNow: T + 5000, round: 1, powerup: "zeus" },
      {
        type: "banner",
        serverNow: T + 7000,
        round: 1,
        phaseEndsAt: T + 8500,
        items: [
          { who: "you", powerup: "zeus", outcome: "cancelled" },
          { who: "opponent", powerup: "nemesis", outcome: "nemesis_hit" },
        ],
      },
    ]);
    expect(s.phase).toBe("banner");
    expect(s.you?.used).toEqual(["zeus"]);
    expect(s.opponent?.used).toEqual(["nemesis"]);
    expect(s.banner?.live).toBe(true);

    s = run([question(1, tQ), { type: "opponent_powerup", serverNow: tQ + 500, round: 1, powerup: "hermes" }], s);
    expect(s.opponent?.used).toContain("hermes");
    expect(s.quickFx).toMatchObject({ who: "opponent", powerup: "hermes", round: 1, at: tQ + 500 });

    s = run([reveal(1, tQ + 9000, { phoenix: "opponent", hp: { you: 6000, opponent: 1 } })], s);
    expect(s.opponent?.used).toContain("phoenix");
    expect(s.opponent?.phoenixUsed).toBe(true);
  });

  it("applies Oracle hides only from the server's result", () => {
    const tQ = T + 7000;
    let s = run([intro, arming(1), question(1, tQ), { type: "local_use", round: 1, powerup: "oracle" }]);
    expect(s.quickPending).toBe("oracle");
    expect(s.hidden).toEqual([]);
    s = run([{ type: "powerup_result", serverNow: tQ + 900, round: 1, powerup: "oracle", hidden: ["o2"] }], s);
    expect(s.hidden).toEqual(["o2"]);
    expect(s.quickUsed).toBe("oracle");
    expect(s.quickPending).toBeNull();
    expect(s.you?.used).toContain("oracle");
  });

  it("reverts optimistic taps on errors", () => {
    let s = run([intro, arming(1), { type: "local_arm", round: 1, powerup: "zeus" }]);
    expect(s.armed).toBe("zeus");
    s = run([{ type: "error", serverNow: T + 5000, code: "powerup_unavailable", message: "no" }], s);
    expect(s.armed).toBeNull();

    const tQ = T + 7000;
    s = run([question(1, tQ), { type: "local_answer", round: 1, answer: { kind: "bool", value: true } }], s);
    s = run([{ type: "error", serverNow: tQ + 21000, code: "round_closed", message: "late" }], s);
    expect(s.answerRejected).toBe(true);
  });

  it("guards quick power-ups: one per round, not after answering, Oracle not on true/false", () => {
    const tQ = T + 7000;
    const eligible = POWERUPS.oracle.eligibleTypes;
    let s = run([intro, arming(1), question(1, tQ)]);
    expect(canUseQuick(s, "oracle", eligible, tQ + 1000)).toBe(true);
    expect(canUseQuick(s, "hermes", eligible, tQ + 1000)).toBe(false); // not in the loadout
    expect(canUseQuick(s, "oracle", eligible, tQ + 25000)).toBe(false); // past the deadline

    s = run([intro, arming(1), { type: "armed_ack", serverNow: T + 5000, round: 1, powerup: "aegis" }, question(1, tQ)]);
    // An armed blind power-up uses up this round's one power-up.
    expect(canUseQuick(s, "oracle", eligible, tQ + 1000)).toBe(false);

    s = run([intro, arming(1), question(1, tQ, "truefalse")]);
    expect(canUseQuick(s, "oracle", eligible, tQ + 1000)).toBe(false);
  });

  it("rebuilds the screen from a snapshot without replaying effects", () => {
    const snap: SnapshotMessage = {
      type: "snapshot",
      serverNow: T,
      matchId: "m1",
      courseId: "agai",
      mode: "bot",
      rated: true,
      settings: { powerups: true, lectures: null },
      phase: "reveal",
      phaseEndsAt: T + 3000,
      round: 4,
      suddenDeath: 0,
      multiplier: 1,
      you: player("you", { hp: 5000 }),
      opponent: player("bot", { kind: "bot", hp: 4000 }),
      joinCode: null,
      armable: [],
      armed: null,
      banner: null,
      question: { ...(question(4, T - 9000) as Extract<ServerMessage, { type: "question" }>), type: "multi" },
      hidden: [],
      quickUsed: null,
      yourAnswer: null,
      opponentAnswered: false,
      countdownEnd: null,
      yourDeadline: null,
      lastReveal: (() => {
        const { type: _t, serverNow: _n, ...r } = reveal(4, T - 1000) as Extract<ServerMessage, { type: "reveal" }>;
        void _t;
        void _n;
        return r;
      })(),
      result: null,
      rematch: null,
      opponentForfeitAt: null,
    };
    const s = run([snap]);
    expect(s.loaded).toBe(true);
    expect(s.phase).toBe("reveal");
    expect(s.question?.type).toBe("multi");
    expect(s.reveal).not.toBeNull();
    expect(s.revealFx?.live).toBe(false);
    expect(s.phaseStartedAt).toBeNull();
  });

  it("tracks the disconnect clock and the end of the match", () => {
    let s = run([intro, arming(3), { type: "opponent_connection", serverNow: T + 5000, connected: false, forfeitAt: T + 50000 }]);
    expect(s.opponent?.connected).toBe(false);
    expect(s.opponentForfeitAt).toBe(T + 50000);
    expect(canSurrender({ ...s, status: "open" })).toBe(true);

    s = run(
      [
        {
          type: "match_end",
          serverNow: T + 60000,
          result: "win",
          reason: "abandon",
          hp: { you: 6000, opponent: 4000 },
          rounds: 3,
          ranked: { before: 1500, after: 1660, provisional: true },
          bot: null,
          pairCapped: false,
          summary: { correct: 2, answered: 3, fastestMs: 2100, biggestHit: 900, powerupsUsed: [] },
          missedCount: 1,
          rematchUntil: null,
        },
      ],
      s,
    );
    expect(s.phase).toBe("finished");
    expect(s.opponentForfeitAt).toBeNull();
    expect(s.result?.reason).toBe("abandon");
    expect(canSurrender({ ...s, status: "open" })).toBe(false);
  });

  it("follows the rematch handshake", () => {
    let s = run([
      {
        type: "match_end",
        serverNow: T,
        result: "loss",
        reason: "hp",
        hp: { you: 0, opponent: 10 },
        rounds: 9,
        ranked: null,
        bot: { before: 1500, after: 1480, provisional: false },
        pairCapped: false,
        summary: { correct: 4, answered: 9, fastestMs: 2000, biggestHit: 900, powerupsUsed: ["zeus"] },
        missedCount: 5,
        rematchUntil: T + 20000,
      },
    ]);
    expect(s.rematch).toEqual({ you: false, opponent: false, until: T + 20000, matchId: null });
    s = run([{ type: "local_rematch" }, { type: "rematch", serverNow: T + 1000, state: "offered", by: "you", matchId: null }], s);
    expect(s.rematch?.you).toBe(true);
    s = run([{ type: "rematch", serverNow: T + 2000, state: "accepted", by: "opponent", matchId: "m2" }], s);
    expect(s.rematch).toMatchObject({ you: true, opponent: true, matchId: "m2" });
  });

  it("store reports the state before each action and resets", () => {
    const store = new MatchStore();
    let calls = 0;
    store.subscribe(() => calls++);
    const { prev, next } = store.dispatch({ type: "server", msg: intro });
    expect(prev.phase).toBeNull();
    expect(next.phase).toBe("intro");
    store.dispatch({ type: "reset" });
    expect(store.getState().phase).toBeNull();
    expect(calls).toBe(2);
  });
});
