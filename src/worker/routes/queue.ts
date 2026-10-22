// GET /queue/ws?course=: the ranked queue socket, forwarded to the course's
// Matchmaker with the user's ranked rating and last ranked opponent.
import { Hono } from "hono";
import { and, desc, eq, or } from "drizzle-orm";
import { QueueWsQuerySchema } from "../../shared/api-schemas";
import { GLICKO, MATCHMAKER } from "../../shared/game/config";
import { CLOSE_CODES, type QueueErrorMessage } from "../../shared/protocol";
import { HEADERS, matchmakerName } from "../do/contracts";
import { matches } from "../db/schema";
import { getActiveCourse, getDb, ratingsFor, type Db } from "../db/queries";
import { liveMatchId } from "../match-liveness";
import type { HonoEnv } from "../env";
import { forwardedRequest, refuseSocket, socketPrecheck } from "../middleware/ws";

export const queueRoutes = new Hono<HonoEnv>();

function queueError(code: QueueErrorMessage["code"], matchId: string | null): QueueErrorMessage {
  return { type: "error", serverNow: Date.now(), code, matchId };
}

/** The other player of the user's most recent ranked match in this course. */
async function lastRankedOpponent(db: Db, userId: string, courseId: string): Promise<string | null> {
  const rows = await db
    .select({ playerA: matches.playerA, playerB: matches.playerB })
    .from(matches)
    .where(and(eq(matches.courseId, courseId), eq(matches.mode, "ranked"), or(eq(matches.playerA, userId), eq(matches.playerB, userId))))
    .orderBy(desc(matches.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return row.playerA === userId ? row.playerB : row.playerA;
}

queueRoutes.get("/queue/ws", async (c) => {
  const early = socketPrecheck(c);
  if (early) return early;
  const me = c.get("user");
  if (!me) return refuseSocket(CLOSE_CODES.notAuthorised, "sign in first");
  if (!me.username) return refuseSocket(CLOSE_CODES.notAuthorised, "pick a username first");

  const query = QueueWsQuerySchema.safeParse(c.req.query());
  const db = getDb(c.env);
  if (!query.success || !(await getActiveCourse(db, query.data.course))) {
    return refuseSocket(CLOSE_CODES.notFound, "unknown course", queueError("bad_course", null));
  }
  const courseId = query.data.course;

  // Checked with the match's room, so a row left `active` by a failed D1
  // write is closed here instead of locking the player out of ranked.
  const active = await liveMatchId(c.env, me.id);
  if (active) return refuseSocket(CLOSE_CODES.normal, "already in a match", queueError("already_in_match", active));

  const [ranked, lastOpponent] = await Promise.all([
    ratingsFor(db, me.id, courseId).then((m) => m.get(courseId)?.ranked),
    lastRankedOpponent(db, me.id, courseId),
  ]);
  const headers: Record<string, string> = {
    [HEADERS.userId]: me.id,
    [HEADERS.rating]: String(ranked?.rating ?? GLICKO.startRating),
    [HEADERS.rd]: String(ranked?.rd ?? GLICKO.startRd),
  };
  if (lastOpponent) headers[HEADERS.lastOpponent] = lastOpponent;

  const stub = c.env.MATCHMAKER.getByName(matchmakerName(courseId), { locationHint: MATCHMAKER.locationHint });
  return stub.fetch(forwardedRequest(c.req.raw, headers));
});
