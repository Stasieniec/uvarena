// GET /courses: active courses with their lectures and playable question counts.
import { Hono } from "hono";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { CoursesResponse } from "../../shared/api-schemas";
import { QUESTIONS } from "../../shared/game/config";
import { courses, lectures, questions } from "../db/schema";
import { getDb } from "../db/queries";
import type { HonoEnv } from "../env";
import { requireUser } from "../middleware/session";

export const coursesRoutes = new Hono<HonoEnv>();

coursesRoutes.get("/courses", requireUser, async (c) => {
  const db = getDb(c.env);
  const [courseRows, lectureRows, counts] = await Promise.all([
    db.select().from(courses).where(eq(courses.active, true)).orderBy(asc(courses.sort), asc(courses.id)),
    db.select().from(lectures).orderBy(asc(lectures.sort), asc(lectures.id)),
    db
      .select({ lectureId: questions.lectureId, n: count() })
      .from(questions)
      .where(and(eq(questions.status, "active"), inArray(questions.type, [...QUESTIONS.uiTypes])))
      .groupBy(questions.lectureId),
  ]);
  const perLecture = new Map(counts.map((r) => [r.lectureId, r.n]));
  const body: CoursesResponse = {
    courses: courseRows.map((course) => {
      // Lectures with nothing playable are left out: a filter on them could only fail.
      const lecs = lectureRows
        .filter((l) => l.courseId === course.id && (perLecture.get(l.id) ?? 0) > 0)
        .map((l) => ({ id: l.id, title: l.title, sort: l.sort, questionCount: perLecture.get(l.id) ?? 0 }));
      return {
        id: course.id,
        code: course.code,
        title: course.title,
        shortTitle: course.shortTitle,
        sort: course.sort,
        questionCount: lecs.reduce((sum, l) => sum + l.questionCount, 0),
        lectures: lecs,
      };
    }),
  };
  return c.json(body);
});
