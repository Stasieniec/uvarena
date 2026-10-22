// The queue screen's state. Pure, unit tested.

export type QueueState =
  | { kind: "connecting" }
  | { kind: "searching"; searching: number; waitedMs: number; at: number; window: number | null }
  | { kind: "found"; matchId: string }
  | { kind: "in_match"; matchId: string | null }
  | { kind: "failed"; message: string };

/** Elapsed wait in ms, from the server's last waitedMs plus local time since. */
export function elapsedMs(state: QueueState, mountedAt: number, now: number): number {
  if (state.kind === "searching") return state.waitedMs + Math.max(0, now - state.at);
  return Math.max(0, now - mountedAt);
}
