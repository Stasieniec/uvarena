import { describe, expect, it } from "vitest";
import { GLICKO } from "@shared/game/config";
import {
  defaultGlicko,
  fullIdleDays,
  glicko2Raw,
  glicko2Update,
  inflateForIdleDays,
  isProvisional,
  sanitizeGlicko,
} from "@shared/game/glicko2";

const DAY = 24 * 60 * 60 * 1000;

describe("Glicko-2: Glickman's worked example", () => {
  // Glickman, "Example of the Glicko-2 system": r 1500, RD 200, vol 0.06,
  // tau 0.5, against 1400/30 (win), 1550/100 (loss), 1700/300 (loss).
  const player = { r: 1500, rd: 200, vol: 0.06 };
  const games = [
    { opponent: { r: 1400, rd: 30, vol: 0.06 }, score: 1 },
    { opponent: { r: 1550, rd: 100, vol: 0.06 }, score: 0 },
    { opponent: { r: 1700, rd: 300, vol: 0.06 }, score: 0 },
  ];

  it("matches the paper: r 1464.06, RD 151.52, vol 0.05999", () => {
    const out = glicko2Update(player, games);
    // The paper rounds mu' to 4 decimals (-0.2069) before converting back, which
    // gives its 1464.06. Unrounded, the same algorithm gives 1464.0507. Check
    // the Glicko-2 scale values at the paper's precision, then its conversion.
    const mu = (out.r - GLICKO.startRating) / GLICKO.scale;
    const phi = out.rd / GLICKO.scale;
    expect(Number(mu.toFixed(4))).toBe(-0.2069);
    expect(Number(phi.toFixed(4))).toBe(0.8722);
    expect(Number(mu.toFixed(4)) * GLICKO.scale + GLICKO.startRating).toBeCloseTo(1464.06, 2);
    expect(Math.abs(out.r - 1464.06)).toBeLessThan(0.01);
    expect(out.rd).toBeCloseTo(151.52, 2);
    // The paper prints sigma' = 0.05999 (truncated); the value is 0.0599960.
    expect(out.vol).toBeCloseTo(0.05999, 4);
    expect(out.vol).toBeLessThan(0.06);
  });

  it("is untouched by the clamps (raw and clamped results agree)", () => {
    expect(glicko2Update(player, games)).toEqual(glicko2Raw(player, games));
  });

  it("uses tau and epsilon from config", () => {
    expect(GLICKO.tau).toBe(0.5);
    expect(GLICKO.epsilon).toBe(1e-6);
  });
});

describe("Glicko-2: one game per period", () => {
  it("a first game between two new players moves about 160 points", () => {
    const a = defaultGlicko();
    const b = defaultGlicko();
    const winner = glicko2Update(a, [{ opponent: b, score: 1 }]);
    const loser = glicko2Update(b, [{ opponent: a, score: 0 }]);
    expect(winner.r - 1500).toBeGreaterThan(140);
    expect(winner.r - 1500).toBeLessThan(180);
    expect(loser.r - 1500).toBeCloseTo(-(winner.r - 1500), 6);
    expect(winner.rd).toBeLessThan(350);
    expect(isProvisional(winner.rd)).toBe(true);
  });

  it("a draw between equals changes nothing but RD", () => {
    const out = glicko2Update({ r: 1600, rd: 80, vol: 0.06 }, [{ opponent: { r: 1600, rd: 80, vol: 0.06 }, score: 0.5 }]);
    expect(out.r).toBeCloseTo(1600, 6);
    expect(out.rd).toBeLessThan(80);
  });

  it("beating a stronger player earns more than beating a weaker one", () => {
    const me = { r: 1500, rd: 100, vol: 0.06 };
    const vsStrong = glicko2Update(me, [{ opponent: { r: 1700, rd: 100, vol: 0.06 }, score: 1 }]);
    const vsWeak = glicko2Update(me, [{ opponent: { r: 1300, rd: 100, vol: 0.06 }, score: 1 }]);
    expect(vsStrong.r - 1500).toBeGreaterThan(vsWeak.r - 1500);
  });

  it("an established player moves about 15 to 30 points per game", () => {
    let me = defaultGlicko();
    let opp = defaultGlicko();
    for (let i = 0; i < 15; i++) {
      const score = i % 2;
      const nextMe = glicko2Update(me, [{ opponent: opp, score }]);
      opp = glicko2Update(opp, [{ opponent: me, score: 1 - score }]);
      me = nextMe;
    }
    expect(isProvisional(me.rd)).toBe(false);
    const step = Math.abs(glicko2Update(me, [{ opponent: opp, score: 1 }]).r - me.r);
    expect(step).toBeGreaterThan(10);
    expect(step).toBeLessThan(35);
  });

  it("with no games only RD grows", () => {
    const out = glicko2Update({ r: 1700, rd: 60, vol: 0.06 }, []);
    expect(out.r).toBe(1700);
    expect(out.rd).toBeGreaterThan(60);
    expect(out.vol).toBe(0.06);
  });
});

describe("Glicko-2: clamps", () => {
  it("never lets RD fall below the minimum", () => {
    let me = { r: 1500, rd: 46, vol: 0.0001 };
    for (let i = 0; i < 50; i++) me = glicko2Update(me, [{ opponent: { r: 1500, rd: 45, vol: 0.06 }, score: 0.5 }]);
    expect(me.rd).toBe(GLICKO.rdMin);
  });

  it("never lets RD exceed the maximum", () => {
    const out = glicko2Update({ r: 1500, rd: 350, vol: 0.5 }, [{ opponent: { r: 3000, rd: 350, vol: 0.06 }, score: 0 }]);
    expect(out.rd).toBeLessThanOrEqual(GLICKO.rdMax);
  });

  it("caps the change per game at 700 points", () => {
    // A huge upset with a high volatility; the raw update would be about +720.
    const me = { r: 1500, rd: 350, vol: 0.3 };
    const games = [{ opponent: { r: 3500, rd: 10, vol: 0.06 }, score: 1 }];
    const raw = glicko2Raw(me, games);
    expect(raw.r - 1500).toBeGreaterThan(GLICKO.maxChangePerGame);
    expect(glicko2Update(me, games).r).toBe(1500 + GLICKO.maxChangePerGame);
  });

  it("never lets the rating fall below the floor", () => {
    const out = glicko2Update({ r: 450, rd: 350, vol: 0.06 }, [{ opponent: { r: 400, rd: 45, vol: 0.06 }, score: 0 }]);
    expect(glicko2Raw({ r: 450, rd: 350, vol: 0.06 }, [{ opponent: { r: 400, rd: 45, vol: 0.06 }, score: 0 }]).r).toBeLessThan(
      GLICKO.ratingFloor,
    );
    expect(out.r).toBe(GLICKO.ratingFloor);
  });

  it("turns corrupt input into start values instead of NaN", () => {
    expect(sanitizeGlicko({ r: Number.NaN, rd: Number.POSITIVE_INFINITY, vol: 0 })).toEqual(defaultGlicko());
    const out = glicko2Update({ r: Number.NaN, rd: -5, vol: Number.NaN }, [{ opponent: { r: 1500, rd: Number.NaN, vol: 0.06 }, score: 1 }]);
    expect(Number.isFinite(out.r) && Number.isFinite(out.rd) && Number.isFinite(out.vol)).toBe(true);
  });
});

describe("Glicko-2: idle days", () => {
  it("inflates phi by vol^2 per full idle day on the Glicko-2 scale", () => {
    const base = { r: 1600, rd: 50, vol: 0.06 };
    const one = inflateForIdleDays(base, 1);
    const phi = 50 / GLICKO.scale;
    expect(one.rd).toBeCloseTo(Math.sqrt(phi * phi + 0.06 * 0.06) * GLICKO.scale, 9);
    expect(one.r).toBe(1600);
    expect(one.vol).toBe(0.06);
    // Ten single days equal one ten-day step.
    let stepwise = base;
    for (let i = 0; i < 10; i++) stepwise = inflateForIdleDays(stepwise, 1);
    expect(inflateForIdleDays(base, 10).rd).toBeCloseTo(stepwise.rd, 9);
  });

  it("does nothing for 0 days, partial days or bad input", () => {
    const base = { r: 1600, rd: 50, vol: 0.06 };
    expect(inflateForIdleDays(base, 0)).toEqual(base);
    expect(inflateForIdleDays(base, 0.9)).toEqual(base);
    expect(inflateForIdleDays(base, -3)).toEqual(base);
    expect(inflateForIdleDays(base, Number.NaN)).toEqual(base);
  });

  it("caps inflation at RD 350", () => {
    expect(inflateForIdleDays({ r: 1600, rd: 300, vol: 0.06 }, 100_000).rd).toBe(GLICKO.rdMax);
  });

  it("counts only full days", () => {
    expect(fullIdleDays(null, 10 * DAY)).toBe(0);
    expect(fullIdleDays(0, DAY - 1)).toBe(0);
    expect(fullIdleDays(0, DAY)).toBe(1);
    expect(fullIdleDays(0, 3.5 * DAY)).toBe(3);
    expect(fullIdleDays(5 * DAY, DAY)).toBe(0);
  });
});

describe("Glicko-2: provisional", () => {
  it("is provisional while RD >= 110", () => {
    expect(isProvisional(350)).toBe(true);
    expect(isProvisional(110)).toBe(true);
    expect(isProvisional(109.99)).toBe(false);
  });
});
