import { describe, expect, it } from "vitest";
import { armedBanner, canUsePowerup, fiftyHides } from "@shared/game/powerups";
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
    connected: true,
    everConnected: true,
    disconnectedSince: null,
    ready: true,
    botRating: 1500,
    botRatingN: 0,
    rankedBefore: null,
    bot: null,
    r: { armed, quick: null, answer: null, answeredAt: null, hidden: [] },
    ...over,
  };
}

describe("armedBanner", () => {
  it("nothing armed: no banner", () => {
    expect(armedBanner([player(["bibi"]), player(["bibi"])])).toEqual([]);
  });

  it("Bibi and Shield are both shown, side 0 first", () => {
    expect(armedBanner([player(["bibi"], "bibi"), player(["shield"], "shield")])).toEqual([
      { side: 0, powerup: "bibi" },
      { side: 1, powerup: "shield" },
    ]);
  });

  it("one side armed: one entry", () => {
    expect(armedBanner([player(["bibi"]), player(["bibi", "shield"], "bibi")])).toEqual([{ side: 1, powerup: "bibi" }]);
  });
});

describe("canUsePowerup", () => {
  it("needs power-ups on, the loadout, and an unspent power-up", () => {
    const p = player(["bibi", "fifty", "fast"]);
    expect(canUsePowerup(p, "bibi", true)).toBe(true);
    expect(canUsePowerup(p, "bibi", false)).toBe(false);
    expect(canUsePowerup(p, "shield", true)).toBe(false);
    expect(canUsePowerup(p, "nemesis" as never, true)).toBe(false);
    expect(canUsePowerup({ ...p, used: ["bibi"] }, "bibi", true)).toBe(false);
  });

  it("allows switching the armed choice, but no quick power-up once something is armed", () => {
    const p = player(["bibi", "shield", "fifty"], "bibi");
    expect(canUsePowerup(p, "shield", true)).toBe(true);
    expect(canUsePowerup(p, "fifty", true)).toBe(false);
    const quick = player(["bibi", "fast", "fifty"]);
    quick.r.quick = "fast";
    expect(canUsePowerup(quick, "fifty", true)).toBe(false);
  });
});

describe("fiftyHides", () => {
  it("single with 4 options: hides 2 of the 3 wrong ones", () => {
    const q = makeQuestion();
    const hides = fiftyHides(q, createRng(1));
    expect(hides).toHaveLength(2);
    expect(hides).not.toContain("a");
  });

  it("single with 3 options and cloze: hides 1", () => {
    const q = makeQuestion({ options: [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }] });
    expect(fiftyHides(q, createRng(2))).toHaveLength(1);
    const cloze = makeQuestion({ type: "cloze" });
    expect(fiftyHides(cloze, createRng(2))).toHaveLength(2);
  });

  it("multi: hides exactly one wrong option", () => {
    const hides = fiftyHides(multiQ(), createRng(3));
    expect(hides).toHaveLength(1);
    expect(["c", "d"]).toContain(hides[0]);
  });

  it("refuses true/false, order and match", () => {
    expect(fiftyHides(trueFalse(), createRng(4))).toEqual([]);
    expect(fiftyHides(makeQuestion({ type: "order", key: { kind: "order", ids: ["a", "b", "c", "d"] } }), createRng(4))).toEqual([]);
    expect(fiftyHides(makeQuestion({ type: "match", key: { kind: "match", map: { a: "t1" } } }), createRng(4))).toEqual([]);
  });

  it("has nothing to hide on a two-option single question", () => {
    const q = makeQuestion({ options: [{ id: "a", text: "A" }, { id: "b", text: "B" }] });
    expect(fiftyHides(q, createRng(5))).toEqual([]);
  });

  it("picks different wrong options with different seeds", () => {
    const seen = new Set<string>();
    for (let s = 0; s < 40; s++) seen.add(fiftyHides(makeQuestion(), createRng(s)).sort().join(","));
    expect(seen.size).toBe(3);
  });
});
