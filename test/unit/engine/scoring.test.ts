import { describe, expect, it } from "vitest";
import { computeDamage, isCorrect, multiplier, roundScore, timerMs, type DamageInput } from "@shared/game/scoring";

describe("roundScore", () => {
  it("pays 1000 for an instant answer, falling evenly to 500 at the buzzer", () => {
    expect(roundScore(true, 1000, 1000, 20000)).toBe(1000);
    expect(roundScore(true, 1000 + 10000, 1000, 20000)).toBe(750);
    expect(roundScore(true, 1000 + 20000, 1000, 20000)).toBe(500);
    // Design example: right after 4 of 20 seconds is 900.
    expect(roundScore(true, 4000, 0, 20000)).toBe(900);
  });

  it("clamps time to the timer and to zero", () => {
    expect(roundScore(true, 1000 + 25000, 1000, 20000)).toBe(500);
    expect(roundScore(true, 500, 1000, 20000)).toBe(1000);
  });

  it("scores 0 for wrong answers and timeouts", () => {
    expect(roundScore(false, 1000, 1000, 20000)).toBe(0);
    expect(roundScore(true, null, 1000, 20000)).toBe(0);
  });
});

describe("multiplier", () => {
  it("is x1 for rounds 1 to 4, then +0.5 per round, frozen after 20", () => {
    expect([1, 2, 3, 4].map(multiplier)).toEqual([1, 1, 1, 1]);
    expect(multiplier(5)).toBe(1.5);
    expect(multiplier(6)).toBe(2);
    expect(multiplier(7)).toBe(2.5);
    expect(multiplier(20)).toBe(9);
    expect(multiplier(21)).toBe(9);
    expect(multiplier(25)).toBe(9);
  });
});

describe("timerMs", () => {
  it("uses the timer by type", () => {
    expect(timerMs({ type: "truefalse", timeS: null, words: 10 }, 1)).toBe(15000);
    expect(timerMs({ type: "single", timeS: null, words: 10 }, 1)).toBe(20000);
    expect(timerMs({ type: "cloze", timeS: null, words: 10 }, 1)).toBe(20000);
    expect(timerMs({ type: "multi", timeS: null, words: 10 }, 1)).toBe(30000);
  });

  it("adds 1 s per started 15 words above 40, at most 10 s", () => {
    expect(timerMs({ type: "single", timeS: null, words: 40 }, 1)).toBe(20000);
    expect(timerMs({ type: "single", timeS: null, words: 41 }, 1)).toBe(21000);
    expect(timerMs({ type: "single", timeS: null, words: 55 }, 1)).toBe(21000);
    expect(timerMs({ type: "single", timeS: null, words: 56 }, 1)).toBe(22000);
    expect(timerMs({ type: "single", timeS: null, words: 1000 }, 1)).toBe(30000);
  });

  it("lets the item's time override everything", () => {
    expect(timerMs({ type: "multi", timeS: 12, words: 500 }, 1)).toBe(12000);
  });

  it("applies the test-mode time scale with a floor", () => {
    expect(timerMs({ type: "single", timeS: null, words: 10 }, 0.2)).toBe(4000);
    expect(timerMs({ type: "single", timeS: 3, words: 10 }, 0.2)).toBe(1000);
  });
});

describe("isCorrect", () => {
  it("options: exact set equality, order irrelevant", () => {
    const key = { kind: "options", ids: ["a", "b"] } as const;
    expect(isCorrect(key, { kind: "options", ids: ["b", "a"] })).toBe(true);
    expect(isCorrect(key, { kind: "options", ids: ["a"] })).toBe(false);
    expect(isCorrect(key, { kind: "options", ids: ["a", "b", "c"] })).toBe(false);
    expect(isCorrect(key, null)).toBe(false);
    expect(isCorrect(key, { kind: "bool", value: true })).toBe(false);
  });

  it("bool, order and match", () => {
    expect(isCorrect({ kind: "bool", value: false }, { kind: "bool", value: false })).toBe(true);
    expect(isCorrect({ kind: "bool", value: false }, { kind: "bool", value: true })).toBe(false);
    expect(isCorrect({ kind: "order", ids: ["a", "b", "c"] }, { kind: "order", ids: ["a", "b", "c"] })).toBe(true);
    expect(isCorrect({ kind: "order", ids: ["a", "b", "c"] }, { kind: "order", ids: ["a", "c", "b"] })).toBe(false);
    const map = { kind: "match", map: { a: "t1", b: "t2" } } as const;
    expect(isCorrect(map, { kind: "match", map: { b: "t2", a: "t1" } })).toBe(true);
    expect(isCorrect(map, { kind: "match", map: { a: "t1" } })).toBe(false);
    expect(isCorrect(map, { kind: "match", map: { a: "t1", b: "t1" } })).toBe(false);
  });
});

function dmg(over: Partial<DamageInput>) {
  return computeDamage({
    scores: [0, 0],
    multiplier: 1,
    effective: [null, null],
    hp: [6000, 6000],
    phoenixReady: [false, false],
    ...over,
  });
}

describe("computeDamage", () => {
  it("matches the design example: round 6, 900 against 0, takes 1800", () => {
    const r = dmg({ scores: [900, 0], multiplier: 2 });
    expect(r.damage).toEqual([0, 1800]);
    expect(r.hpAfter).toEqual([6000, 4200]);
    expect(r.capped).toBe(false);
  });

  it("deals no damage on equal scores (both wrong)", () => {
    expect(dmg({ scores: [0, 0], multiplier: 9 }).damage).toEqual([0, 0]);
    expect(dmg({ scores: [800, 800] }).damage).toEqual([0, 0]);
  });

  it("both right: only the speed difference", () => {
    const r = dmg({ scores: [700, 950] });
    expect(r.damage).toEqual([250, 0]);
  });

  it("caps a round at 3000", () => {
    const r = dmg({ scores: [1000, 0], multiplier: 9 });
    expect(r.damage[1]).toBe(3000);
    expect(r.capped).toBe(true);
  });

  it("Zeus doubles and lifts the cap to 4500", () => {
    expect(dmg({ scores: [900, 0], multiplier: 2, effective: ["zeus", null] }).damage[1]).toBe(3600);
    const r = dmg({ scores: [1000, 0], multiplier: 9, effective: ["zeus", null] });
    expect(r.damage[1]).toBe(4500);
    expect(r.capped).toBe(true);
    expect(r.zeusHit).toEqual([true, false]);
  });

  it("Zeus fizzles for the side that deals no damage", () => {
    const r = dmg({ scores: [0, 800], effective: ["zeus", null] });
    expect(r.damage).toEqual([800, 0]);
    expect(r.zeusHit).toEqual([false, false]);
  });

  it("Aegis halves after the cap", () => {
    const r = dmg({ scores: [1000, 0], multiplier: 9, effective: [null, "aegis"] });
    expect(r.damage[1]).toBe(1500);
    expect(r.aegisHeld).toEqual([false, true]);
  });

  it("Zeus against Aegis: doubled, capped at 4500, then halved", () => {
    const r = dmg({ scores: [1000, 0], multiplier: 9, effective: ["zeus", "aegis"] });
    expect(r.damage[1]).toBe(2250);
  });

  it("Aegis on the attacking side does nothing", () => {
    const r = dmg({ scores: [1000, 0], effective: ["aegis", null] });
    expect(r.damage[1]).toBe(1000);
    expect(r.aegisHeld).toEqual([false, false]);
  });

  it("rounds half-damage", () => {
    expect(dmg({ scores: [1, 0], effective: [null, "aegis"] }).damage[1]).toBe(1);
    expect(dmg({ scores: [3, 0], effective: [null, "aegis"] }).damage[1]).toBe(2);
  });

  it("Phoenix leaves 1 HP from a knockout, and only then", () => {
    const r = dmg({ scores: [1000, 0], multiplier: 9, hp: [6000, 2000], phoenixReady: [false, true] });
    expect(r.hpAfter[1]).toBe(1);
    expect(r.phoenix).toEqual([false, true]);
    const notLethal = dmg({ scores: [1000, 0], hp: [6000, 2000], phoenixReady: [false, true] });
    expect(notLethal.hpAfter[1]).toBe(1000);
    expect(notLethal.phoenix).toEqual([false, false]);
  });

  it("an exact knockout to 0 also triggers Phoenix", () => {
    const r = dmg({ scores: [1000, 0], hp: [6000, 1000], phoenixReady: [false, true] });
    expect(r.hpAfter[1]).toBe(1);
  });

  it("without Phoenix HP stops at 0", () => {
    const r = dmg({ scores: [1000, 0], multiplier: 9, hp: [6000, 500] });
    expect(r.hpAfter[1]).toBe(0);
    expect(r.damage[1]).toBe(3000);
  });

  it("Phoenix with Zeus over the normal cap", () => {
    const r = dmg({ scores: [1000, 0], multiplier: 9, hp: [6000, 4000], effective: ["zeus", null], phoenixReady: [false, true] });
    expect(r.damage[1]).toBe(4500);
    expect(r.hpAfter[1]).toBe(1);
  });

  it("Phoenix with Aegis: the halved hit still knocks out, Phoenix catches it", () => {
    const r = dmg({ scores: [1000, 0], multiplier: 9, hp: [6000, 1200], effective: [null, "aegis"], phoenixReady: [false, true] });
    expect(r.damage[1]).toBe(1500);
    expect(r.hpAfter[1]).toBe(1);
    expect(r.phoenix[1]).toBe(true);
  });

  it("Phoenix with Aegis: when Aegis alone saves the player, Phoenix stays unused", () => {
    const r = dmg({ scores: [1000, 0], multiplier: 9, hp: [6000, 2000], effective: [null, "aegis"], phoenixReady: [false, true] });
    expect(r.hpAfter[1]).toBe(500);
    expect(r.phoenix[1]).toBe(false);
  });
});
