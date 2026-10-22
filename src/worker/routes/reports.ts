// POST /questions/:id/report: a player flags a question. Repeating the same
// open report (same question, revision and reason) is a no-op.
import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { QuestionIdSchema, ReportBodySchema } from "../../shared/api-schemas";
import { questionReports } from "../db/schema";
import { getDb, getQuestion } from "../db/queries";
import type { HonoEnv } from "../env";
import { currentUser, notFound, readJson, readParam } from "../middleware/http";
import { requireUser } from "../middleware/session";

export const reportsRoutes = new Hono<HonoEnv>();

reportsRoutes.post("/questions/:id/report", requireUser, async (c) => {
  const db = getDb(c.env);
  const me = currentUser(c);
  const questionId = readParam(c, "id", QuestionIdSchema);
  const body = await readJson(c, ReportBodySchema);
  const question = await getQuestion(db, questionId);
  if (!question) throw notFound("Question not found");

  const existing = await db
    .select({ id: questionReports.id })
    .from(questionReports)
    .where(
      and(
        eq(questionReports.userId, me.id),
        eq(questionReports.questionId, questionId),
        eq(questionReports.questionRev, question.rev),
        eq(questionReports.reason, body.reason),
        isNull(questionReports.resolvedAt),
      ),
    )
    .limit(1);
  if (existing.length === 0) {
    await db.insert(questionReports).values({
      id: crypto.randomUUID(),
      userId: me.id,
      questionId,
      questionRev: question.rev,
      reason: body.reason,
      note: body.note ? body.note : null,
      matchId: body.matchId ?? null,
      createdAt: Date.now(),
    });
  }
  return c.json({ ok: true as const });
});
