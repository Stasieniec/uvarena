// STUB (Ratings and finalization package). Glicko-2, one game per rating period.
import { notImplemented } from "../not-implemented";
import type { GlickoRating } from "./types";

export interface GlickoGame {
  opponent: GlickoRating;
  /** 1 win, 0.5 draw, 0 loss (surrender and abandon are losses). */
  score: number;
}

/** Glickman's algorithm with tau, Illinois volatility iteration, RD clamp, rating floor and max change from config. */
export function glicko2Update(player: GlickoRating, games: readonly GlickoGame[]): GlickoRating {
  void player; void games;
  return notImplemented("glicko2.glicko2Update");
}

/** RD inflation for full idle days: phi = sqrt(phi^2 + vol^2) per day, capped at GLICKO.rdMax. */
export function inflateForIdleDays(rating: GlickoRating, idleDays: number): GlickoRating {
  void rating; void idleDays;
  return notImplemented("glicko2.inflateForIdleDays");
}

/** Provisional while RD >= GLICKO.provisionalRd. */
export function isProvisional(rd: number): boolean {
  void rd;
  return notImplemented("glicko2.isProvisional");
}
