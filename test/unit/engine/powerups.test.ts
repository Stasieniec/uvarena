import { describe, expect, it } from "vitest";
import { canUsePowerup, oracleHides, resolveArming } from "@shared/game/powerups";
import { createRng } from "@shared/game/rng";
import type { BlindPowerupId, PlayerState, PowerupId } from "@shared/game/types";
import { makeQuestion, multiQ, trueFalse } from "./helpers";

function player(loadout: PowerupId[], armed: BlindPowerupId | null = null, over: Partial<PlayerState> = {}): PlayerState {
  return {
    kind: "human",
    userId: "u",
    name: "u",
    avatarUrl: null,
    hp: 6000,
    loadout,
    used: [],
    phoenixUsed: false,
    connected: true,
    everConnected: true,
    disconnectedSince: null,
    ready: true,
    botRating: 1500,
    botRatingN: 0,
    rankedBefore: null,
    bot: null,
    r: { armed, effective: null, nemesisAgainst: false, quick: null, answer: null, answeredAt: null, hidden: [] },
    ...over,
  };
}

describe("resolveArming", () => {
  it("nothing armed: no banner", () => {
    const r = resolveArming([player(["zeus"]), player(["zeus"])]);
    expect(r.banner).toEqual([]);
    expect(r.effective).toEqual([null, null]);
    expect(r.nemesisAgainst).toEqual([false, false]);
  });

  it("Zeus and Aegis are both active", () => {
    const r = resolveArming([player(["zeus"], "zeus"), player(["aegis"], "aegis")]);
    expect(r.effective).toEqual(["zeus", "aegis"]);
    expect(r.banner).toEqual([
      { side: 0, powerup: "zeus", outcome: "active" },
      { side: 1, powerup: "aegis", outcome: "active" },
    ]);
  });

  it("Nemesis cancels Zeus and blocks the Zeus side's Phoenix", () => {
    const r = resolveArming([player(["zeus", "phoenix"], "zeus"), player(["nemesis"], "nemesis")]);
    expect(r.effective).toEqual([null, "nemesis"]);
    expect(r.nemesisAgainst).toEqual([true, false]);
    expect(r.banner).toEqual([
      { side: 0, powerup: "zeus", outcome: "cancelled" },
      { side: 1, powerup: "nemesis", outcome: "nemesis_hit" },
    ]);
  });

  it("two Nemeses cancel each other and block no Phoenix", () => {
    const r = resolveArming([player(["nemesis", "phoenix"], "nemesis"), player(["nemesis", "phoenix"], "nemesis")]);
    expect(r.effective).toEqual([null, null]);
    expect(r.nemesisAgainst).toEqual([false, false]);
    expect(r.banner.map((b) => b.outcome)).toEqual(["cancelled", "cancelled"]);
  });

  it("Nemesis against nothing: watching a Phoenix, else wasted", () => {
    const watch = resolveArming([player(["nemesis"], "nemesis"), player(["phoenix"])]);
    expect(watch.banner).toEqual([{ side: 0, powerup: "nemesis", outcome: "nemesis_watch" }]);
    expect(watch.nemesisAgainst).toEqual([false, true]);

    const spentPhoenix = resolveArming([player(["nemesis"], "nemesis"), player(["phoenix"], null, { phoenixUsed: true })]);
    expect(spentPhoenix.banner[0]?.outcome).toBe("nemesis_wasted");

    const wasted = resolveArming([player(["nemesis"], "nemesis"), player(["zeus"])]);
    expect(wasted.banner[0]?.outcome).toBe("nemesis_wasted");
  });
});

describe("canUsePowerup", () => {
  it("needs power-ups on, the loadout, and an unspent power-up", () => {
    const p = player(["zeus", "oracle", "phoenix"]);
    expect(canUsePowerup(p, "zeus", true)).toBe(true);
    expect(canUsePowerup(p, "zeus", false)).toBe(false);
    expect(canUsePowerup(p, "aegis", true)).toBe(false);
    expect(canUsePowerup(p, "phoenix", true)).toBe(false);
    expect(canUsePowerup({ ...p, used: ["zeus"] }, "zeus", true)).toBe(false);
  });

  it("allows switching the armed choice, but no quick power-up once something is armed", () => {
    const p = player(["zeus", "aegis", "oracle"], "zeus");
    expect(canUsePowerup(p, "aegis", true)).toBe(true);
    expect(canUsePowerup(p, "oracle", true)).toBe(false);
    const quick = player(["zeus", "hermes", "oracle"]);
    quick.r.quick = "hermes";
    expect(canUsePowerup(quick, "oracle", true)).toBe(false);
  });
});

describe("oracleHides", () => {
  it("single with 4 options: hides 2 of the 3 wrong ones", () => {
    const q = makeQuestion();
    const hides = oracleHides(q, createRng(1));
    expect(hides).toHaveLength(2);
    expect(hides).not.toContain("a");
  });

  it("single with 3 options and cloze: hides 1", () => {
    const q = makeQuestion({ options: [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }] });
    expect(oracleHides(q, createRng(2))).toHaveLength(1);
    const cloze = makeQuestion({ type: "cloze" });
    expect(oracleHides(cloze, createRng(2))).toHaveLength(2);
  });

  it("multi: hides exactly one wrong option", () => {
    const hides = oracleHides(multiQ(), createRng(3));
    expect(hides).toHaveLength(1);
    expect(["c", "d"]).toContain(hides[0]);
  });

  it("refuses true/false, order and match", () => {
    expect(oracleHides(trueFalse(), createRng(4))).toEqual([]);
    expect(oracleHides(makeQuestion({ type: "order", key: { kind: "order", ids: ["a", "b", "c", "d"] } }), createRng(4))).toEqual([]);
    expect(oracleHides(makeQuestion({ type: "match", key: { kind: "match", map: { a: "t1" } } }), createRng(4))).toEqual([]);
  });

  it("has nothing to hide on a two-option single question", () => {
    const q = makeQuestion({ options: [{ id: "a", text: "A" }, { id: "b", text: "B" }] });
    expect(oracleHides(q, createRng(5))).toEqual([]);
  });

  it("picks different wrong options with different seeds", () => {
    const seen = new Set<string>();
    for (let s = 0; s < 40; s++) seen.add(oracleHides(makeQuestion(), createRng(s)).sort().join(","));
    expect(seen.size).toBe(3);
  });
});
