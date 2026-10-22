// GET /leaderboards/:course: ranked ratings, established players first, then
// "Still provisional" in a separate list. Bot ratings have no leaderboard.
import { Hono } from "hono";
import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import { CourseIdSchema, type LeaderboardResponse } from "../../shared/api-schemas";
import { ratings, user } from "../db/schema";
import { getActiveCourse, getDb, isRankedProvisional, publicUserColumns, toPublicUser } from "../db/queries";
import type { HonoEnv } from "../env";
import { notFound, readParam } from "../middleware/http";
import { requireUser } from "../middleware/session";

export const leaderboardsRoutes = new Hono<HonoEnv>();

/** Rows per section. */
export const LEADERBOARD_SIZE = 100;

leaderboardsRoutes.get("/leaderboards/:course", requireUser, async (c) => {
  const db = getDb(c.env);
  const course = readParam(c, "course", CourseIdSchema);
  if (!(await getActiveCourse(db, course))) throw notFound("Unknown course");

  const rows = await db
    .select({ ...publicUserColumns, rating: ratings.rating, rd: ratings.rd, played: ratings.played, won: ratings.won })
    .from(ratings)
    .innerJoin(user, eq(user.id, ratings.userId))
    .where(and(eq(ratings.courseId, course), eq(ratings.kind, "ranked"), isNotNull(ratings.rating), gt(ratings.played, 0), isNotNull(user.username)))
    .orderBy(desc(ratings.rating), desc(ratings.played));

  const established: LeaderboardResponse["established"] = [];
  const provisional: LeaderboardResponse["provisional"] = [];
  for (const r of rows) {
    const list = isRankedProvisional(r.rd) ? provisional : established;
    if (list.length >= LEADERBOARD_SIZE) continue;
    list.push({ rank: list.length + 1, user: toPublicUser(r), rating: Math.round(r.rating ?? 0), played: r.played, won: r.won });
  }
  return c.json({ courseId: course, established, provisional } satisfies LeaderboardResponse);
});
