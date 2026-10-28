// How matches end: knockout, the 20-round limit, sudden death, surrender,
// disconnects, rematches, and the end-of-match view.
import { describe, expect, it } from "vitest";
import { MATCH, TIMING } from "@shared/game/config";
import { matchEnd, nextDeadline, view } from "@shared/game/engine";
import type { MatchState } from "@shared/game/types";
import { Driver, T0, botMatchInit, expectError, human, rankedInit, startedRanked } from "./helpers";

function setHp(d: Driver, side: 0 | 1, hp: number): void {
  const s: MatchState = structuredClone(d.state);
  s.players[side]!.hp = hp;
  d.state = s;
}

describe("knockout", () => {
  it("ends when the reveal ends, with the finalize effect", () => {
    const d = startedRanked();
    setHp(d, 1, 700);
    d.toPhase("question", 1);
    d.answer(0, d.correct(0), d.q.shownAt);
    d.answer(1, d.wrong(1), d.q.shownAt + 1000);
    expect(d.state.phase).toBe("reveal");
    expect(d.state.players[1]!.hp).toBe(0);
    const endsAt = d.state.phaseEndsAt!;
    d.tick(endsAt);
    expect(d.state.phase).toBe("finished");
    expect(d.state.result).toEqual({ winner: 0, reason: "hp", endedAt: endsAt });
    expect(d.last.effects).toEqual([{ kind: "finalize" }]);
    expect(d.state.cleanupAt).toBe(endsAt + MATCH.cleanupMs);
    // Ranked has no rematch.
    expect(d.state.rematchUntil).toBeNull();
    expect(nextDeadline(d.state)).toBe(endsAt + MATCH.cleanupMs);
    expect(view(d.state, 0, d.now).rematch).toBeNull();
  });

  it("match_end per side before and after finalization", () => {
    const d = startedRanked();
    setHp(d, 1, 700);
    d.toPhase("question", 1);
    d.answer(0, d.correct(0), d.q.shownAt + 2000);
    d.answer(1, d.wrong(1), d.q.shownAt + 3000);
    d.tick(d.state.phaseEndsAt!);
    const win = matchEnd(d.state, 0, d.now);
    expect(win).toMatchObject({
      type: "match_end",
      result: "win",
      reason: "hp",
      hp: { you: 6000, opponent: 0 },
      rounds: 1,
      ranked: null,
      bot: null,
      pairCapped: false,
      missedCount: 0,
      rematchUntil: null,
    });
    expect(win.summary).toEqual({ correct: 1, answered: 1, fastestMs: 2000, biggestHit: 950, powerupsUsed: [] });
    const loss = matchEnd(d.state, 1, d.now);
    expect(loss).toMatchObject({ result: "loss", missedCount: 1, summary: { correct: 0, answered: 1, fastestMs: null, biggestHit: 0 } });

    const finalized: MatchState = {
      ...d.state,
      finalized: true,
      endSummaries: [
        { ranked: { before: 1500, after: 1512, provisional: false }, bot: null, pairCapped: false, missedCount: 0 },
        { ranked: { before: 1500, after: 1488, provisional: false }, bot: null, pairCapped: false, missedCount: 1 },
      ],
    };
    expect(matchEnd(finalized, 1, d.now).ranked).toEqual({ before: 1500, after: 1488, provisional: false });
    expect(view(finalized, 0, d.now).result?.ranked?.after).toBe(1512);
    // Steps travel only with a bot rating change.
    expect(matchEnd(finalized, 0, d.now).botRatingSteps).toEqual([]);
    const botFinal: MatchState = {
      ...finalized,
      endSummaries: [
        { ranked: null, bot: { before: 1500, after: 1507.6, provisional: true }, botRatingSteps: [8], pairCapped: false, missedCount: 0 },
        { ranked: null, bot: null, pairCapped: false, missedCount: 1 },
      ],
    };
    expect(matchEnd(botFinal, 0, d.now).botRatingSteps).toEqual([8]);
    expect(matchEnd(botFinal, 1, d.now).botRatingSteps).toEqual([]);
    // A state finalized before the field existed still sends a valid payload.
    const legacy: MatchState = { ...botFinal, endSummaries: [{ ranked: null, bot: { before: 1500, after: 1507.6, provisional: true }, pairCapped: false, missedCount: 0 }, botFinal.endSummaries![1]] };
    expect(matchEnd(legacy, 0, d.now).botRatingSteps).toEqual([]);
  });
});

describe("the 20-round limit and sudden death", () => {
  it("after round 20 the higher HP wins", () => {
    const d = startedRanked();
    d.until((s) => s.phase === "arming" && s.round === 20);
    setHp(d, 0, 5000);
    d.toPhase("reveal", 20);
    d.tick(d.state.phaseEndsAt!);
    expect(d.state.result).toMatchObject({ winner: 1, reason: "rounds" });
    expect(d.state.rounds).toHaveLength(20);
  });

  it("equal HP: sudden death at the round-20 multiplier, ended by the first damage", () => {
    const d = startedRanked();
    d.until((s) => s.phase === "arming" && s.round === 21);
    expect(d.lastMsg(0, "arming").multiplier).toBe(9);
    d.toPhase("question", 21);
    d.answer(1, d.correct(1), d.q.shownAt + 10000);
    d.answer(0, d.correct(0), d.q.shownAt + 11000);
    const rec = d.state.rounds[20]!;
    expect(rec).toMatchObject({ round: 21, suddenDeath: true, multiplier: 9 });
    expect(d.state.suddenDeath).toBe(1);
    expect(rec.sides[0].damageTaken).toBe(225); // (750 - 725) * 9
    d.tick(d.state.phaseEndsAt!);
    expect(d.state.result).toMatchObject({ winner: 1, reason: "rounds" });
    expect(view(d.state, 0, d.now).suddenDeath).toBe(1);
  });

  it("a draw after 5 sudden-death rounds without damage", () => {
    const d = startedRanked();
    d.until((s) => s.phase === "finished");
    expect(d.state.rounds).toHaveLength(MATCH.maxRounds + MATCH.suddenDeathMax);
    expect(d.state.result).toMatchObject({ winner: "draw", reason: "rounds" });
    expect(d.state.suddenDeath).toBe(5);
    expect(matchEnd(d.state, 0, d.now).result).toBe("draw");
    expect(d.state.qIndex).toBe(25);
  });
});

describe("surrender", () => {
  it("is an immediate loss in any phase from intro to reveal", () => {
    for (const phase of ["intro", "arming", "question", "reveal"] as const) {
      const d = new Driver(rankedInit());
      d.connectAll();
      d.toPhase(phase);
      d.event({ type: "surrender", side: 1 });
      expect(d.state.phase).toBe("finished");
      expect(d.state.result).toMatchObject({ winner: 0, reason: "surrender" });
      expect(d.last.effects).toEqual([{ kind: "finalize" }]);
    }
  });

  it("cannot overrule a knockout during its reveal", () => {
    for (const quitter of [0, 1] as const) {
      const d = startedRanked();
      setHp(d, 1, 700);
      d.toPhase("question", 1);
      d.answer(0, d.correct(0), d.q.shownAt);
      d.answer(1, d.wrong(1), d.q.shownAt + 1000);
      expect(d.state.phase).toBe("reveal");
      expect(d.state.players[1]!.hp).toBe(0);
      d.event({ type: "surrender", side: quitter });
      expectError(d, quitter, "wrong_phase");
      expect(d.state.phase).toBe("reveal");
      d.tick(d.state.phaseEndsAt!);
      expect(d.state.result).toMatchObject({ winner: 0, reason: "hp" });
    }
  });

  it("is refused in the lobby and after the end", () => {
    const d = new Driver(rankedInit());
    d.event({ type: "connect", side: 0 });
    d.event({ type: "surrender", side: 0 });
    expectError(d, 0, "wrong_phase");
    const done = startedRanked();
    done.event({ type: "surrender", side: 0 });
    done.event({ type: "surrender", side: 1 });
    expectError(done, 1, "wrong_phase");
    expect(done.state.result?.winner).toBe(1);
  });
});

describe("disconnects", () => {
  it("rounds keep running; back within 45 s picks up where the match is", () => {
    const d = startedRanked();
    d.event({ type: "disconnect", side: 1 }, d.now + 100);
    const forfeitAt = d.now + MATCH.forfeitMs;
    expect(d.lastMsg(0, "opponent_connection")).toMatchObject({ connected: false, forfeitAt });
    expect(view(d.state, 0, d.now).opponentForfeitAt).toBe(forfeitAt);
    expect(nextDeadline(d.state)).toBe(d.state.phaseEndsAt);
    d.toPhase("question", 1);
    d.answer(0, d.correct(0), d.q.shownAt + 1000);
    d.toPhase("reveal", 1);
    expect(d.state.rounds[0]!.sides[1].timedOut).toBe(true);

    d.event({ type: "connect", side: 1 }, forfeitAt - 1);
    expect(d.state.phase).not.toBe("finished");
    const snap = d.out(1).find((m) => m.type === "snapshot");
    expect(snap?.type).toBe("snapshot");
    expect(d.lastMsg(0, "opponent_connection")).toMatchObject({ connected: true, forfeitAt: null });
    d.tick(forfeitAt + 1);
    expect(d.state.phase).not.toBe("finished");
  });

  it("away for 45 s in a row: abandon, the other side wins", () => {
    const d = startedRanked();
    const t = d.now;
    d.event({ type: "disconnect", side: 0 }, t);
    d.until((s) => s.phase === "finished");
    expect(d.state.result).toEqual({ winner: 1, reason: "abandon", endedAt: t + MATCH.forfeitMs });
    expect(d.state.rematchUntil).toBeNull();
  });

  it("a duplicate disconnect does not restart the clock", () => {
    const d = startedRanked();
    const t = d.now;
    d.event({ type: "disconnect", side: 0 }, t);
    d.event({ type: "disconnect", side: 0 }, t + 10000);
    expect(d.state.players[0].disconnectedSince).toBe(t);
  });

  it("both away for 45 s: void", () => {
    const d = startedRanked();
    const t = d.now;
    d.event({ type: "disconnect", side: 0 }, t);
    d.event({ type: "disconnect", side: 1 }, t + 20000);
    d.until((s) => s.phase === "finished");
    expect(d.state.result).toMatchObject({ winner: null, reason: "void", endedAt: t + 20000 + MATCH.forfeitMs });
    expect(matchEnd(d.state, 0, d.now).result).toBe("void");
    expect(d.last.effects).toEqual([{ kind: "finalize" }]);
  });

  it("both away, the second comes back after the first passed 45 s: the first abandons", () => {
    const d = startedRanked();
    const t = d.now;
    d.event({ type: "disconnect", side: 0 }, t);
    d.event({ type: "disconnect", side: 1 }, t + 20000);
    d.event({ type: "connect", side: 1 }, t + 50000);
    expect(d.state.phase).toBe("finished");
    expect(d.state.result).toMatchObject({ winner: 1, reason: "abandon" });
  });

  it("bot match: the human away for 45 s loses", () => {
    const d = new Driver(botMatchInit(4));
    d.connectAll();
    d.event({ type: "disconnect", side: 0 }, T0 + 1000);
    d.until((s) => s.phase === "finished");
    expect(d.state.result).toMatchObject({ winner: 1, reason: "abandon" });
  });

  it("disconnects in the lobby do not forfeit", () => {
    const d = new Driver(rankedInit());
    d.event({ type: "connect", side: 0 });
    d.event({ type: "disconnect", side: 0 }, T0 + 100);
    expect(nextDeadline(d.state)).toBe(T0 + MATCH.noShowMs);
    expect(d.lastMsg(1, "opponent_connection")).toMatchObject({ connected: false, forfeitAt: null });
    d.event({ type: "connect", side: 1 }, T0 + 200);
    expect(d.state.phase).toBe("lobby");
    d.event({ type: "connect", side: 0 }, T0 + 300);
    expect(d.state.phase).toBe("intro");
  });

  it("a snapshot goes to every (re)connect, in every phase, and validates", () => {
    const d = startedRanked();
    for (const phase of ["question", "reveal", "arming", "finished"] as const) {
      if (phase === "finished") d.event({ type: "surrender", side: 0 });
      else d.toPhase(phase);
      d.event({ type: "connect", side: 1 });
      const snap = d.out(1).find((m) => m.type === "snapshot");
      expect(snap?.type === "snapshot" && snap.phase).toBe(phase);
    }
  });
});

describe("rematch", () => {
  function finishedPrivate(): Driver {
    const d = new Driver(rankedInit({ mode: "private" }));
    d.connectAll();
    d.toPhase("arming", 1);
    d.event({ type: "surrender", side: 1 });
    return d;
  }

  it("private: both tap within 20 s, then the rematch effect", () => {
    const d = finishedPrivate();
    const until = d.now + MATCH.rematchMs;
    expect(d.state.rematchUntil).toBe(until);
    expect(matchEnd(d.state, 0, d.now).rematchUntil).toBe(until);
    d.event({ type: "rematch", side: 1 }, d.now + 1000);
    expect(d.lastMsg(0, "rematch")).toMatchObject({ state: "offered", by: "opponent", matchId: null });
    expect(d.lastMsg(1, "rematch")).toMatchObject({ state: "offered", by: "you" });
    expect(view(d.state, 0, d.now).rematch).toEqual({ you: false, opponent: true, until, matchId: null });
    d.event({ type: "rematch", side: 1 });
    expect(d.last.effects).toEqual([]);
    d.event({ type: "rematch", side: 0 }, until);
    expect(d.last.effects).toEqual([{ kind: "rematch" }]);
  });

  it("the window closes after 20 s", () => {
    const d = finishedPrivate();
    const until = d.state.rematchUntil!;
    expect(nextDeadline(d.state)).toBe(until);
    d.tick(until);
    expect(d.state.rematchUntil).toBeNull();
    expect(nextDeadline(d.state)).toBe(d.state.cleanupAt);
    d.event({ type: "rematch", side: 0 });
    expectError(d, 0, "wrong_phase");
  });

  it("bot match: the bot accepts at once", () => {
    const d = new Driver(botMatchInit(1));
    d.connectAll();
    d.toPhase("arming", 1);
    d.event({ type: "surrender", side: 0 });
    expect(d.state.rematch).toEqual([false, true]);
    d.event({ type: "rematch", side: 0 });
    expect(d.last.effects).toEqual([{ kind: "rematch" }]);
  });

  it("ranked has none", () => {
    const d = startedRanked();
    d.event({ type: "surrender", side: 0 });
    d.event({ type: "rematch", side: 1 });
    expectError(d, 1, "wrong_phase");
  });
});

describe("cancelled view", () => {
  it("snapshot and match_end say cancelled", () => {
    const d = new Driver(rankedInit({ mode: "private", humans: [human("alice")], questions: [] }));
    d.event({ type: "connect", side: 0 });
    d.event({ type: "cancel", reason: "cancelled" });
    expect(matchEnd(d.state, 0, d.now)).toMatchObject({ result: "cancelled", reason: "cancelled", ranked: null, rounds: 0 });
    d.event({ type: "connect", side: 0 });
    const snap = d.out(0)[0];
    expect(snap?.type === "snapshot" && snap.result?.result).toBe("cancelled");
    expect(snap?.type === "snapshot" && snap.opponent).toBeNull();
  });
});

describe("timing constants", () => {
  it("reveal lasts 5 s", () => {
    const d = startedRanked();
    d.toPhase("reveal", 1);
    expect(d.state.phaseEndsAt! - d.now).toBe(TIMING.revealMs);
  });
});
