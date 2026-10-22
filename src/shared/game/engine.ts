// STUB (Game engine package). The duel as a pure reducer.
import { notImplemented } from "../not-implemented";
import type { EngineEvent, MatchInit, MatchState, Side, StepResult } from "./types";

export { matchEnd, view } from "./view";

/** Creates the state for a new match (lobby, or straight to waiting for connections). */
export function initState(init: MatchInit, now: number): StepResult {
  void init; void now;
  return notImplemented("engine.initState");
}

/**
 * Applies one event. Invalid events return the state unchanged plus one
 * `error` message to that side. `tick` processes every due deadline in time
 * order.
 */
export function step(state: MatchState, event: EngineEvent, now: number): StepResult {
  void state; void event; void now;
  return notImplemented("engine.step");
}

/** Earliest pending deadline, or null when nothing is pending. The MatchRoom sets its alarm to this. */
export function nextDeadline(state: MatchState): number | null {
  void state;
  return notImplemented("engine.nextDeadline");
}

/** The side a user plays, or null for non-players. */
export function sideOf(state: MatchState, userId: string): Side | null {
  void state; void userId;
  return notImplemented("engine.sideOf");
}
