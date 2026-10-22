// GET /matches/:id (a finished match, round by round, with keys: the match is
// over) and GET /matches/:id/ws (the match socket, forwarded to its MatchRoom).
import { Hono } from "hono";
import { asc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { MatchIdSchema, type MatchDetailResponse, MatchDetailRoundSideSchema } from "../../shared/api-schemas";
import { CLOSE_CODES } from "../../shared/protocol";
import type { AnswerKey, RoundPowerups } from "../../shared/game/types";
import { HEADERS } from "../do/contracts";
import { matchRounds, matches, questions } from "../db/schema";
import { botName, getDb, lectureTitles, publicUsersById, sideOf, toQuestionPublic } from "../db/queries";
import type { HonoEnv } from "../env";
import { notFound, readParam } from "../middleware/http";
import { requireUser } from "../middleware/session";
import { forwardedRequest, refuseSocket, socketPrecheck } from "../middleware/ws";

export const matchesRoutes = new Hono<HonoEnv>();

type RoundSide = z.infer<typeof MatchDetailRoundSideSchema>;
type RoundRow = typeof matchRounds.$inferSelect;

function roundSide(row: RoundRow, side: 0 | 1): RoundSide {
  const p: Partial<RoundPowerups> = row.powerupsJson ?? {};
  const a = side === 0;
  return {
    answer: ((a ? row.answerAJson : row.answerBJson) ?? null) as AnswerKey | null,
    correct: a ? row.correctA : row.correctB,
    ms: (a ? row.msA : row.msB) ?? null,
    score: a ? row.scoreA : row.scoreB,
    damageTaken: a ? row.damageToA : row.damageToB,
    hpAfter: a ? row.hpAAfter : row.hpBAfter,
    armed: p.armed?.[side] ?? null,
    effective: p.effective?.[side] ?? null,
    cancelled: p.cancelled?.[side] ?? false,
    quick: p.quick?.[side] ?? null,
    phoenix: p.phoenix?.[side] ?? false,
  };
}

matchesRoutes.get("/matches/:id/ws", async (c) => {
  const early = socketPrecheck(c);
  if (early) return early;
  const me = c.get("user");
  if (!me) return refuseSocket(CLOSE_CODES.notAuthorised, "sign in first");
  const parsed = MatchIdSchema.safeParse(c.req.param("id"));
  if (!parsed.success) return refuseSocket(CLOSE_CODES.notFound, "match not found");
  const matchId = parsed.data;

  const db = getDb(c.env);
  const rows = await db
    .select({ id: matches.id, playerA: matches.playerA, playerB: matches.playerB })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  const row = rows[0];
  if (!row) return refuseSocket(CLOSE_CODES.notFound, "match not found");
  if (!sideOf(row, me.id)) return refuseSocket(CLOSE_CODES.notAuthorised, "not a player");

  const stub = c.env.MATCH_ROOM.getByName(matchId);
  return stub.fetch(forwardedRequest(c.req.raw, { [HEADERS.userId]: me.id }));
});

matchesRoutes.get("/matches/:id", requireUser, async (c) => {
  const matchId = readParam(c, "id", MatchIdSchema);
  const db = getDb(c.env);
  const rows = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  const match = rows[0];
  // Only finished matches: a running match's questions and keys stay secret.
  if (!match || (match.status !== "finished" && match.status !== "void")) throw notFound("Match not found");

  const roundRows = await db.select().from(matchRounds).where(eq(matchRounds.matchId, matchId)).orderBy(asc(matchRounds.roundNo));
  const questionIds = [...new Set(roundRows.map((r) => r.questionId))];
  const questionRows = questionIds.length > 0 ? await db.select().from(questions).where(inArray(questions.id, questionIds)) : [];
  const byId = new Map(questionRows.map((q) => [q.id, q]));
  const [titles, users] = await Promise.all([
    lectureTitles(db, questionRows.map((q) => q.lectureId)),
    publicUsersById(db, [match.playerA, match.playerB]),
  ]);

  const isBot = match.mode === "bot";
  const body: MatchDetailResponse = {
    id: match.id,
    courseId: match.courseId,
    mode: match.mode,
    rated: match.rated,
    status: match.status,
    settings: match.settingsJson,
    winner: match.winner ?? null,
    endReason: match.endReason ?? "void",
    pairCapped: match.pairCapped,
    roundsPlayed: match.roundsPlayed ?? roundRows.length,
    startedAt: match.startedAt ?? null,
    endedAt: match.endedAt ?? match.createdAt,
    players: [
      {
        side: "a",
        user: users.get(match.playerA) ?? null,
        bot: null,
        hpEnd: match.hpA ?? 0,
        ratingBefore: isBot ? (match.botRatingBefore ?? null) : (match.ratingABefore ?? null),
        ratingAfter: isBot ? (match.botRatingAfter ?? null) : (match.ratingAAfter ?? null),
      },
      {
        side: "b",
        user: !isBot && match.playerB ? (users.get(match.playerB) ?? null) : null,
        bot: isBot && match.botLevel != null ? { level: match.botLevel, name: botName(match.botLevel) } : null,
        hpEnd: match.hpB ?? 0,
        ratingBefore: isBot ? (match.botRating ?? null) : (match.ratingBBefore ?? null),
        ratingAfter: isBot ? (match.botRating ?? null) : (match.ratingBAfter ?? null),
      },
    ],
    rounds: roundRows.flatMap((r) => {
      const q = byId.get(r.questionId);
      if (!q) return []; // a question deleted from the bank; never happens with retire-only imports
      return [
        {
          round: r.roundNo,
          multiplier: r.multiplier,
          question: { ...toQuestionPublic(q, titles.get(q.lectureId) ?? "", { shuffle: false }), key: q.keyJson, why: q.whyMd },
          a: roundSide(r, 0),
          b: roundSide(r, 1),
        },
      ];
    }),
  };
  return c.json(body);
});
