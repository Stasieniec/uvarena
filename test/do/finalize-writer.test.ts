// The end-of-match D1 writer with a hand-built plan, and the context loader.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { pairCapDay } from "@shared/game/finalize";
import type { FinalizationPlan, MatchState, RatingRow } from "@shared/game/types";
import { loadFinalizationContext, writeFinalization } from "../../src/worker/do/finalize-writer";
import { seedCourse, seedUser, uid } from "./helpers";

function rating(userId: string, courseId: string, over: Partial<RatingRow> = {}): RatingRow {
  return {
    userId,
    courseId,
    kind: "ranked",
    rating: 1600,
    rd: 200,
    vol: 0.06,
    n: 0,
    played: 1,
    won: 1,
    lost: 0,
    drawn: 0,
    surrendered: 0,
    abandoned: 0,
    curStreak: 1,
    bestStreak: 1,
    highestBotLevel: 0,
    lastPlayedAt: 1000,
    updatedAt: 1000,
    ...over,
  };
}

async function setup() {
  const { courseId, lectureIds, questionIds } = await seedCourse({ perLecture: 3 });
  const a = await seedUser();
  const b = await seedUser();
  const matchId = uid("m");
  await env.DB.prepare(
    `INSERT INTO matches (id, course_id, mode, rated, status, player_a, player_b, settings_json, created_at)
     VALUES (?, ?, 'ranked', 1, 'active', ?, ?, '{"powerups":true,"lectures":null}', 1)`,
  )
    .bind(matchId, courseId, a, b)
    .run();
  const lectureId = lectureIds[0]!;
  const [q1, q2] = questionIds as [string, string];
  const plan: FinalizationPlan = {
    matchId,
    finalizedAt: 5000,
    match: {
      status: "finished",
      winner: "a",
      endReason: "hp",
      roundsPlayed: 2,
      hpA: 4000,
      hpB: 0,
      ratingABefore: 1500,
      ratingAAfter: 1600,
      ratingBBefore: 1500,
      ratingBAfter: 1400,
      botRatingBefore: null,
      botRatingAfter: null,
      pairCapped: false,
      startedAt: 2000,
      endedAt: 4000,
    },
    rounds: [1, 2].map((roundNo) => ({
      matchId,
      roundNo,
      questionId: roundNo === 1 ? q1 : q2,
      questionRev: 1,
      multiplier: 1,
      answerAJson: { kind: "options" as const, ids: ["a"] },
      answerBJson: roundNo === 1 ? { kind: "options" as const, ids: ["b"] } : null,
      correctA: true,
      correctB: false,
      msA: 3000,
      msB: roundNo === 1 ? 4000 : null,
      scoreA: 900,
      scoreB: 0,
      damageToA: 0,
      damageToB: 900,
      hpAAfter: 6000,
      hpBAfter: roundNo === 1 ? 5100 : 0,
      powerupsJson: { armed: [null, null], effective: [null, null], cancelled: [false, false], quick: [null, null], phoenix: [false, false] },
    })),
    answers: [
      {
        id: `${matchId}:1:1`,
        userId: b,
        matchId,
        roundNo: 1,
        questionId: q1,
        courseId,
        lectureId,
        mode: "ranked",
        correct: false,
        timedOut: false,
        ms: 4000,
        helped: false,
        answerJson: { kind: "options", ids: ["b"] },
        answeredAt: 3000,
      },
    ],
    missed: [
      { userId: b, questionId: q1, courseId, lectureId, missedAt: 3000, lastAnswerJson: { kind: "options", ids: ["b"] }, matchId },
      { userId: b, questionId: q2, courseId, lectureId, missedAt: 3500, lastAnswerJson: null, matchId },
    ],
    items: [{ questionId: q1, ratingDelta: 12.5, ratingNDelta: 1, attemptsDelta: 2, correctDelta: 1 }],
    ratings: [rating(a, courseId), rating(b, courseId, { rating: 1400, won: 0, lost: 1, curStreak: 0 })],
    playerCourse: [
      { userId: a, courseId, answersDelta: 2, correctDelta: 2, lastAnswerAt: 3500 },
      { userId: b, courseId, answersDelta: 2, correctDelta: 0, lastAnswerAt: 3500 },
    ],
    summaries: [
      { ranked: { before: 1500, after: 1600, provisional: true }, bot: null, pairCapped: false, missedCount: 0 },
      { ranked: { before: 1500, after: 1400, provisional: true }, bot: null, pairCapped: false, missedCount: 2 },
    ],
  };
  return { courseId, a, b, matchId, q1, q2, plan };
}

describe("writeFinalization", () => {
  it("writes every row once and refuses a second application", async () => {
    const { courseId, a, b, matchId, q1, q2, plan } = await setup();
    // b had already missed q1 once and marked it learned: missing it again reopens it.
    await env.DB.prepare(
      `INSERT INTO missed_questions (user_id, question_id, course_id, lecture_id, status, times_missed, first_missed_at, last_missed_at, learned_at)
       VALUES (?, ?, ?, 'x', 'learned', 1, 10, 10, 20)`,
    )
      .bind(b, q1, courseId)
      .run();
    await env.DB.prepare("INSERT INTO player_course (user_id, course_id, answers, correct, last_answer_at) VALUES (?, ?, 10, 5, 9000)")
      .bind(a, courseId)
      .run();

    expect(await writeFinalization(env.DB, plan)).toBe("applied");
    expect(await writeFinalization(env.DB, plan)).toBe("already_finalized");

    const match = await env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(matchId).first();
    expect(match).toMatchObject({ status: "finished", winner: "a", end_reason: "hp", hp_b: 0, rating_a_after: 1600, pair_capped: 0 });
    const rounds = await env.DB.prepare("SELECT * FROM match_rounds WHERE match_id = ? ORDER BY round_no").bind(matchId).all();
    expect(rounds.results).toHaveLength(2);
    expect(JSON.parse(String(rounds.results[0]!.answer_b_json))).toEqual({ kind: "options", ids: ["b"] });
    expect(rounds.results[1]!.answer_b_json).toBeNull();
    const answers = await env.DB.prepare("SELECT * FROM answers WHERE match_id = ?").bind(matchId).all();
    expect(answers.results).toHaveLength(1);

    const missed = await env.DB.prepare("SELECT * FROM missed_questions WHERE user_id = ? ORDER BY question_id").bind(b).all();
    const m1 = missed.results.find((r) => r.question_id === q1)!;
    const m2 = missed.results.find((r) => r.question_id === q2)!;
    expect(m1).toMatchObject({ status: "open", times_missed: 2, first_missed_at: 10, last_missed_at: 3000, learned_at: null, last_match_id: matchId });
    expect(m2).toMatchObject({ status: "open", times_missed: 1, first_missed_at: 3500, last_answer_json: null });

    const item = await env.DB.prepare("SELECT rating, rating_n, attempts, correct FROM questions WHERE id = ?").bind(q1).first();
    expect(item).toEqual({ rating: 1512.5, rating_n: 1, attempts: 2, correct: 1 });

    const ra = await env.DB.prepare("SELECT * FROM ratings WHERE user_id = ? AND course_id = ?").bind(a, courseId).first();
    expect(ra).toMatchObject({ kind: "ranked", rating: 1600, played: 1, won: 1 });
    const pa = await env.DB.prepare("SELECT * FROM player_course WHERE user_id = ? AND course_id = ?").bind(a, courseId).first();
    expect(pa).toMatchObject({ answers: 12, correct: 7, last_answer_at: 9000 });
    const pb = await env.DB.prepare("SELECT * FROM player_course WHERE user_id = ? AND course_id = ?").bind(b, courseId).first();
    expect(pb).toMatchObject({ answers: 2, correct: 0, last_answer_at: 3500 });
  });

  it("overwrites rating rows with the plan's absolute values", async () => {
    const { courseId, a, plan } = await setup();
    await env.DB.prepare("INSERT INTO ratings (user_id, course_id, kind, rating, rd, vol, played, won, updated_at) VALUES (?, ?, 'ranked', 1500, 350, 0.06, 7, 3, 1)")
      .bind(a, courseId)
      .run();
    plan.ratings[0] = rating(a, courseId, { played: 8, won: 4 });
    await writeFinalization(env.DB, plan);
    const ra = await env.DB.prepare("SELECT rating, rd, played, won FROM ratings WHERE user_id = ? AND course_id = ? AND kind = 'ranked'")
      .bind(a, courseId)
      .first();
    expect(ra).toEqual({ rating: 1600, rd: 200, played: 8, won: 4 });
  });

  it("rolls back everything when a statement fails", async () => {
    const { matchId, plan } = await setup();
    // An item delta on a question that does not exist is fine (no row), but a
    // round with a missing NOT NULL value breaks the batch.
    const broken = structuredClone(plan);
    (broken.rounds[1] as { questionId: string | null }).questionId = null;
    await expect(writeFinalization(env.DB, broken)).rejects.toThrow();
    const fin = await env.DB.prepare("SELECT count(*) AS n FROM match_finalizations WHERE match_id = ?").bind(matchId).first<{ n: number }>();
    expect(fin?.n).toBe(0);
    expect(await writeFinalization(env.DB, plan)).toBe("applied");
  });
});

describe("loadFinalizationContext", () => {
  it("loads ratings, totals, recent answers and today's pair count", async () => {
    const { courseId, a, b, matchId, q1, q2 } = await setup();
    const now = Date.now();
    const startedAt = now - 60_000;
    const day = pairCapDay(now);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO ratings (user_id, course_id, kind, rating, rd, vol, updated_at) VALUES (?, ?, 'ranked', 1550, 90, 0.06, 1)").bind(a, courseId),
      env.DB.prepare("INSERT INTO ratings (user_id, course_id, kind, rating, n, updated_at) VALUES (?, ?, 'bot', 1450, 40, 1)").bind(a, courseId),
      env.DB.prepare("INSERT INTO player_course (user_id, course_id, answers, correct) VALUES (?, ?, 12, 6)").bind(b, courseId),
      // Answered q1 ten days before: inside the 30-day window. q2 forty days before: outside.
      env.DB.prepare(
        `INSERT INTO answers (id, user_id, match_id, round_no, question_id, course_id, lecture_id, mode, correct, timed_out, helped, answered_at)
         VALUES (?, ?, 'old', 1, ?, ?, 'x', 'ranked', 1, 0, 0, ?), (?, ?, 'older', 1, ?, ?, 'x', 'ranked', 1, 0, 0, ?)`,
      ).bind(uid("ans"), b, q1, courseId, startedAt - 10 * 86400000, uid("ans"), b, q2, courseId, startedAt - 40 * 86400000),
      // Two rated finished matches between them today (either side order), one yesterday, one unrated.
      ...[
        [a, b, 1, day.start + 1],
        [b, a, 1, now - 1000],
        [a, b, 1, day.start - 1],
        [a, b, 0, now - 1000],
      ].map(([pa, pb, rated, endedAt]) =>
        env.DB.prepare(
          `INSERT INTO matches (id, course_id, mode, rated, status, player_a, player_b, settings_json, created_at, ended_at)
           VALUES (?, ?, 'private', ?, 'finished', ?, ?, '{"powerups":true,"lectures":null}', 1, ?)`,
        ).bind(uid("pm"), courseId, rated, pa, pb, endedAt),
      ),
    ]);

    const state = {
      matchId,
      courseId,
      rated: true,
      startedAt,
      createdAt: startedAt,
      players: [
        { kind: "human", userId: a },
        { kind: "human", userId: b },
      ],
      rounds: [{ questionId: q1 }, { questionId: q2 }],
    } as unknown as MatchState;
    const ctx = await loadFinalizationContext(env.DB, state, now);
    expect(ctx.now).toBe(now);
    expect(ctx.ratings[a]?.ranked).toMatchObject({ rating: 1550, rd: 90 });
    expect(ctx.ratings[a]?.bot).toMatchObject({ rating: 1450, n: 40 });
    expect(ctx.ratings[a]?.casual).toBeNull();
    expect(ctx.ratings[b]).toEqual({ ranked: null, bot: null, casual: null });
    expect(ctx.playerCourse[a]).toBeNull();
    expect(ctx.playerCourse[b]).toMatchObject({ answers: 12, correct: 6 });
    expect(ctx.recentAnswers[a]).toEqual([]);
    expect(ctx.recentAnswers[b]).toEqual([q1]);
    expect(ctx.pairCount).toBe(2);
  });

  it("has no pair count for a bot match", async () => {
    const { courseId, a, matchId } = await setup();
    const state = {
      matchId,
      courseId,
      rated: false,
      startedAt: 1,
      createdAt: 1,
      players: [{ kind: "human", userId: a }, { kind: "bot", userId: null }],
      rounds: [],
    } as unknown as MatchState;
    const ctx = await loadFinalizationContext(env.DB, state, Date.now());
    expect(Object.keys(ctx.ratings)).toEqual([a]);
    expect(ctx.pairCount).toBe(0);
  });
});
