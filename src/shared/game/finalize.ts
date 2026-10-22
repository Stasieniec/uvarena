// STUB (Ratings and finalization package). Pure: finished state -> rows to write.
import { notImplemented } from "../not-implemented";
import type { FinalizationContext, FinalizationPlan, MatchState } from "./types";

/** Everything the end-of-match D1 batch writes, per build-plan.md "Finalization". */
export function planFinalization(state: MatchState, ctx: FinalizationContext): FinalizationPlan {
  void state; void ctx;
  return notImplemented("finalize.planFinalization");
}
