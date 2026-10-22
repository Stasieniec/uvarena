// STUB (Game engine package). Per-side, answer-free views of the state.
import { notImplemented } from "../not-implemented";
import type { MatchEndMessage, SnapshotMessage } from "../protocol";
import type { MatchState, Side } from "./types";

/** Full snapshot for one side, sent on every connect. Never contains the key before the reveal. */
export function view(state: MatchState, side: Side, now: number): SnapshotMessage {
  void state; void side; void now;
  return notImplemented("view.view");
}

/** match_end for one side, from state.result and state.endSummaries (ratings null until finalized or for cancelled matches). */
export function matchEnd(state: MatchState, side: Side, now: number): MatchEndMessage {
  void state; void side; void now;
  return notImplemented("view.matchEnd");
}
