// Every power-up and their interactions, played through the reducer.
import { describe, expect, it } from "vitest";
import { TIMING } from "@shared/game/config";
import { view } from "@shared/game/engine";
import type { MatchState, PowerupId } from "@shared/game/types";
import { Driver, expectError, human, questions, rankedInit, startedRanked, trueFalse } from "./helpers";

function withLoadouts(a: PowerupId[], b: PowerupId[], qs = questions()): Driver {
  return startedRanked({ humans: [human("alice", { loadout: a }), human("bob", { loadout: b })], questions: qs });
}

/** Sets a player's HP between steps (tests only). */
function setHp(d: Driver, side: 0 | 1, hp: number): void {
  const s: MatchState = structuredClone(d.state);
  s.players[side]!.hp = hp;
  d.state = s;
}

/** Alice answers right instantly (1000), Bob wrong a second later (0). */
function aliceHits(d: Driver): void {
  d.toPhase("question");
  d.answer(0, d.correct(0), d.q.shownAt);
  d.answer(1, d.wrong(1), d.q.shownAt + 1000);
}

describe("blind power-ups through the arming window", () => {
  it("Bibi against Shield: banner shows both, damage doubled then halved", () => {
    const d = withLoadouts(["bibi", "shield", "fifty"], ["shield", "bibi", "fifty"]);
    d.arm(0, "bibi");
    expect(d.lastMsg(0, "armed_ack").powerup).toBe("bibi");
    d.arm(1, "shield");
    // The opponent's choice is invisible during arming.
    const snap = view(d.state, 1, d.now);
    expect(snap.opponent?.used).toEqual([]);
    expect(JSON.stringify(d.out(1))).not.toContain("bibi");

    d.tick(d.state.phaseEndsAt!);
    expect(d.state.phase).toBe("banner");
    expect(d.lastMsg(1, "banner").items).toEqual([
      { who: "opponent", powerup: "bibi" },
      { who: "you", powerup: "shield" },
    ]);
    expect(d.state.phaseEndsAt! - d.now).toBe(TIMING.bannerMs);
    expect(d.state.players[0].used).toEqual(["bibi"]);

    aliceHits(d);
    const r = d.lastMsg(1, "reveal");
    expect(r.damageToYou).toBe(1000); // 1000 * 2 = 2000, halved
    expect(r.bibi).toBe("opponent");
    expect(r.shield).toBe("you");
  });

  it("Bibi lifts the cap to 4500 late in a match", () => {
    const d = withLoadouts(["bibi", "shield", "fifty"], ["shield", "fifty", "fast"]);
    d.until((s) => s.phase === "arming" && s.round === 20);
    d.arm(0, "bibi");
    aliceHits(d);
    const r = d.lastMsg(1, "reveal");
    expect(r.damageToYou).toBe(4500);
    expect(r.capped).toBe(true);
  });

  it("Bibi fizzles when its side is wrong, and is spent anyway", () => {
    const d = withLoadouts(["bibi", "shield", "fifty"], ["shield", "fifty", "fast"]);
    d.arm(1, "shield");
    d.arm(1, null);
    d.arm(0, "bibi");
    d.toPhase("question");
    d.answer(1, d.correct(1), d.q.shownAt);
    d.answer(0, d.wrong(0), d.q.shownAt + 100);
    expect(d.lastMsg(0, "reveal")).toMatchObject({ damageToYou: 1000, damageToOpponent: 0, bibi: "you" });
    expect(d.state.players[0].used).toEqual(["bibi"]);
    expect(d.state.players[1]!.used).toEqual([]);
    d.toPhase("arming", 2);
    expect(d.lastMsg(0, "arming").armable).toEqual(["shield"]);
    d.arm(0, "bibi");
    expectError(d, 0, "powerup_unavailable");
  });

  it("a lone Shield: the banner shows it to both, damage taken is halved", () => {
    const d = withLoadouts(["bibi", "shield", "fifty"], ["shield", "bibi", "fifty"]);
    d.arm(1, "shield");
    d.tick(d.state.phaseEndsAt!);
    expect(d.lastMsg(0, "banner").items).toEqual([{ who: "opponent", powerup: "shield" }]);
    expect(d.lastMsg(1, "banner").items).toEqual([{ who: "you", powerup: "shield" }]);
    aliceHits(d);
    expect(d.lastMsg(1, "reveal")).toMatchObject({ damageToYou: 500, shield: "you", bibi: null });
    expect(d.state.rounds[0]!.sides[1]).toMatchObject({ armed: "shield", damageTaken: 500 });
  });

  it("a Shield that takes no hit is spent anyway", () => {
    const d = withLoadouts(["bibi", "shield", "fifty"], ["shield", "bibi", "fifty"]);
    d.arm(0, "shield");
    aliceHits(d);
    expect(d.lastMsg(0, "reveal")).toMatchObject({ damageToYou: 0, damageToOpponent: 1000, shield: "you" });
    expect(d.state.players[0].used).toEqual(["shield"]);
    d.toPhase("arming", 2);
    expect(d.lastMsg(0, "arming").armable).toEqual(["bibi"]);
  });

  it("no power-up saves a knockout", () => {
    const d = withLoadouts(["bibi", "shield", "fifty"], ["shield", "bibi", "fifty"]);
    d.arm(1, "shield");
    setHp(d, 1, 400);
    aliceHits(d);
    expect(d.lastMsg(1, "reveal")).toMatchObject({ damageToYou: 500, hp: { you: 0 } });
    d.tick(d.state.phaseEndsAt!);
    expect(d.state.result).toMatchObject({ winner: 0, reason: "hp" });
  });

  it("switching and unarming in the window; the last choice counts", () => {
    const d = withLoadouts(["bibi", "shield", "fifty"], ["shield", "fifty", "fast"]);
    d.arm(0, "bibi");
    d.arm(0, "shield");
    expect(view(d.state, 0, d.now).armed).toBe("shield");
    d.arm(0, null);
    expect(d.lastMsg(0, "armed_ack").powerup).toBeNull();
    d.tick(d.state.phaseEndsAt!);
    expect(d.state.phase).toBe("question");
    expect(d.state.players[0].used).toEqual([]);
  });

  it("refuses power-ups outside the loadout, outside the window or for another round", () => {
    const d = withLoadouts(["bibi", "fifty", "fast"], ["shield", "fifty", "fast"]);
    d.arm(0, "shield");
    expectError(d, 0, "powerup_unavailable");
    d.event({ type: "arm", side: 0, round: 1, powerup: "nemesis" as never });
    expectError(d, 0, "powerup_unavailable");
    d.event({ type: "arm", side: 0, round: 2, powerup: "bibi" });
    expectError(d, 0, "round_closed");
    d.toPhase("question");
    d.arm(0, "bibi");
    expectError(d, 0, "wrong_phase");
  });
});

describe("50:50", () => {
  it("hides two wrong options of four, only for its user", () => {
    const d = withLoadouts(["fifty", "shield", "bibi"], ["shield", "bibi", "fast"]);
    d.toPhase("question");
    d.use(0, "fifty", d.q.shownAt + 1000);
    const res = d.lastMsg(0, "powerup_result");
    expect(res.powerup).toBe("fifty");
    expect(res.hidden).toHaveLength(2);
    const correctId = (d.correct(0) as { ids: string[] }).ids[0];
    expect(res.hidden).not.toContain(correctId);
    for (const id of res.hidden) expect(d.q.order[0]).toContain(id);
    expect(d.lastMsg(1, "opponent_powerup").powerup).toBe("fifty");
    expect(d.msgs(1, "powerup_result")).toHaveLength(0);
    expect(view(d.state, 0, d.now).hidden).toEqual(res.hidden);
    expect(view(d.state, 1, d.now).hidden).toEqual([]);
    expect(view(d.state, 0, d.now).quickUsed).toBe("fifty");

    d.answer(0, d.correct(0), d.q.shownAt + 3000);
    d.answer(1, d.wrong(1), d.q.shownAt + 4000);
    expect(d.state.rounds[0]!.sides[0]).toMatchObject({ helped: true, quick: "fifty" });
    expect(d.state.rounds[0]!.sides[1].helped).toBe(false);
  });

  it("hides one wrong option on multiple select", () => {
    const d = withLoadouts(["fifty", "shield", "bibi"], ["shield", "bibi", "fast"], [
      { ...questions(1)[0]!, type: "multi", key: { kind: "options", ids: ["a", "b"] } },
      ...questions(24),
    ]);
    d.toPhase("question");
    d.use(0, "fifty");
    expect(d.lastMsg(0, "powerup_result").hidden).toHaveLength(1);
  });

  it("is refused on true/false and stays unspent", () => {
    const d = withLoadouts(["fifty", "shield", "bibi"], ["shield", "bibi", "fast"], [trueFalse(), ...questions(24)]);
    d.toPhase("question");
    const before = d.state;
    d.use(0, "fifty");
    expectError(d, 0, "powerup_unavailable");
    expect(d.state).toEqual(before);
    expect(d.state.players[0].used).toEqual([]);
    expect(d.msgs(1, "opponent_powerup")).toHaveLength(0);
  });

  it("is refused after answering, after arming this round, and a second time", () => {
    const d = withLoadouts(["fifty", "shield", "bibi"], ["shield", "bibi", "fast"]);
    d.arm(0, "bibi");
    d.toPhase("question", 1);
    d.use(0, "fifty");
    expectError(d, 0, "powerup_unavailable");

    d.toPhase("question", 2);
    d.answer(0, d.correct(0));
    d.use(0, "fifty");
    expectError(d, 0, "already_answered");

    d.toPhase("question", 3);
    d.use(0, "fifty");
    expect(d.lastMsg(0, "powerup_result").hidden).toHaveLength(2);
    d.toPhase("question", 4);
    d.use(0, "fifty");
    expectError(d, 0, "powerup_unavailable");
  });

  it("is refused once your time is up", () => {
    const d = withLoadouts(["fifty", "shield", "bibi"], ["shield", "bibi", "fast"]);
    d.toPhase("question");
    d.answer(1, d.correct(1), d.q.shownAt + 1000);
    d.use(0, "fifty", d.q.countdownEnd! + TIMING.graceMs + 1);
    expect(d.state.phase).toBe("reveal");
  });
});

describe("Gotta Go Fast", () => {
  it("answering first: the opponent gets 5 seconds instead of 10", () => {
    const d = withLoadouts(["fast", "shield", "bibi"], ["shield", "bibi", "fifty"]);
    d.toPhase("question");
    d.use(0, "fast", d.q.shownAt + 200);
    expect(d.lastMsg(0, "powerup_result")).toMatchObject({ powerup: "fast", hidden: [] });
    expect(d.lastMsg(1, "opponent_powerup").powerup).toBe("fast");
    d.answer(0, d.correct(0), d.q.shownAt + 3000);
    expect(d.q.countdownEnd).toBe(d.q.shownAt + 3000 + TIMING.fastCountdownMs);
    expect(TIMING.fastCountdownMs).toBe(5000);
    expect(TIMING.countdownMs).toBe(10000);
    expect(d.lastMsg(1, "opponent_answered").countdownEnd).toBe(d.q.shownAt + 8000);
  });

  it("answering second: Gotta Go Fast does nothing, and is spent", () => {
    const d = withLoadouts(["fast", "shield", "bibi"], ["shield", "bibi", "fifty"]);
    d.toPhase("question");
    d.use(0, "fast", d.q.shownAt + 200);
    d.answer(1, d.wrong(1), d.q.shownAt + 1000);
    expect(d.q.countdownEnd).toBe(d.q.shownAt + 1000 + TIMING.countdownMs);
    d.answer(0, d.correct(0), d.q.shownAt + 5500);
    expect(d.state.rounds[0]!.sides[0]).toMatchObject({ quick: "fast", correct: true });
    expect(d.state.players[0].used).toEqual(["fast"]);
  });

  it("can be used after the opponent already answered, to no effect", () => {
    const d = withLoadouts(["fast", "shield", "bibi"], ["shield", "bibi", "fifty"]);
    d.toPhase("question");
    d.answer(1, d.wrong(1), d.q.shownAt + 1000);
    d.use(0, "fast", d.q.shownAt + 1500);
    expect(d.lastMsg(0, "powerup_result").powerup).toBe("fast");
    expect(d.q.countdownEnd).toBe(d.q.shownAt + 1000 + TIMING.countdownMs);
  });
});
