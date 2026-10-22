// Match rows as summaries for lists (home, history, profiles).
import { and, desc, eq, inArray, isNotNull, lt, or } from "drizzle-orm";
import type { MatchSummary, PublicUser } from "../../../shared/api-schemas";
import { BOT_LADDER, ECHO, TEST_BOTS } from "../../../shared/game/config";
import { matches } from "../schema";
import type { Db } from "./db";
import { publicUsersById } from "./users";

export type MatchRow = typeof matches.$inferSelect;

/** Display name of a bot level (-1 Echo, 0 and 9 test bots, 1 to 8 ladder). */
export function botName(level: number): string {
  if (level === ECHO.level) return ECHO.name;
  if (level === TEST_BOTS.dummy.level) return TEST_BOTS.dummy.name;
  if (level === TEST_BOTS.oracle.level) return TEST_BOTS.oracle.name;
  return BOT_LADDER.find((b) => b.level === level)?.name ?? "Bot";
}

/**
 * D1 only; routes use liveMatchId (match-liveness.ts), which also asks the room.
 * The user's running match: status `active` (the factory creates ranked, bot
 * and rematch rows as active). With `includeFullLobbies`, also a private lobby
 * both players are already in (status `lobby` until both are ready), so a
 * refresh in the lobby still gets the "Back to your match" bar.
 */
export async function activeMatchId(db: Db, userId: string, opts: { includeFullLobbies?: boolean } = {}): Promise<string | null> {
  const status = opts.includeFullLobbies
    ? or(eq(matches.status, "active"), and(eq(matches.status, "lobby"), isNotNull(matches.playerB)))
    : eq(matches.status, "active");
  const rows = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(status, or(eq(matches.playerA, userId), eq(matches.playerB, userId))))
    .orderBy(desc(matches.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Side of a user in a match row, or null when not a player. */
export function sideOf(row: Pick<MatchRow, "playerA" | "playerB">, userId: string): "a" | "b" | null {
  if (row.playerA === userId) return "a";
  if (row.playerB === userId) return "b";
  return null;
}

function change(before: number | null, after: number | null): number | null {
  if (before == null || after == null) return null;
  return Math.round(after - before);
}

/** A finished or void match from one player's side. */
export function toMatchSummary(row: MatchRow, userId: string, users: Map<string, PublicUser>): MatchSummary {
  const side = sideOf(row, userId) ?? "a";
  const mine = side === "a";
  const opponentId = mine ? row.playerB : row.playerA;
  let result: MatchSummary["result"];
  if (row.status === "void") result = "void";
  else if (row.winner === "draw") result = "draw";
  else if (row.winner === side) result = "win";
  else if (row.winner === null) result = "void";
  else result = "loss";

  let ratingChange: number | null;
  if (row.mode === "bot") ratingChange = mine ? change(row.botRatingBefore, row.botRatingAfter) : null;
  else ratingChange = mine ? change(row.ratingABefore, row.ratingAAfter) : change(row.ratingBBefore, row.ratingBAfter);

  const hpA = row.hpA ?? 0;
  const hpB = row.hpB ?? 0;
  return {
    id: row.id,
    courseId: row.courseId,
    mode: row.mode,
    rated: row.rated,
    opponent: opponentId ? (users.get(opponentId) ?? null) : null,
    bot: row.mode === "bot" && row.botLevel != null ? { level: row.botLevel, name: botName(row.botLevel) } : null,
    result,
    endReason: row.endReason ?? "void",
    ratingChange,
    hp: { you: mine ? hpA : hpB, opponent: mine ? hpB : hpA },
    roundsPlayed: row.roundsPlayed ?? 0,
    endedAt: row.endedAt ?? row.createdAt,
  };
}

/** Finished and void matches of a user, newest first. */
export async function matchHistory(
  db: Db,
  userId: string,
  opts: { courseId?: string; before?: number; limit: number },
): Promise<MatchSummary[]> {
  const conditions = [
    or(eq(matches.playerA, userId), eq(matches.playerB, userId)),
    inArray(matches.status, ["finished", "void"]),
    isNotNull(matches.endedAt),
  ];
  if (opts.courseId) conditions.push(eq(matches.courseId, opts.courseId));
  if (opts.before != null) conditions.push(lt(matches.endedAt, opts.before));
  const rows = await db
    .select()
    .from(matches)
    .where(and(...conditions))
    .orderBy(desc(matches.endedAt))
    .limit(opts.limit);
  const users = await publicUsersById(
    db,
    rows.map((r) => (r.playerA === userId ? r.playerB : r.playerA)),
  );
  return rows.map((r) => toMatchSummary(r, userId, users));
}
