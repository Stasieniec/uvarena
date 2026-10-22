// STUB (Game engine package). Seeded PRNG; state lives in MatchState.rng.
import { notImplemented } from "../not-implemented";
import type { Rng } from "./types";

/** A PRNG starting from a 32-bit unsigned state (MatchInit.seed or MatchState.rng). */
export function createRng(state: number): Rng {
  void state;
  return notImplemented("rng.createRng");
}
