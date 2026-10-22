import { describe, expect, it } from "vitest";
import { createRng } from "@shared/game/rng";
import { selectQuestions, selectionTarget, selectionWeight } from "@shared/game/select";

describe("createRng", () => {
  it("is deterministic per seed and resumable from its state", () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = Array.from({ length: 10 }, () => a.next());
    expect(Array.from({ length: 10 }, () => b.next())).toEqual(xs);
    const c = createRng(42);
    c.next();
    c.next();
    const resumed = createRng(c.state());
    expect(resumed.next()).toBe(xs[2]);
    expect(createRng(43).next()).not.toBe(xs[0]);
  });

  it("stays in range", () => {
    const r = createRng(7);
    for (let i = 0; i < 5000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = r.int(3, 8);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(8);
      expect(Number.isInteger(n)).toBe(true);
    }
    expect(r.state()).toBeGreaterThanOrEqual(0);
    expect(r.state()).toBeLessThan(2 ** 32);
  });

  it("draws a standard normal", () => {
    const r = createRng(9);
    const xs = Array.from({ length: 20000 }, () => r.normal());
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(variance - 1)).toBeLessThan(0.05);
    expect(xs.every(Number.isFinite)).toBe(true);
  });

  it("shuffles into a permutation without touching the input", () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = createRng(1).shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(input);
  });

  it("int covers the whole range uniformly", () => {
    const r = createRng(11);
    const counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < 10000; i++) counts[r.int(0, 4)]! += 1;
    for (const c of counts) expect(c).toBeGreaterThan(1800);
  });
});

describe("selectionTarget", () => {
  it("ranked: mean of both players' bot ratings minus 150, null counts as 1500", () => {
    expect(selectionTarget({ mode: "ranked", playerBotRatings: [1600, 1400], botStrength: null })).toBe(1350);
    expect(selectionTarget({ mode: "private", playerBotRatings: [null, 1700], botStrength: null })).toBe(1450);
  });

  it("bot match: mean of the player and the bot's strength minus 150", () => {
    expect(selectionTarget({ mode: "bot", playerBotRatings: [1500], botStrength: 2100 })).toBe(1650);
    expect(selectionTarget({ mode: "bot", playerBotRatings: [null], botStrength: 1050 })).toBe(1125);
  });
});

describe("selectQuestions", () => {
  const pool = Array.from({ length: 60 }, (_, i) => ({ id: `q${i}`, rating: 1100 + i * 15 }));

  it("returns count distinct questions, deterministic per seed", () => {
    const opts = { target: 1350, count: 25, seenRecently: new Set<string>(), lastSeen: new Map<string, number>() };
    const a = selectQuestions(pool, { ...opts, rng: createRng(5) });
    const b = selectQuestions(pool, { ...opts, rng: createRng(5) });
    expect(a).toHaveLength(25);
    expect(new Set(a.map((q) => q.id)).size).toBe(25);
    expect(a).toEqual(b);
  });

  it("prefers questions near the target", () => {
    let near = 0;
    let far = 0;
    for (let s = 0; s < 50; s++) {
      const picked = selectQuestions(pool, {
        target: 1350,
        count: 10,
        seenRecently: new Set(),
        lastSeen: new Map(),
        rng: createRng(s),
      });
      for (const q of picked) {
        if (Math.abs(q.rating - 1350) <= 150) near += 1;
        if (Math.abs(q.rating - 1350) > 450) far += 1;
      }
    }
    expect(near).toBeGreaterThan(far * 5);
    expect(selectionWeight(1350, 1350)).toBe(1);
    expect(selectionWeight(1600, 1350)).toBeCloseTo(Math.exp(-1));
  });

  it("takes fresh questions first, then seen ones oldest first", () => {
    const seen = new Set(pool.slice(0, 50).map((q) => q.id));
    const lastSeen = new Map(pool.slice(0, 50).map((q, i) => [q.id, 1000 - i]));
    const picked = selectQuestions(pool, { target: 1350, count: 15, seenRecently: seen, lastSeen, rng: createRng(1) });
    expect(picked.slice(0, 10).every((q) => !seen.has(q.id))).toBe(true);
    // Oldest last-seen first: q49 (951), q48, ...
    expect(picked.slice(10).map((q) => q.id)).toEqual(["q49", "q48", "q47", "q46", "q45"]);
  });

  it("returns what exists when there are too few candidates, and handles far-off ratings", () => {
    const tiny = [
      { id: "x", rating: 9000 },
      { id: "y", rating: -9000 },
    ];
    const picked = selectQuestions(tiny, { target: 1500, count: 25, seenRecently: new Set(), lastSeen: new Map(), rng: createRng(1) });
    expect(picked.map((q) => q.id).sort()).toEqual(["x", "y"]);
    expect(selectQuestions([], { target: 1500, count: 25, seenRecently: new Set(), lastSeen: new Map(), rng: createRng(1) })).toEqual([]);
  });

  it("ignores duplicate candidates", () => {
    const dup = [pool[0]!, pool[0]!, pool[1]!];
    const picked = selectQuestions(dup, { target: 1500, count: 5, seenRecently: new Set(), lastSeen: new Map(), rng: createRng(1) });
    expect(picked).toHaveLength(2);
  });
});
