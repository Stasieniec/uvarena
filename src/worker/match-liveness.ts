// Whether a `matches` row that D1 says is running (status `active`, or a
// private `lobby`) really is, asked of its MatchRoom. D1 and the room can
// disagree when a D1 write failed for good: the room gave up on its
// finalize or cancelled effect, or the factory could not initialise the room
// and its compensating update failed too. Without this check such a row
// would hold its players "in a match" forever (no ranked queue, a "Back to
// your match" bar that leads nowhere).
//
// A dead row is closed here with no rating change: `void` when the match had
// started (its result was never written), `cancelled` otherwise.

import { and, desc, eq, isNotNull, or } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { MATCH } from "../shared/game/config";
import { IN_PLAY_PHASES } from "../shared/game/view";
import type { MatchStatus } from "../shared/game/types";
import { matches } from "./db/schema";
import type { Env } from "./env";

export type RunningRow = Pick<typeof matches.$inferSelect, "id" | "status" | "createdAt" | "startedAt">;

/** Closes a row still marked lobby or active. No-op once it has any other status. */
export async function closeMatchRow(db: D1Database, matchId: string, status: Extract<MatchStatus, "void" | "cancelled">, endedAt: number): Promise<void> {
  await db
    .prepare(
      `UPDATE matches SET status = ?, end_reason = ?, ended_at = coalesce(ended_at, ?)
       WHERE id = ? AND status IN ('lobby', 'active')`,
    )
    .bind(status, status === "void" ? "void" : "cancelled", endedAt, matchId)
    .run();
}

/**
 * "live" when the room is in its lobby or in play, or ended but still
 * writing its result to D1 (a pending effect: the result and ratings land
 * first, so a new match cannot start on stale ratings). "over" otherwise, in
 * which case a row D1 still shows as running is closed. A room that cannot
 * be asked counts as live: the next check tries again.
 */
export async function roomVerdict(env: Env, row: RunningRow, now: number): Promise<"live" | "over"> {
  let summary;
  try {
    summary = await env.MATCH_ROOM.getByName(row.id).summary();
  } catch (err) {
    console.error("match liveness: summary failed", row.id, err);
    return "live";
  }
  if (!summary.exists) {
    if (now - row.createdAt < MATCH.roomInitGraceMs) return "live";
    await closeMatchRow(env.DB, row.id, row.startedAt !== null ? "void" : "cancelled", now);
    return "over";
  }
  if (summary.phase === "lobby" || IN_PLAY_PHASES.includes(summary.phase)) return "live";
  if (summary.effectsPending) return "live";
  // Finished or cancelled, nothing left to retry. A finished room that is not
  // finalized gave up on its result; one that is finalized already wrote the row.
  if (summary.phase === "cancelled") await closeMatchRow(env.DB, row.id, "cancelled", now);
  else if (!summary.finalized) await closeMatchRow(env.DB, row.id, "void", now);
  return "over";
}

/**
 * The user's running match, checked with its room (see roomVerdict). With
 * `includeFullLobbies`, a private lobby both players are in also counts.
 */
export async function liveMatchId(env: Env, userId: string, opts: { includeFullLobbies?: boolean } = {}): Promise<string | null> {
  const orm: DrizzleD1Database = drizzle(env.DB);
  const status = opts.includeFullLobbies
    ? or(eq(matches.status, "active"), and(eq(matches.status, "lobby"), isNotNull(matches.playerB)))
    : eq(matches.status, "active");
  const rows = await orm
    .select({ id: matches.id, status: matches.status, createdAt: matches.createdAt, startedAt: matches.startedAt })
    .from(matches)
    .where(and(status, or(eq(matches.playerA, userId), eq(matches.playerB, userId))))
    .orderBy(desc(matches.createdAt));
  const now = Date.now();
  for (const row of rows) {
    if ((await roomVerdict(env, row, now)) === "live") return row.id;
  }
  return null;
}

/** SQL condition on a matches row (alias m) that holds its players as busy: active, or a full private lobby. */
export const BUSY_ROW_SQL = `(m.status = 'active' OR (m.status = 'lobby' AND m.player_b IS NOT NULL))`;
