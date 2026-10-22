// GET /home?course=: everything the Home screen shows for one course.
import { Hono } from "hono";
import { and, count, eq } from "drizzle-orm";
import { CourseQuerySchema, type HomeResponse } from "../../shared/api-schemas";
import { LIMITS, MATCHMAKER } from "../../shared/game/config";
import { matchmakerName } from "../do/contracts";
import { missedQuestions } from "../db/schema";
import { botStats, getActiveCourse, getDb, matchHistory, rankedStats, ratingsFor } from "../db/queries";
import type { Env, HonoEnv } from "../env";
import { currentUser, notFound, readQuery } from "../middleware/http";
import { requireUser } from "../middleware/session";
import { nextBotFor } from "./bots";

export const homeRoutes = new Hono<HonoEnv>();

/** Players in a course's ranked queue; 0 when the Matchmaker cannot be reached. */
export async function searchingCount(env: Env, courseId: string): Promise<number> {
  try {
    const stub = env.MATCHMAKER.getByName(matchmakerName(courseId), { locationHint: MATCHMAKER.locationHint });
    const n = await stub.searching();
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch (err) {
    console.error("home: matchmaker searching() failed", err instanceof Error ? err.message : err);
    return 0;
  }
}

homeRoutes.get("/home", requireUser, async (c) => {
  const db = getDb(c.env);
  const me = currentUser(c);
  const { course } = readQuery(c, CourseQuerySchema);
  if (!(await getActiveCourse(db, course))) throw notFound("Unknown course");

  const [rows, missed, recent, searching] = await Promise.all([
    ratingsFor(db, me.id, course),
    db
      .select({ n: count() })
      .from(missedQuestions)
      .where(and(eq(missedQuestions.userId, me.id), eq(missedQuestions.courseId, course), eq(missedQuestions.status, "open"))),
    matchHistory(db, me.id, { courseId: course, limit: LIMITS.homeRecentMatches }),
    searchingCount(c.env, course),
  ]);
  const r = rows.get(course) ?? {};
  const bot = botStats(r.bot);
  const body: HomeResponse = {
    courseId: course,
    ranked: rankedStats(r.ranked),
    bot,
    searching,
    missedOpen: missed[0]?.n ?? 0,
    recentMatches: recent,
    nextBot: nextBotFor(bot.highestBotLevel),
  };
  return c.json(body);
});
