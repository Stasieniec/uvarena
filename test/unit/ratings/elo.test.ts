import { describe, expect, it } from "vitest";
import { effectiveN, eloUpdate, isBotRatingProvisional, itemK, pCorrect, playerK } from "@shared/game/elo";

describe("pCorrect", () => {
  it("is 0.5 above the chance floor at equal ratings", () => {
    expect(pCorrect(1500, 1500, 0)).toBeCloseTo(0.5, 12);
    expect(pCorrect(1500, 1500, 0.25)).toBeCloseTo(0.25 + 0.75 * 0.5, 12);
  });

  it("follows the 400-point logistic", () => {
    expect(pCorrect(1900, 1500, 0)).toBeCloseTo(10 / 11, 12);
    expect(pCorrect(1500, 1900, 0)).toBeCloseTo(1 / 11, 12);
  });

  it("never falls below the chance floor", () => {
    expect(pCorrect(400, 3000, 0.5)).toBeGreaterThanOrEqual(0.5);
    expect(pCorrect(400, 3000, 0.5)).toBeLessThan(0.51);
  });
});

describe("K factors", () => {
  it("player K starts at 174 and floors at 24", () => {
    expect(playerK(0)).toBe(174);
    expect(playerK(20)).toBeCloseTo(87, 12);
    expect(playerK(1000)).toBe(24);
  });

  it("item K starts at 174 and floors at 8", () => {
    expect(itemK(0)).toBe(174);
    expect(itemK(20)).toBeCloseTo(87, 12);
    expect(itemK(100_000)).toBe(8);
  });

  it("treats bad counts as 0", () => {
    expect(playerK(-5)).toBe(174);
    expect(itemK(Number.NaN)).toBe(174);
  });
});

describe("effectiveN", () => {
  it("drops 1 per 3 full idle days, never below 0", () => {
    expect(effectiveN(40, 0)).toBe(40);
    expect(effectiveN(40, 2)).toBe(40);
    expect(effectiveN(40, 3)).toBe(39);
    expect(effectiveN(40, 30)).toBe(30);
    expect(effectiveN(5, 300)).toBe(0);
  });
});

describe("eloUpdate", () => {
  it("moves player up and item down on a correct answer", () => {
    const u = eloUpdate(1500, 0, 1500, 0, 0, true);
    expect(u.p).toBeCloseTo(0.5, 12);
    expect(u.playerDelta).toBeCloseTo(174 * 0.5, 9);
    expect(u.itemDelta).toBeCloseTo(-174 * 0.5, 9);
  });

  it("moves player down and item up on a wrong answer", () => {
    const u = eloUpdate(1500, 40, 1500, 200, 0.25, false);
    const p = 0.25 + 0.75 * 0.5;
    expect(u.playerDelta).toBeCloseTo(-playerK(40) * p, 9);
    expect(u.itemDelta).toBeCloseTo(itemK(200) * p, 9);
  });

  it("rewards a right answer on a hard item more than on an easy one", () => {
    expect(eloUpdate(1500, 10, 1800, 50, 0.25, true).playerDelta).toBeGreaterThan(eloUpdate(1500, 10, 1200, 50, 0.25, true).playerDelta);
  });

  it("costs more to miss an easy item than a hard one", () => {
    expect(eloUpdate(1500, 10, 1200, 50, 0.25, false).playerDelta).toBeLessThan(eloUpdate(1500, 10, 1800, 50, 0.25, false).playerDelta);
  });
});

describe("bot rating provisional", () => {
  it("shows ? for the first 30 answers", () => {
    expect(isBotRatingProvisional(0)).toBe(true);
    expect(isBotRatingProvisional(29)).toBe(true);
    expect(isBotRatingProvisional(30)).toBe(false);
  });
});
