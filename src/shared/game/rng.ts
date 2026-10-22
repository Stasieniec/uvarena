// Seeded PRNG (mulberry32). The whole generator state is one 32-bit unsigned
// integer, kept in MatchState.rng between engine steps, so a match replays
// exactly from its seed.
import type { Rng } from "./types";

const TWO_POW_32 = 4294967296;

/** A PRNG starting from a 32-bit unsigned state (MatchInit.seed or MatchState.rng). */
export function createRng(state: number): Rng {
  let s = state >>> 0;

  function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / TWO_POW_32;
  }

  function int(min: number, max: number): number {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return lo + Math.floor(next() * (hi - lo + 1));
  }

  function normal(): number {
    // Box-Muller. 1 - next() is in (0, 1], so the log is finite.
    const u = 1 - next();
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("rng.pick: empty list");
    return items[Math.floor(next() * items.length)] as T;
  }

  function shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  return { next, int, normal, pick, shuffle, state: () => s };
}
