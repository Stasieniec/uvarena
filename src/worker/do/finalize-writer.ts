// STUB (Durable Objects package). Loads the finalization context and writes
// the plan as one D1 batch that starts with INSERT INTO match_finalizations.
import { notImplemented } from "../../shared/not-implemented";
import type { FinalizationContext, FinalizationPlan, MatchState } from "../../shared/game/types";

/** Reads rating rows, player_course rows, 30-day recent answers and the pair count for a finished match. */
export async function loadFinalizationContext(db: D1Database, state: MatchState, now: number): Promise<FinalizationContext> {
  void db; void state; void now;
  return notImplemented("finalize-writer.loadFinalizationContext");
}

/**
 * Runs the batch. A primary-key error on match_finalizations means another
 * attempt already applied it: returns "already_finalized" and changes nothing.
 */
export async function writeFinalization(db: D1Database, plan: FinalizationPlan): Promise<"applied" | "already_finalized"> {
  void db; void plan;
  return notImplemented("finalize-writer.writeFinalization");
}
