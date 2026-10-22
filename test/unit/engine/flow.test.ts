// Lobby, start, rounds, answers, countdown, timeouts and errors.
import { describe, expect, it } from "vitest";
import { MATCH, TIMING } from "@shared/game/config";
import { nextDeadline, sideOf, step, view } from "@shared/game/engine";
import { Driver, T0, botMatchInit, expectError, human, makeQuestion, multiQ, questions, rankedInit, startedRanked, trueFalse } from "./helpers";

describe("lobby and start", () => {
  it("ranked: waits for both players, then intro, started effect and intro frames", () => {
    const d = new Driver(rankedInit());
    expect(d.state.phase).toBe("lobby");
    expect(d.state.noShowAt).toBe(T0 + MATCH.noShowMs);
    d.event({ type: "connect", side: 0 });
    expect(d.state.phase).toBe("lobby");
    expect(d.out(0).map((m) => m.type)).toEqual(["snapshot"]);
    d.event({ type: "connect", side: 1 }, T0 + 500);
    expect(d.state.phase).toBe("intro");
    expect(d.state.startedAt).toBe(T0 + 500);
    expect(d.state.phaseEndsAt).toBe(T0 + 500 + TIMING.introMs);
    expect(d.last.effects).toEqual([{ kind: "started" }]);
    const intro = d.lastMsg(0, "intro");
    expect(intro.opponent.name).toBe("bob");
    expect(intro.opponent.loadout).toEqual(["zeus", "aegis", "oracle"]);
    expect(intro.you.rating).toEqual({ value: 1500, provisional: false });
    expect(d.msgs(0, "opponent_connection").at(-1)).toMatchObject({ connected: true, forfeitAt: null });
  });

  it("sideOf maps users to sides", () => {
    const d = new Driver(rankedInit());
    expect(sideOf(d.state, "alice")).toBe(0);
    expect(sideOf(d.state, "bob")).toBe(1);
    expect(sideOf(d.state, "mallory")).toBeNull();
  });

  it("private: host alone, a join, both ready, then intro", () => {
    const d = new Driver(rankedInit({ mode: "private", rated: true, joinCode: "K7Q4MX", humans: [human("alice")], questions: [] }));
    expect(d.state.players[1]).toBeNull();
    expect(d.state.lobbyExpiresAt).toBe(T0 + MATCH.lobbyTtlMs);
    expect(d.state.noShowAt).toBeNull();
    d.event({ type: "connect", side: 0 });
    expect(view(d.state, 0, d.now).joinCode).toBe("K7Q4MX");

    // The host cannot join their own lobby.
    d.event({ type: "join", player: human("alice"), questions: questions() });
    expect(d.state.players[1]).toBeNull();

    d.event({ type: "join", player: human("bob"), questions: questions() }, T0 + 1000);
    expect(d.state.players[1]?.name).toBe("bob");
    expect(d.state.noShowAt).toBe(T0 + 1000 + MATCH.noShowMs);
    expect(d.lastMsg(0, "lobby").players.map((p) => p.name)).toEqual(["alice", "bob"]);

    // A second join is ignored.
    d.event({ type: "join", player: human("carol"), questions: questions() });
    expect(d.state.players[1]?.name).toBe("bob");

    d.event({ type: "connect", side: 1 });
    d.event({ type: "ready", side: 0 });
    expect(d.state.phase).toBe("lobby");
    expect(d.lastMsg(1, "lobby").players.map((p) => p.ready)).toEqual([true, false]);
    d.event({ type: "ready", side: 1 });
    expect(d.state.phase).toBe("intro");
    expect(d.state.lobbyExpiresAt).toBeNull();
  });

  it("private lobby nobody joins expires after 15 minutes", () => {
    const d = new Driver(rankedInit({ mode: "private", humans: [human("alice")], questions: [] }));
    d.event({ type: "connect", side: 0 });
    expect(nextDeadline(d.state)).toBe(T0 + MATCH.lobbyTtlMs);
    d.tick(T0 + MATCH.lobbyTtlMs);
    expect(d.state.phase).toBe("cancelled");
    expect(d.state.result).toEqual({ winner: null, reason: "expired", endedAt: T0 + MATCH.lobbyTtlMs });
    expect(d.last.effects).toEqual([{ kind: "cancelled", reason: "expired" }]);
    expect(nextDeadline(d.state)).toBe(T0 + MATCH.lobbyTtlMs + MATCH.cleanupMs);
  });

  it("private: a joined player who never connects cancels with no_show", () => {
    const d = new Driver(rankedInit({ mode: "private", humans: [human("alice")], questions: [] }));
    d.event({ type: "connect", side: 0 });
    d.event({ type: "join", player: human("bob"), questions: questions() }, T0 + 2000);
    d.tick(T0 + 2000 + MATCH.noShowMs);
    expect(d.state.phase).toBe("cancelled");
    expect(d.state.result?.reason).toBe("no_show");
  });

  it("private: both connected but not ready keeps the lobby until it expires", () => {
    const d = new Driver(rankedInit({ mode: "private", humans: [human("alice")], questions: [] }));
    d.connectAll();
    d.event({ type: "join", player: human("bob"), questions: questions() });
    d.event({ type: "connect", side: 1 });
    d.tick(T0 + MATCH.noShowMs);
    expect(d.state.phase).toBe("lobby");
    expect(d.state.noShowAt).toBeNull();
    d.tick(T0 + MATCH.lobbyTtlMs);
    expect(d.state.result?.reason).toBe("expired");
  });

  it("ranked: a player who never connects cancels the match with no_show", () => {
    const d = new Driver(rankedInit());
    d.event({ type: "connect", side: 0 });
    d.tick(T0 + MATCH.noShowMs - 1);
    expect(d.state.phase).toBe("lobby");
    d.tick(T0 + MATCH.noShowMs);
    expect(d.state.phase).toBe("cancelled");
    expect(d.state.result?.reason).toBe("no_show");
    expect(d.effects).toEqual([{ kind: "cancelled", reason: "no_show" }]);
  });

  it("rematch of a private match: both humans at init start without Ready", () => {
    const d = new Driver(rankedInit({ mode: "private" }));
    d.connectAll();
    expect(d.state.phase).toBe("intro");
  });

  it("bot match starts when the human connects", () => {
    const d = new Driver(botMatchInit(4));
    expect(d.state.players[1]?.kind).toBe("bot");
    expect(d.state.players[1]?.name).toBe("Pandora");
    expect(d.state.players[1]?.loadout).toHaveLength(3);
    d.event({ type: "connect", side: 0 });
    expect(d.state.phase).toBe("intro");
    expect(d.lastMsg(0, "intro").opponent).toMatchObject({ kind: "bot", botLevel: 4, rating: { value: 1500, provisional: false } });
    expect(d.lastMsg(0, "intro").you.rating).toEqual({ value: 1500, provisional: false });
  });

  it("cancel works in the lobby only", () => {
    const d = new Driver(rankedInit({ mode: "private", humans: [human("alice")], questions: [] }));
    d.event({ type: "cancel", reason: "cancelled" });
    expect(d.state.phase).toBe("cancelled");
    expect(d.last.effects).toEqual([{ kind: "cancelled", reason: "cancelled" }]);

    const live = startedRanked();
    live.event({ type: "cancel", reason: "cancelled" });
    expect(live.state.phase).toBe("arming");
    expect(live.last.effects).toEqual([]);
  });

  it("ready after the start is an error", () => {
    const d = startedRanked();
    d.event({ type: "ready", side: 0 });
    expectError(d, 0, "wrong_phase");
  });

  it("drops loadouts when power-ups are off and uses the shorter arming window", () => {
    const d = new Driver(rankedInit({ settings: { powerups: false, lectures: null } }));
    expect(d.state.players[0].loadout).toEqual([]);
    d.connectAll();
    d.toPhase("arming", 1);
    expect(d.state.phaseEndsAt! - d.now).toBe(TIMING.armingMsNoPowerups);
    expect(d.lastMsg(0, "arming").armable).toEqual([]);
    d.arm(0, "zeus");
    expectError(d, 0, "powerup_unavailable");
  });

  it("dedupes and trims a malformed loadout", () => {
    const d = new Driver(rankedInit({ humans: [human("alice", { loadout: ["zeus", "zeus", "aegis", "oracle", "hermes"] }), human("bob")] }));
    expect(d.state.players[0].loadout).toEqual(["zeus", "aegis", "oracle"]);
  });

  it("applies the test-mode time scale to phases, timers and forfeits", () => {
    const d = new Driver(rankedInit({ timeScale: 0.2 }));
    d.connectAll();
    expect(d.state.phaseEndsAt! - d.now).toBe(1000); // 4000 * 0.2 = 800, floored to 1000
    d.toPhase("question", 1);
    expect(d.q.timerMs).toBe(4000);
    d.event({ type: "disconnect", side: 1 });
    expect(d.lastMsg(0, "opponent_connection").forfeitAt).toBe(d.now + 9000);
  });
});

describe("a round", () => {
  it("skips the banner when nobody armed, and sends each side its own opaque options", () => {
    const d = startedRanked();
    const arming = d.lastMsg(0, "arming");
    expect(arming).toMatchObject({ round: 1, multiplier: 1, armable: ["zeus", "aegis"] });
    expect(arming.phaseEndsAt - d.now).toBe(TIMING.armingMs);
    d.tick(arming.phaseEndsAt);
    expect(d.state.phase).toBe("question");
    expect(d.msgs(0, "banner")).toHaveLength(0);
    const q0 = d.lastMsg(0, "question");
    const q1 = d.lastMsg(1, "question");
    expect(q0.options).toHaveLength(4);
    expect(q0.options.map((o) => o.id).some((id) => ["a", "b", "c", "d"].includes(id))).toBe(false);
    expect(q0.options.map((o) => o.id)).not.toEqual(q1.options.map((o) => o.id));
    expect(q0.deadline - q0.shownAt).toBe(20000);
    expect(JSON.stringify(q0)).not.toContain('"key"');
  });

  it("first answer starts the 5 s countdown; both answered ends the round at once", () => {
    const d = startedRanked();
    d.toPhase("question", 1);
    const shown = d.q.shownAt;
    d.answer(0, d.correct(0), shown + 4000);
    expect(d.lastMsg(0, "answer_ack").countdownEnd).toBe(shown + 9000);
    expect(d.lastMsg(1, "opponent_answered").countdownEnd).toBe(shown + 9000);
    expect(d.state.phaseEndsAt).toBe(shown + 9000);
    expect(view(d.state, 1, d.now).yourDeadline).toBe(shown + 9000);
    expect(view(d.state, 1, d.now).opponentAnswered).toBe(true);
    expect(view(d.state, 0, d.now).yourAnswer).toEqual(d.correct(0));

    d.answer(1, d.wrong(1), shown + 6000);
    expect(d.lastMsg(1, "answer_ack").countdownEnd).toBeNull();
    expect(d.state.phase).toBe("reveal");
    const r0 = d.lastMsg(0, "reveal");
    expect(r0).toMatchObject({ yourScore: 900, opponentScore: 0, damageToOpponent: 900, damageToYou: 0, yourCorrect: true, opponentCorrect: false });
    expect(r0.yourMs).toBe(4000);
    expect(r0.hp).toEqual({ you: 6000, opponent: 5100 });
    expect(r0.key).toEqual(d.correct(0));
    const r1 = d.lastMsg(1, "reveal");
    expect(r1.savedToMissed).toBe(true);
    expect(r1.opponentAnswer).toEqual(d.correct(1));
    expect(d.state.phaseEndsAt).toBe(shown + 6000 + TIMING.revealMs);
  });

  it("a wrong first answer starts the countdown too", () => {
    const d = startedRanked();
    d.toPhase("question", 1);
    d.answer(0, d.wrong(0), d.q.shownAt + 1000);
    expect(d.q.countdownEnd).toBe(d.q.shownAt + 6000);
  });

  it("the countdown never extends past the deadline", () => {
    const d = startedRanked();
    d.toPhase("question", 1);
    d.answer(0, d.correct(0), d.q.deadline - 2000);
    expect(d.q.countdownEnd).toBe(d.q.deadline);
  });

  it("the second answer is accepted up to countdown end plus grace, then the round closes as a timeout", () => {
    const d = startedRanked();
    d.toPhase("question", 1);
    const shown = d.q.shownAt;
    d.answer(0, d.correct(0), shown + 1000);
    const end = shown + 6000;
    expect(nextDeadline(d.state)).toBe(end + TIMING.graceMs);

    // Exactly at the end of grace: accepted.
    const accepted = new Driver(rankedInit());
    accepted.state = d.state;
    accepted.now = d.now;
    accepted.answer(1, accepted.correct(1), end + TIMING.graceMs);
    expect(accepted.state.phase).toBe("reveal");
    expect(accepted.lastMsg(1, "reveal").yourCorrect).toBe(true);

    // One millisecond later: the round has closed.
    d.answer(1, d.correct(1), end + TIMING.graceMs + 1);
    expect(d.state.phase).toBe("reveal");
    expectError(d, 1, "round_closed");
    const rec = d.state.rounds[0]!;
    expect(rec.sides[1]).toMatchObject({ timedOut: true, timedOutAfterCountdown: true, correct: false, score: 0 });
    expect(rec.sides[0].score).toBe(975);
    expect(d.lastMsg(1, "reveal").damageToYou).toBe(975);
  });

  it("both time out: no damage, round ends at deadline plus grace", () => {
    const d = startedRanked();
    d.toPhase("question", 1);
    const deadline = d.q.deadline;
    expect(nextDeadline(d.state)).toBe(deadline + TIMING.graceMs);
    d.tick(deadline + TIMING.graceMs);
    expect(d.state.phase).toBe("reveal");
    const rec = d.state.rounds[0]!;
    expect(rec.sides.map((s) => [s.timedOut, s.timedOutAfterCountdown, s.damageTaken])).toEqual([
      [true, false, 0],
      [true, false, 0],
    ]);
    expect(d.lastMsg(0, "reveal")).toMatchObject({ yourAnswer: null, opponentAnswer: null, savedToMissed: true });
  });

  it("goes back to arming after the reveal, with the multiplier rising from round 5", () => {
    const d = startedRanked();
    d.until((s) => s.phase === "arming" && s.round === 6);
    expect(d.msgs(0, "arming").map((m) => m.multiplier)).toEqual([1, 1, 1, 1, 1.5, 2]);
    d.toPhase("question", 6);
    expect(d.lastMsg(0, "question").multiplier).toBe(2);
    d.answer(0, d.correct(0), d.q.shownAt + 4000);
    d.answer(1, d.wrong(1), d.q.shownAt + 5000);
    expect(d.lastMsg(1, "reveal").damageToYou).toBe(1800);
  });

  it("rejects malformed and out-of-turn answers without changing the state", () => {
    const d = startedRanked();
    d.answer(0, { kind: "options", ids: ["zzzzzz"] });
    expectError(d, 0, "wrong_phase");
    d.toPhase("question", 1);
    const before = d.state;

    d.answer(0, { kind: "options", ids: ["zzzzzz"] });
    expectError(d, 0, "bad_message");
    expect(d.state).toEqual(before);

    d.answer(0, { kind: "bool", value: true });
    expectError(d, 0, "bad_message");

    // Another side's opaque ids are not valid for this side.
    const foreign = d.correct(1);
    if (foreign.kind === "options" && !d.q.order[0].includes(foreign.ids[0]!)) {
      d.answer(0, foreign);
      expectError(d, 0, "bad_message");
    }

    // Two options on a single-choice question.
    d.answer(0, { kind: "options", ids: d.q.order[0].slice(0, 2) });
    expectError(d, 0, "bad_message");

    d.event({ type: "answer", side: 0, round: 2, answer: d.correct(0) });
    expectError(d, 0, "round_closed");
    expect(d.state).toEqual(before);

    d.answer(0, d.correct(0));
    d.answer(0, d.correct(0));
    expectError(d, 0, "already_answered");
  });

  it("refuses events from a side with no human", () => {
    const d = new Driver(botMatchInit(4));
    d.connectAll();
    d.event({ type: "surrender", side: 1 });
    expect(d.state.phase).toBe("intro");
    const lobby = new Driver(rankedInit({ mode: "private", humans: [human("alice")], questions: [] }));
    const res = step(lobby.state, { type: "ready", side: 1 }, T0);
    expect(res.out).toEqual([]);
    expect(res.state).toEqual(lobby.state);
  });

  it("answers multi-select as a set and true/false as a bool", () => {
    const d = startedRanked({ questions: [multiQ(), trueFalse(false), ...questions(23)] });
    d.toPhase("question", 1);
    const correct = d.correct(0);
    expect(correct.kind).toBe("options");
    if (correct.kind === "options") d.answer(0, { kind: "options", ids: [...correct.ids].reverse() });
    d.answer(1, { kind: "options", ids: d.q.order[1].slice() });
    expect(d.state.rounds[0]!.sides.map((s) => s.correct)).toEqual([true, false]);
    expect(d.lastMsg(0, "question").timerMs).toBe(30000);

    d.toPhase("question", 2);
    expect(d.lastMsg(0, "question").options).toEqual([]);
    expect(d.lastMsg(0, "question").statement).toBe("It is so.");
    d.answer(0, { kind: "bool", value: false });
    d.answer(1, { kind: "bool", value: true });
    expect(d.state.rounds[1]!.sides.map((s) => s.correct)).toEqual([true, false]);
  });

  it("keeps authored order when shuffle is off, and always shuffles order items", () => {
    const fixed = makeQuestion({ shuffle: false });
    const d = startedRanked({ questions: [fixed, ...questions(24)] });
    d.toPhase("question", 1);
    expect(d.q.order[0].map((id) => d.q.idMap[0][id])).toEqual(["a", "b", "c", "d"]);
  });

  it("handles order and match questions end to end", () => {
    const order = makeQuestion({ type: "order", key: { kind: "order", ids: ["a", "b", "c", "d"] }, shuffle: false });
    const match = makeQuestion({
      type: "match",
      options: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ],
      targets: [
        { id: "a", text: "Target named like an item" },
        { id: "t2", text: "T2" },
      ],
      key: { kind: "match", map: { a: "a", b: "t2" } },
    });
    const d = startedRanked({ questions: [order, match, ...questions(23)] });
    d.toPhase("question", 1);
    const shuffledSomewhere = [0, 1].some((side) => d.q.order[side as 0 | 1].map((id) => d.q.idMap[side as 0 | 1][id]).join("") !== "abcd");
    expect(shuffledSomewhere).toBe(true);
    d.answer(0, d.correct(0));
    d.answer(1, { kind: "order", ids: d.q.order[1].slice(0, 3) });
    expectError(d, 1, "bad_message");
    d.answer(1, { kind: "order", ids: [...d.q.order[1]].reverse() });
    expect(d.state.rounds[0]!.sides[0].correct).toBe(true);

    d.toPhase("question", 2);
    expect(d.lastMsg(0, "question").targets).toHaveLength(2);
    d.answer(0, d.correct(0));
    expect(d.lastMsg(0, "answer_ack")).toBeDefined();
    const items = d.q.order[1];
    const targets = d.q.targetOrder![1];
    d.answer(1, { kind: "match", map: { [items[0]!]: targets[0]!, [items[1]!]: targets[0]! } });
    expect(d.state.rounds[1]!.sides[0].correct).toBe(true);
    expect(d.state.rounds[1]!.sides[1].correct).toBe(false);
    expect(d.lastMsg(0, "reveal").key).toEqual(d.correct(0));
  });

  it("wraps around when the question list runs out", () => {
    const d = startedRanked({ questions: questions(2) });
    d.until((s) => s.phase === "question" && s.round === 3);
    expect(d.q.question.id).toBe(d.state.questions[0]!.id);
  });
});

describe("deadlines", () => {
  it("a second tick at the same time changes nothing", () => {
    const d = startedRanked();
    d.toPhase("question", 1);
    const t = nextDeadline(d.state)!;
    d.tick(t);
    const after = d.state;
    d.tick(t);
    expect(d.state).toEqual(after);
    expect(d.last.out).toEqual([]);
  });

  it("a late alarm processes due deadlines in time order", () => {
    const d = new Driver(botMatchInit(8, { seed: 7 }));
    d.connectAll();
    d.toPhase("question", 1);
    const plan = d.state.players[1]!.bot!.q!;
    expect(plan.answerAt).not.toBeNull();
    // Tick long after the round end: the bot's answer lands first, at its planned time.
    d.tick(d.q.deadline + 60000);
    const rec = d.state.rounds[0]!;
    expect(rec.sides[1].answeredAt).toBe(plan.answerAt);
    expect(rec.firstSide).toBe(1);
    expect(d.state.phase).toBe("reveal");
  });

  it("nextDeadline follows the phase", () => {
    const d = startedRanked();
    expect(nextDeadline(d.state)).toBe(d.state.phaseEndsAt);
    d.toPhase("question", 1);
    expect(nextDeadline(d.state)).toBe(d.q.deadline + TIMING.graceMs);
    d.tick(d.q.deadline + TIMING.graceMs);
    expect(nextDeadline(d.state)).toBe(d.state.phaseEndsAt);
  });

  it("does not let a stale invalid event block due transitions", () => {
    const d = startedRanked();
    // An arm frame arrives after the arming window ended: the window closes first.
    d.arm(0, "zeus", d.state.phaseEndsAt! + 10);
    expect(d.state.phase).toBe("question");
    expectError(d, 0, "wrong_phase");
  });
});
