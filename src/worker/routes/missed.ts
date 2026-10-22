// Missed questions. Every endpoint touches only the caller's own rows and works
// only for questions the caller has a row for (404 otherwise, the same as a
// question that does not exist). The key is only ever returned for a question
// the caller has already answered (that is what a missed row is).
// Retries change no rating, no item and no stat other than the row's retry
// counters.
import { Hono } from "hono";
import { and, count, desc, eq, lt, sql } from "drizzle-orm";
import {
  MissedListQuerySchema,
  MissedRetryBodySchema,
  MissedStatusBodySchema,
  QuestionIdSchema,
  type MissedAnswerResponse,
  type MissedListResponse,
  type MissedQuestionResponse,
  type MissedRetryResponse,
} from "../../shared/api-schemas";
import { LIMITS } from "../../shared/game/config";
import { lectures, missedQuestions, questions } from "../db/schema";
import { answerFits, answersEqual, getDb, getQuestion, lectureTitles, preview, toQuestionPublic, type Db } from "../db/queries";
import type { HonoEnv } from "../env";
import { ApiFailure, currentUser, notFound, readJson, readParam, readQuery } from "../middleware/http";
import { requireUser } from "../middleware/session";

export const missedRoutes = new Hono<HonoEnv>();

type MissedRow = typeof missedQuestions.$inferSelect;

/** The caller's row and its question, or 404. */
async function ownMissed(db: Db, userId: string, questionId: string) {
  const rows = await db
    .select()
    .from(missedQuestions)
    .where(and(eq(missedQuestions.userId, userId), eq(missedQuestions.questionId, questionId)))
    .limit(1);
  const missed = rows[0];
  if (!missed) throw notFound("Question not found");
  const question = await getQuestion(db, questionId);
  if (!question) throw notFound("Question not found");
  return { missed, question };
}

function explanation(question: NonNullable<Awaited<ReturnType<typeof getQuestion>>>) {
  return {
    key: question.keyJson,
    why: question.whyMd,
    optionWhy: question.optionWhyJson ?? {},
    noteUrl: question.noteUrl ?? null,
  };
}

missedRoutes.get("/missed", requireUser, async (c) => {
  const db = getDb(c.env);
  const me = currentUser(c);
  const query = readQuery(c, MissedListQuerySchema);
  const filter = [
    eq(missedQuestions.userId, me.id),
    eq(missedQuestions.status, query.status),
    eq(missedQuestions.courseId, query.course),
  ];
  if (query.lecture) filter.push(eq(missedQuestions.lectureId, query.lecture));
  const page = query.before != null ? [...filter, lt(missedQuestions.lastMissedAt, query.before)] : filter;

  const [total, rows] = await Promise.all([
    db.select({ n: count() }).from(missedQuestions).where(and(...filter)),
    db
      .select({
        questionId: missedQuestions.questionId,
        lectureId: missedQuestions.lectureId,
        lectureTitle: lectures.title,
        timesMissed: missedQuestions.timesMissed,
        lastMissedAt: missedQuestions.lastMissedAt,
        type: questions.type,
        promptMd: questions.promptMd,
        statementMd: questions.statementMd,
      })
      .from(missedQuestions)
      .innerJoin(questions, eq(questions.id, missedQuestions.questionId))
      .leftJoin(lectures, eq(lectures.id, missedQuestions.lectureId))
      .where(and(...page))
      .orderBy(desc(missedQuestions.lastMissedAt), desc(missedQuestions.questionId))
      .limit(LIMITS.missedPage),
  ]);

  const body: MissedListResponse = {
    count: total[0]?.n ?? 0,
    items: rows.map((r) => ({
      questionId: r.questionId,
      lectureId: r.lectureId,
      lectureTitle: r.lectureTitle ?? "",
      preview: preview(r),
      type: r.type,
      timesMissed: r.timesMissed,
      lastMissedAt: r.lastMissedAt,
    })),
    nextBefore: rows.length === LIMITS.missedPage ? rows[rows.length - 1]!.lastMissedAt : null,
  };
  return c.json(body);
});

missedRoutes.get("/missed/:questionId", requireUser, async (c) => {
  const db = getDb(c.env);
  const me = currentUser(c);
  const questionId = readParam(c, "questionId", QuestionIdSchema);
  const { missed, question } = await ownMissed(db, me.id, questionId);
  const titles = await lectureTitles(db, [question.lectureId]);
  const body: MissedQuestionResponse = {
    question: toQuestionPublic(question, titles.get(question.lectureId) ?? "", { shuffle: true }),
    status: missed.status,
    timesMissed: missed.timesMissed,
    lastMissedAt: missed.lastMissedAt,
    retries: missed.retries,
  };
  return c.json(body);
});

missedRoutes.get("/missed/:questionId/answer", requireUser, async (c) => {
  const db = getDb(c.env);
  const me = currentUser(c);
  const questionId = readParam(c, "questionId", QuestionIdSchema);
  const { missed, question } = await ownMissed(db, me.id, questionId);
  const body: MissedAnswerResponse = { ...explanation(question), lastAnswer: missed.lastAnswerJson ?? null };
  return c.json(body);
});

missedRoutes.post("/missed/:questionId/retry", requireUser, async (c) => {
  const db = getDb(c.env);
  const me = currentUser(c);
  const questionId = readParam(c, "questionId", QuestionIdSchema);
  const { answer } = await readJson(c, MissedRetryBodySchema);
  const { missed, question } = await ownMissed(db, me.id, questionId);
  if (!answerFits(question, answer)) {
    throw new ApiFailure(400, "bad_request", "That answer does not fit this question");
  }
  const correct = answersEqual(question.keyJson, answer);
  const now = Date.now();
  const status: MissedRow["status"] = correct ? "learned" : missed.status;
  await db
    .update(missedQuestions)
    .set({
      retries: sql`${missedQuestions.retries} + 1`,
      retryCorrect: sql`${missedQuestions.retryCorrect} + ${correct ? 1 : 0}`,
      lastRetryAt: now,
      ...(correct && missed.status !== "learned" ? { status: "learned" as const, learnedAt: now } : {}),
    })
    .where(and(eq(missedQuestions.userId, me.id), eq(missedQuestions.questionId, questionId)));
  const body: MissedRetryResponse = { ...explanation(question), correct, status };
  return c.json(body);
});

missedRoutes.post("/missed/:questionId/status", requireUser, async (c) => {
  const db = getDb(c.env);
  const me = currentUser(c);
  const questionId = readParam(c, "questionId", QuestionIdSchema);
  const { status } = await readJson(c, MissedStatusBodySchema);
  const { missed } = await ownMissed(db, me.id, questionId);
  if (missed.status !== status) {
    await db
      .update(missedQuestions)
      .set({ status, learnedAt: status === "learned" ? Date.now() : null })
      .where(and(eq(missedQuestions.userId, me.id), eq(missedQuestions.questionId, questionId)));
  }
  return c.json({ status });
});
