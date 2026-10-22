// Question selection, pure. See build-plan.md "Question selection".
import { SELECTION } from "./config";
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

/** Sampling weight exp(-((rating - target) / width)^2). */
export function selectionWeight(rating: number, target: number): number {
  const z = (rating - target) / SELECTION.weightWidth;
  return Math.exp(-z * z);
}

/**
 * Weighted sample without replacement from fresh candidates, weight
 * exp(-((rating - target) / 250)^2), then fill from seen ones, oldest first.
 * Candidates are already filtered (active, course, lectures, UI types).
 * Returns at most `count` questions, fewer when there are not enough.
 */
export function selectQuestions<T extends { id: string; rating: number }>(candidates: readonly T[], options: SelectOptions): T[] {
  const count = Math.max(0, Math.floor(options.count));
  const unique = new Map<string, T>();
  for (const c of candidates) if (!unique.has(c.id)) unique.set(c.id, c);
  const all = [...unique.values()];
  const fresh = all.filter((c) => !options.seenRecently.has(c.id));
  const seen = all.filter((c) => options.seenRecently.has(c.id));

  const picked: T[] = [];
  const pool = fresh.map((c) => ({ item: c, w: selectionWeight(c.rating, options.target) }));
  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((sum, p) => sum + p.w, 0);
    let index: number;
    if (total > 0 && Number.isFinite(total)) {
      let x = options.rng.next() * total;
      index = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        x -= pool[i]!.w;
        if (x < 0) {
          index = i;
          break;
        }
      }
    } else {
      // Every weight underflowed: fall back to a uniform draw.
      index = options.rng.int(0, pool.length - 1);
    }
    picked.push(pool[index]!.item);
    pool.splice(index, 1);
  }

  if (picked.length < count) {
    const lastSeen = (id: string) => options.lastSeen.get(id) ?? 0;
    const oldestFirst = seen.slice().sort((a, b) => lastSeen(a.id) - lastSeen(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    picked.push(...oldestFirst.slice(0, count - picked.length));
  }
  return picked;
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
  const ratings = input.playerBotRatings.map((r) => r ?? SELECTION.defaultRating);
  if (input.mode === "bot" && input.botStrength !== null) ratings.push(input.botStrength);
  if (ratings.length === 0) return SELECTION.defaultRating + SELECTION.targetOffset;
  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  return mean + SELECTION.targetOffset;
}
