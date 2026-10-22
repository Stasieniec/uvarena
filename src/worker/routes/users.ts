// GET /users/:username (public profile with stats, accuracy per lecture and
// head-to-head with the viewer) and GET /users/:username/matches (history).
import { Hono } from "hono";
import { and, asc, count, eq, inArray, or, sql } from "drizzle-orm";
import {
  UserMatchesQuerySchema,
  UserProfileQuerySchema,
  UsernameSchema,
  type UserMatchesResponse,
  type UserProfileResponse,
} from "../../shared/api-schemas";
import { LIMITS } from "../../shared/game/config";
import { answers, courses, lectures, matches } from "../db/schema";
import {
  botStats,
  casualStats,
  getDb,
  getUserByUsername,
  matchHistory,
  rankedStats,
  ratingsFor,
  toPublicUser,
  type Db,
} from "../db/queries";
import type { HonoEnv } from "../env";
import { currentUser, notFound, readParam, readQuery } from "../middleware/http";
import { requireUser } from "../middleware/session";

export const usersRoutes = new Hono<HonoEnv>();

type Accuracy = UserProfileResponse["courses"][number]["accuracy"];

async function accuracyByCourse(db: Db, userId: string, courseIds: string[]): Promise<Map<string, Accuracy>> {
  const rows = await db
    .select({
      courseId: answers.courseId,
      lectureId: answers.lectureId,
      title: lectures.title,
      sort: lectures.sort,
      answers: count(),
      correct: sql<number>`sum(case when ${answers.correct} then 1 else 0 end)`,
    })
    .from(answers)
    .innerJoin(lectures, eq(lectures.id, answers.lectureId))
    .where(and(eq(answers.userId, userId), inArray(answers.courseId, courseIds)))
    .groupBy(answers.courseId, answers.lectureId)
    .orderBy(asc(lectures.sort), asc(answers.lectureId));
  const out = new Map<string, Accuracy>();
  for (const r of rows) {
    const list = out.get(r.courseId) ?? [];
    list.push({ lectureId: r.lectureId, title: r.title, answers: r.answers, correct: Number(r.correct ?? 0) });
    out.set(r.courseId, list);
  }
  return out;
}

/** Finished human matches between viewer and other, from the viewer's side. */
async function headToHead(db: Db, viewerId: string, otherId: string) {
  const rows = await db
    .select({ playerA: matches.playerA, winner: matches.winner })
    .from(matches)
    .where(
      and(
        eq(matches.status, "finished"),
        inArray(matches.mode, ["ranked", "private"]),
        or(
          and(eq(matches.playerA, viewerId), eq(matches.playerB, otherId)),
          and(eq(matches.playerA, otherId), eq(matches.playerB, viewerId)),
        ),
      ),
    );
  const record = { wins: 0, losses: 0, draws: 0 };
  for (const r of rows) {
    const viewerSide = r.playerA === viewerId ? "a" : "b";
    if (r.winner === "draw") record.draws += 1;
    else if (r.winner === viewerSide) record.wins += 1;
    else if (r.winner) record.losses += 1;
  }
  return record;
}

usersRoutes.get("/users/:username", requireUser, async (c) => {
  const db = getDb(c.env);
  const viewer = currentUser(c);
  const username = readParam(c, "username", UsernameSchema);
  const { course } = readQuery(c, UserProfileQuerySchema);
  const row = await getUserByUsername(db, username);
  if (!row) throw notFound("No player with that username");

  const courseRows = await db
    .select({ id: courses.id })
    .from(courses)
    .where(course ? and(eq(courses.active, true), eq(courses.id, course)) : eq(courses.active, true))
    .orderBy(asc(courses.sort));
  if (course && courseRows.length === 0) throw notFound("Unknown course");
  const courseIds = courseRows.map((r) => r.id);

  const isSelf = row.id === viewer.id;
  const [ratingRows, accuracy, h2h] = await Promise.all([
    ratingsFor(db, row.id),
    courseIds.length > 0 ? accuracyByCourse(db, row.id, courseIds) : Promise.resolve(new Map<string, Accuracy>()),
    isSelf ? Promise.resolve(null) : headToHead(db, viewer.id, row.id),
  ]);

  const body: UserProfileResponse = {
    user: toPublicUser(row),
    isSelf,
    courses: courseIds.map((courseId) => {
      const r = ratingRows.get(courseId) ?? {};
      return {
        courseId,
        ranked: rankedStats(r.ranked),
        bot: botStats(r.bot),
        casual: casualStats(r.casual),
        accuracy: accuracy.get(courseId) ?? [],
      };
    }),
    headToHead: h2h,
  };
  return c.json(body);
});

usersRoutes.get("/users/:username/matches", requireUser, async (c) => {
  const db = getDb(c.env);
  const username = readParam(c, "username", UsernameSchema);
  const query = readQuery(c, UserMatchesQuerySchema);
  const row = await getUserByUsername(db, username);
  if (!row) throw notFound("No player with that username");
  const items = await matchHistory(db, row.id, {
    courseId: query.course,
    before: query.before,
    limit: LIMITS.matchHistoryPage,
  });
  const body: UserMatchesResponse = {
    items,
    nextBefore: items.length === LIMITS.matchHistoryPage ? items[items.length - 1]!.endedAt : null,
  };
  return c.json(body);
});
