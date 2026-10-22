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
  it("Zeus against Aegis: banner shows both, damage doubled then halved", () => {
    const d = withLoadouts(["zeus", "aegis", "oracle"], ["aegis", "zeus", "oracle"]);
    d.arm(0, "zeus");
    expect(d.lastMsg(0, "armed_ack").powerup).toBe("zeus");
    d.arm(1, "aegis");
    // The opponent's choice is invisible during arming.
    const snap = view(d.state, 1, d.now);
    expect(snap.opponent?.used).toEqual([]);
    expect(JSON.stringify(d.out(1))).not.toContain("zeus");

    d.tick(d.state.phaseEndsAt!);
    expect(d.state.phase).toBe("banner");
    expect(d.lastMsg(1, "banner").items).toEqual([
      { who: "opponent", powerup: "zeus", outcome: "active" },
      { who: "you", powerup: "aegis", outcome: "active" },
    ]);
    expect(d.state.phaseEndsAt! - d.now).toBe(TIMING.bannerMs);
    expect(d.state.players[0].used).toEqual(["zeus"]);

    aliceHits(d);
    const r = d.lastMsg(1, "reveal");
    expect(r.damageToYou).toBe(1000); // 1000 * 2 = 2000, halved
    expect(r.zeus).toBe("opponent");
    expect(r.aegis).toBe("you");
  });

  it("Zeus lifts the cap to 4500 late in a match", () => {
    const d = withLoadouts(["zeus", "aegis", "oracle"], ["aegis", "oracle", "hermes"]);
    d.until((s) => s.phase === "arming" && s.round === 20);
    d.arm(0, "zeus");
    aliceHits(d);
    const r = d.lastMsg(1, "reveal");
    expect(r.damageToYou).toBe(4500);
    expect(r.capped).toBe(true);
  });

  it("Zeus fizzles when its side is wrong, and is spent anyway", () => {
    const d = withLoadouts(["zeus", "aegis", "oracle"], ["aegis", "oracle", "hermes"]);
    d.arm(1, "aegis");
    d.arm(1, null);
    d.arm(0, "zeus");
    d.toPhase("question");
    d.answer(1, d.correct(1), d.q.shownAt);
    d.answer(0, d.wrong(0), d.q.shownAt + 100);
    expect(d.lastMsg(0, "reveal")).toMatchObject({ damageToYou: 1000, damageToOpponent: 0, zeus: "you" });
    expect(d.state.players[0].used).toEqual(["zeus"]);
    expect(d.state.players[1].used).toEqual([]);
    d.toPhase("arming", 2);
    expect(d.lastMsg(0, "arming").armable).toEqual(["aegis"]);
    d.arm(0, "zeus");
    expectError(d, 0, "powerup_unavailable");
  });

  it("Nemesis against Zeus: Zeus is cancelled and spent, damage is normal", () => {
    const d = withLoadouts(["zeus", "aegis", "oracle"], ["nemesis", "aegis", "oracle"]);
    d.arm(0, "zeus");
    d.arm(1, "nemesis");
    d.tick(d.state.phaseEndsAt!);
    expect(d.lastMsg(0, "banner").items).toEqual([
      { who: "you", powerup: "zeus", outcome: "cancelled" },
      { who: "opponent", powerup: "nemesis", outcome: "nemesis_hit" },
    ]);
    aliceHits(d);
    expect(d.lastMsg(1, "reveal").damageToYou).toBe(1000);
    expect(d.lastMsg(1, "reveal").zeus).toBeNull();
    expect(d.state.players[0].used).toEqual(["zeus"]);
    expect(d.state.players[1].used).toEqual(["nemesis"]);
    expect(d.state.rounds[0]!.sides[0]).toMatchObject({ armed: "zeus", effective: null, nemesisAgainst: true });
  });

  it("Nemesis against Aegis: the shield is cancelled", () => {
    const d = withLoadouts(["nemesis", "aegis", "oracle"], ["aegis", "zeus", "oracle"]);
    d.arm(0, "nemesis");
    d.arm(1, "aegis");
    aliceHits(d);
    expect(d.lastMsg(1, "reveal").damageToYou).toBe(1000);
    expect(d.lastMsg(1, "reveal").aegis).toBeNull();
  });

  it("Nemesis against Nemesis: both cancelled, Phoenix still works", () => {
    const d = withLoadouts(["nemesis", "aegis", "oracle"], ["nemesis", "phoenix", "oracle"]);
    d.arm(0, "nemesis");
    d.arm(1, "nemesis");
    setHp(d, 1, 500);
    d.tick(d.state.phaseEndsAt!);
    expect(d.lastMsg(0, "banner").items.map((i) => i.outcome)).toEqual(["cancelled", "cancelled"]);
    aliceHits(d);
    const r = d.lastMsg(1, "reveal");
    expect(r.hp.you).toBe(1);
    expect(r.phoenix).toBe("you");
    expect(d.state.players[1].used).toEqual(["nemesis", "phoenix"]);
    expect(d.state.players[0].used).toEqual(["nemesis"]);
  });

  it("Nemesis with nothing armed watches the Phoenix and stops it: knockout", () => {
    const d = withLoadouts(["nemesis", "aegis", "oracle"], ["phoenix", "aegis", "oracle"]);
    d.arm(0, "nemesis");
    setHp(d, 1, 500);
    d.tick(d.state.phaseEndsAt!);
    expect(d.lastMsg(1, "banner").items).toEqual([{ who: "opponent", powerup: "nemesis", outcome: "nemesis_watch" }]);
    aliceHits(d);
    expect(d.lastMsg(1, "reveal").hp.you).toBe(0);
    expect(d.lastMsg(1, "reveal").phoenix).toBeNull();
    expect(d.state.players[1].phoenixUsed).toBe(false);
    d.tick(d.state.phaseEndsAt!);
    expect(d.state.phase).toBe("finished");
    expect(d.state.result).toMatchObject({ winner: 0, reason: "hp" });
  });

  it("Nemesis with nothing to stop is wasted", () => {
    const d = withLoadouts(["nemesis", "aegis", "oracle"], ["zeus", "aegis", "oracle"]);
    d.arm(0, "nemesis");
    d.tick(d.state.phaseEndsAt!);
    expect(d.lastMsg(0, "banner").items).toEqual([{ who: "you", powerup: "nemesis", outcome: "nemesis_wasted" }]);
    expect(d.state.players[0].used).toEqual(["nemesis"]);
  });

  it("Nemesis stops Phoenix only in its own round", () => {
    const d = withLoadouts(["nemesis", "aegis", "oracle"], ["phoenix", "aegis", "oracle"]);
    d.arm(0, "nemesis");
    d.toPhase("arming", 2);
    setHp(d, 1, 500);
    aliceHits(d);
    expect(d.lastMsg(1, "reveal").hp.you).toBe(1);
  });

  it("switching and unarming in the window; the last choice counts", () => {
    const d = withLoadouts(["zeus", "aegis", "nemesis"], ["aegis", "oracle", "hermes"]);
    d.arm(0, "zeus");
    d.arm(0, "nemesis");
    d.arm(0, "aegis");
    expect(view(d.state, 0, d.now).armed).toBe("aegis");
    d.arm(0, null);
    expect(d.lastMsg(0, "armed_ack").powerup).toBeNull();
    d.tick(d.state.phaseEndsAt!);
    expect(d.state.phase).toBe("question");
    expect(d.state.players[0].used).toEqual([]);
  });

  it("refuses power-ups outside the loadout, outside the window or for another round", () => {
    const d = withLoadouts(["zeus", "aegis", "oracle"], ["aegis", "oracle", "hermes"]);
    d.arm(0, "nemesis");
    expectError(d, 0, "powerup_unavailable");
    d.event({ type: "arm", side: 0, round: 2, powerup: "zeus" });
    expectError(d, 0, "round_closed");
    d.toPhase("question");
    d.arm(0, "zeus");
    expectError(d, 0, "wrong_phase");
  });
});

describe("Phoenix", () => {
  it("leaves 1 HP once, then the next knockout ends the match", () => {
    const d = withLoadouts(["zeus", "aegis", "oracle"], ["phoenix", "aegis", "oracle"]);
    setHp(d, 1, 800);
    aliceHits(d);
    const r = d.lastMsg(1, "reveal");
    expect(r).toMatchObject({ damageToYou: 1000, phoenix: "you", hp: { you: 1, opponent: 6000 } });
    expect(d.lastMsg(0, "reveal").phoenix).toBe("opponent");
    expect(d.state.players[1]).toMatchObject({ phoenixUsed: true, hp: 1 });
    expect(d.state.rounds[0]!.sides[1].phoenix).toBe(true);
    d.toPhase("arming", 2);
    aliceHits(d);
    expect(d.state.players[1].hp).toBe(0);
    d.tick(d.state.phaseEndsAt!);
    expect(d.state.result).toMatchObject({ winner: 0, reason: "hp" });
  });

  it("with Aegis: Aegis halves first, Phoenix catches what still knocks out", () => {
    const d = withLoadouts(["zeus", "aegis", "oracle"], ["phoenix", "aegis", "oracle"]);
    d.arm(1, "aegis");
    setHp(d, 1, 400);
    aliceHits(d);
    expect(d.lastMsg(1, "reveal")).toMatchObject({ damageToYou: 500, aegis: "you", phoenix: "you", hp: { you: 1 } });
  });

  it("with Zeus over the normal cap", () => {
    const d = withLoadouts(["zeus", "aegis", "oracle"], ["phoenix", "aegis", "oracle"]);
    d.until((s) => s.phase === "arming" && s.round === 20);
    setHp(d, 1, 4000);
    d.arm(0, "zeus");
    aliceHits(d);
    expect(d.lastMsg(1, "reveal")).toMatchObject({ damageToYou: 4500, capped: true, phoenix: "you", hp: { you: 1 } });
  });

  it("is not armable", () => {
    const d = withLoadouts(["phoenix", "aegis", "oracle"], ["phoenix", "aegis", "oracle"]);
    expect(d.lastMsg(0, "arming").armable).toEqual(["aegis"]);
    d.event({ type: "arm", side: 0, round: 1, powerup: "phoenix" as never });
    expectError(d, 0, "powerup_unavailable");
  });
});

describe("Oracle", () => {
  it("hides two wrong options of four, only for its user", () => {
    const d = withLoadouts(["oracle", "aegis", "zeus"], ["aegis", "zeus", "hermes"]);
    d.toPhase("question");
    d.use(0, "oracle", d.q.shownAt + 1000);
    const res = d.lastMsg(0, "powerup_result");
    expect(res.powerup).toBe("oracle");
    expect(res.hidden).toHaveLength(2);
    const correctId = (d.correct(0) as { ids: string[] }).ids[0];
    expect(res.hidden).not.toContain(correctId);
    for (const id of res.hidden) expect(d.q.order[0]).toContain(id);
    expect(d.lastMsg(1, "opponent_powerup").powerup).toBe("oracle");
    expect(d.msgs(1, "powerup_result")).toHaveLength(0);
    expect(view(d.state, 0, d.now).hidden).toEqual(res.hidden);
    expect(view(d.state, 1, d.now).hidden).toEqual([]);
    expect(view(d.state, 0, d.now).quickUsed).toBe("oracle");

    d.answer(0, d.correct(0), d.q.shownAt + 3000);
    d.answer(1, d.wrong(1), d.q.shownAt + 4000);
    expect(d.state.rounds[0]!.sides[0]).toMatchObject({ helped: true, quick: "oracle" });
    expect(d.state.rounds[0]!.sides[1].helped).toBe(false);
  });

  it("hides one wrong option on multiple select", () => {
    const d = withLoadouts(["oracle", "aegis", "zeus"], ["aegis", "zeus", "hermes"], [
      { ...questions(1)[0]!, type: "multi", key: { kind: "options", ids: ["a", "b"] } },
      ...questions(24),
    ]);
    d.toPhase("question");
    d.use(0, "oracle");
    expect(d.lastMsg(0, "powerup_result").hidden).toHaveLength(1);
  });

  it("is refused on true/false and stays unspent", () => {
    const d = withLoadouts(["oracle", "aegis", "zeus"], ["aegis", "zeus", "hermes"], [trueFalse(), ...questions(24)]);
    d.toPhase("question");
    const before = d.state;
    d.use(0, "oracle");
    expectError(d, 0, "powerup_unavailable");
    expect(d.state).toEqual(before);
    expect(d.state.players[0].used).toEqual([]);
    expect(d.msgs(1, "opponent_powerup")).toHaveLength(0);
  });

  it("is refused after answering, after arming this round, and a second time", () => {
    const d = withLoadouts(["oracle", "aegis", "zeus"], ["aegis", "zeus", "hermes"]);
    d.arm(0, "zeus");
    d.toPhase("question", 1);
    d.use(0, "oracle");
    expectError(d, 0, "powerup_unavailable");

    d.toPhase("question", 2);
    d.answer(0, d.correct(0));
    d.use(0, "oracle");
    expectError(d, 0, "already_answered");

    d.toPhase("question", 3);
    d.use(0, "oracle");
    expect(d.lastMsg(0, "powerup_result").hidden).toHaveLength(2);
    d.toPhase("question", 4);
    d.use(0, "oracle");
    expectError(d, 0, "powerup_unavailable");
  });

  it("is refused once your time is up", () => {
    const d = withLoadouts(["oracle", "aegis", "zeus"], ["aegis", "zeus", "hermes"]);
    d.toPhase("question");
    d.answer(1, d.correct(1), d.q.shownAt + 1000);
    d.use(0, "oracle", d.q.countdownEnd! + TIMING.graceMs + 1);
    expect(d.state.phase).toBe("reveal");
  });
});

describe("Hermes", () => {
  it("answering first: the opponent gets 2 seconds", () => {
    const d = withLoadouts(["hermes", "aegis", "zeus"], ["aegis", "zeus", "oracle"]);
    d.toPhase("question");
    d.use(0, "hermes", d.q.shownAt + 200);
    expect(d.lastMsg(0, "powerup_result")).toMatchObject({ powerup: "hermes", hidden: [] });
    expect(d.lastMsg(1, "opponent_powerup").powerup).toBe("hermes");
    d.answer(0, d.correct(0), d.q.shownAt + 3000);
    expect(d.q.countdownEnd).toBe(d.q.shownAt + 3000 + TIMING.hermesCountdownMs);
    expect(d.lastMsg(1, "opponent_answered").countdownEnd).toBe(d.q.shownAt + 5000);
  });

  it("answering second: Hermes does nothing, and is spent", () => {
    const d = withLoadouts(["hermes", "aegis", "zeus"], ["aegis", "zeus", "oracle"]);
    d.toPhase("question");
    d.use(0, "hermes", d.q.shownAt + 200);
    d.answer(1, d.wrong(1), d.q.shownAt + 1000);
    expect(d.q.countdownEnd).toBe(d.q.shownAt + 1000 + TIMING.countdownMs);
    d.answer(0, d.correct(0), d.q.shownAt + 5500);
    expect(d.state.rounds[0]!.sides[0]).toMatchObject({ quick: "hermes", correct: true });
    expect(d.state.players[0].used).toEqual(["hermes"]);
  });

  it("can be used after the opponent already answered, to no effect", () => {
    const d = withLoadouts(["hermes", "aegis", "zeus"], ["aegis", "zeus", "oracle"]);
    d.toPhase("question");
    d.answer(1, d.wrong(1), d.q.shownAt + 1000);
    d.use(0, "hermes", d.q.shownAt + 1500);
    expect(d.lastMsg(0, "powerup_result").powerup).toBe("hermes");
    expect(d.q.countdownEnd).toBe(d.q.shownAt + 6000);
  });
});
