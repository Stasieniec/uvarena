// The UX review fixes that are plain functions: the reveal's damage line, the
// worst hit of a multiplier, the no-show line, the snapshot's noShowAt, and the
// missed-question option order that must not move between stages.
import { describe, expect, it } from "vitest";
import { SCORING } from "@shared/game/config";
import { stableOrder } from "../../../src/client/lib/answers";
import { endReasonLine } from "../../../src/client/match/copy";
import { damageLine, hitLine, hitNote, worstHit, type DamageFacts } from "../../../src/client/match/format";
import { initialMatchState, reduceServer } from "../../../src/client/match/state";

const base: DamageFacts = {
  yourCorrect: true,
  opponentCorrect: false,
  yourScore: 900,
  opponentScore: 0,
  multiplier: 2,
  damageToYou: 0,
  damageToOpponent: 1800,
  capped: false,
  bibi: null,
  shield: null,
};

describe("hitLine and hitNote", () => {
  it("names both scores and the multiplier, opponent by name", () => {
    expect(hitLine(base, "kvdberg", SCORING)).toBe("You 900 · kvdberg 0 · x2");
  });

  it("adds Bibi only when the attacker had it", () => {
    expect(hitLine({ ...base, bibi: "you" }, "kvdberg", SCORING)).toBe("You 900 · kvdberg 0 · x2 · Bibi x2");
    expect(hitLine({ ...base, bibi: "opponent" }, "kvdberg", SCORING)).toBe("You 900 · kvdberg 0 · x2");
  });

  it("is null without damage", () => {
    expect(hitLine({ ...base, damageToOpponent: 0 }, "kvdberg", SCORING)).toBeNull();
    expect(hitNote({ ...base, damageToOpponent: 0 }, SCORING)).toBeNull();
  });

  it("notes the cap and Shield on the victim", () => {
    expect(hitNote(base, SCORING)).toBeNull();
    expect(hitNote({ ...base, capped: true, bibi: "you", shield: "opponent" }, SCORING)).toBe(`Capped at 4,500 · Halved by Shield`);
    expect(hitNote({ ...base, shield: "you" }, SCORING)).toBeNull();
  });
});

describe("damageLine", () => {
  it("accounts for a plain hit", () => {
    expect(damageLine(base, SCORING)).toBe("You 900 · Them 0 · x2 = 1,800");
  });

  it("works the other way round, with a half multiplier", () => {
    const r = { ...base, yourCorrect: false, opponentCorrect: true, yourScore: 0, opponentScore: 842, multiplier: 2.5, damageToOpponent: 0, damageToYou: 2105 };
    expect(damageLine(r, SCORING)).toBe("You 0 · Them 842 · x2.5 = 2,105");
  });

  it("names Bibi and the cap when they changed the number", () => {
    const r = { ...base, multiplier: 3, bibi: "you" as const, capped: true, damageToOpponent: 4500 };
    expect(damageLine(r, SCORING)).toBe("You 900 · Them 0 · x3 · Bibi x2 = 5,400, capped at 4,500");
  });

  it("names Shield with the damage that got through", () => {
    const r = { ...base, shield: "opponent" as const, damageToOpponent: 900 };
    expect(damageLine(r, SCORING)).toBe("You 900 · Them 0 · x2 = 1,800, Shield halves it to 900");
  });

  it("says when nothing happened", () => {
    expect(damageLine({ ...base, yourCorrect: false, yourScore: 0, damageToOpponent: 0 }, SCORING)).toBe("Both wrong. No damage.");
    expect(damageLine({ ...base, opponentCorrect: true, opponentScore: 900, damageToOpponent: 0 }, SCORING)).toBe("You 900 · Them 900 · No damage");
  });

  it("uses no em-dash or hyphen-minus that could read as a range", () => {
    expect(damageLine(base, SCORING)).not.toMatch(/[\u2014-]/);
  });
});

describe("worstHit", () => {
  it("is a perfect score times the multiplier, capped", () => {
    expect(worstHit(2, SCORING.maxScore, SCORING.roundCap)).toBe(2000);
    expect(worstHit(4, SCORING.maxScore, SCORING.roundCap)).toBe(SCORING.roundCap);
  });
});

describe("endReasonLine", () => {
  it("names who never showed up", () => {
    expect(endReasonLine("no_show", "cancelled", "tomek")).toBe("tomek never showed up. No rating change.");
    expect(endReasonLine("no_show", "cancelled")).toBe("Your opponent never showed up. No rating change.");
  });
});

describe("stableOrder", () => {
  it("keeps the first order however the server reshuffles", () => {
    const first = ["c", "a", "b"];
    const refetched = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(stableOrder(refetched, first).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("puts unknown ids last", () => {
    expect(stableOrder([{ id: "x" }, { id: "a" }], ["a"]).map((r) => r.id)).toEqual(["a", "x"]);
  });
});

describe("noShowAt in the client state", () => {
  it("comes from the snapshot and clears at the intro", () => {
    const player = {
      kind: "human" as const,
      userId: "u1",
      name: "stas",
      avatarUrl: null,
      botLevel: null,
      hp: 6000,
      loadout: [],
      used: [],
      connected: true,
      ready: true,
      rating: null,
    };
    const snap = {
      type: "snapshot" as const,
      serverNow: 1000,
      matchId: "m",
      courseId: "agai",
      mode: "ranked" as const,
      rated: true,
      settings: { powerups: true, lectures: null },
      phase: "lobby" as const,
      phaseEndsAt: null,
      round: 0,
      suddenDeath: 0,
      multiplier: 1,
      you: player,
      opponent: { ...player, userId: "u2", name: "tomek", connected: false },
      joinCode: null,
      armable: [],
      armed: null,
      banner: null,
      question: null,
      hidden: [],
      quickUsed: null,
      yourAnswer: null,
      opponentAnswered: false,
      countdownEnd: null,
      yourDeadline: null,
      lastReveal: null,
      result: null,
      rematch: null,
      opponentForfeitAt: null,
      noShowAt: 31000,
    };
    const s1 = reduceServer(initialMatchState(), snap);
    expect(s1.noShowAt).toBe(31000);
    const s2 = reduceServer(s1, { type: "intro", serverNow: 2000, phaseEndsAt: 6000, you: player, opponent: snap.opponent, mode: "ranked", rated: true });
    expect(s2.noShowAt).toBeNull();
    // An older server without the field still parses to null.
    const { noShowAt: _drop, ...old } = snap;
    void _drop;
    expect(reduceServer(initialMatchState(), old).noShowAt).toBeNull();
  });
});
