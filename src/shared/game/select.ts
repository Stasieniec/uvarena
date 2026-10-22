// STUB (Game engine package). Question selection, pure.
import { notImplemented } from "../not-implemented";
import type { MatchMode, Rng } from "./types";

export interface SelectOptions {
  /** Target item rating (selectionTarget). */
  target: number;
  /** Usually MATCH.questionsPerMatch. */
  count: number;
  /** Question ids either player answered in the last SELECTION.freshWindowDays days. */
  seenRecently: ReadonlySet<string>;
  /** Question id -> latest answered_at by either player, for filling from seen questions. */
  lastSeen: ReadonlyMap<string, number>;
  rng: Rng;
}

/**
 * Weighted sample without replacement from fresh candidates, weight
 * exp(-((rating - target) / 250)^2), then fill from seen ones, oldest first.
 * Candidates are already filtered (active, course, lectures, UI types).
 */
export function selectQuestions<T extends { id: string; rating: number }>(candidates: readonly T[], options: SelectOptions): T[] {
  void candidates; void options;
  return notImplemented("select.selectQuestions");
}

export interface TargetInput {
  mode: MatchMode;
  /** Bot ratings of the humans; null counts as SELECTION.defaultRating. */
  playerBotRatings: (number | null)[];
  /** Bot matches: the bot's strength R. */
  botStrength: number | null;
}

/** Mean of the relevant ratings plus SELECTION.targetOffset. */
export function selectionTarget(input: TargetInput): number {
  void input;
  return notImplemented("select.selectionTarget");
}
