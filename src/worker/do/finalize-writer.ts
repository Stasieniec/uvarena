// End-of-match D1 access for the MatchRoom: loads what planFinalization needs,
// and writes its plan as one batch that starts with INSERT INTO
// match_finalizations. D1 runs a batch as one transaction, so a second attempt
// (a retried alarm, a second finalize effect) fails on that first statement's
// primary key and rolls back without touching anything.
//
// One statement per row: D1 limits bound parameters per statement, and a
// multi-row insert of 25 rounds would exceed it.

import { and, eq, gte, inArray, lt, ne, or, sql } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { ELO, PAIR_CAP } from "../../shared/game/config";
import type {
  FinalizationContext,
  FinalizationPlan,
  MatchState,
  PlayerCourseRow,
  RatingKind,
  RatingRow,
} from "../../shared/game/types";
import {
  answers,
  matches,
  matchFinalizations,
  matchRounds,
  missedQuestions,
  playerCourse,
  questions,
  ratings,
} from "../db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;
const RATING_KINDS: readonly RatingKind[] = ["ranked", "bot", "casual"];

/** User ids of the human players, side order. */
export function humanIds(state: MatchState): string[] {
  const ids: string[] = [];
  for (const p of state.players) {
    if (p && p.kind === "human" && p.userId) ids.push(p.userId);
  }
  return ids;
}

/** UTC offset of a time zone at an instant, in ms (local wall clock minus UTC). */
function zoneOffsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(at / 1000) * 1000;
}

/** Epoch ms of local midnight in `timeZone` on the calendar day that contains `now`. */
export function startOfDay(now: number, timeZone: string): number {
  const offsetNow = zoneOffsetMs(now, timeZone);
  const localMidnight = Math.floor((now + offsetNow) / DAY_MS) * DAY_MS;
  // On a DST change day the offset at midnight differs from the offset now.
  const offsetAtMidnight = zoneOffsetMs(localMidnight - offsetNow, timeZone);
  return localMidnight - offsetAtMidnight;
}

/** Reads rating rows, player_course rows, 30-day recent answers and the pair count for a finished match. */
export async function loadFinalizationContext(db: D1Database, state: MatchState, now: number): Promise<FinalizationContext> {
  const orm = drizzle(db);
  const users = humanIds(state);

  const ctx: FinalizationContext = { now, ratings: {}, playerCourse: {}, recentAnswers: {}, pairCount: 0 };
  for (const id of users) {
    ctx.ratings[id] = { ranked: null, bot: null, casual: null };
    ctx.playerCourse[id] = null;
    ctx.recentAnswers[id] = [];
  }
  if (users.length === 0) return ctx;

  const ratingRows = await orm
    .select()
    .from(ratings)
    .where(and(inArray(ratings.userId, users), eq(ratings.courseId, state.courseId)));
  for (const row of ratingRows) {
    if (!RATING_KINDS.includes(row.kind)) continue;
    const byKind = ctx.ratings[row.userId];
    if (byKind) byKind[row.kind] = row satisfies RatingRow;
  }

  const pcRows = await orm
    .select()
    .from(playerCourse)
    .where(and(inArray(playerCourse.userId, users), eq(playerCourse.courseId, state.courseId)));
  for (const row of pcRows) ctx.playerCourse[row.userId] = row satisfies PlayerCourseRow;

  // Item guard: answers to this match's questions in the window before it started.
  const questionIds = [...new Set(state.rounds.map((r) => r.questionId))];
  if (questionIds.length > 0) {
    const start = state.startedAt ?? state.createdAt;
    const recent = await orm
      .selectDistinct({ userId: answers.userId, questionId: answers.questionId })
      .from(answers)
      .where(
        and(
          inArray(answers.userId, users),
          inArray(answers.questionId, questionIds),
          gte(answers.answeredAt, start - ELO.itemRepeatWindowDays * DAY_MS),
          lt(answers.answeredAt, start),
          ne(answers.matchId, state.matchId),
        ),
      );
    for (const row of recent) ctx.recentAnswers[row.userId]?.push(row.questionId);
  }

  const [a, b] = users;
  if (state.rated && a && b) {
    const dayStart = startOfDay(now, PAIR_CAP.timeZone);
    const [row] = await orm
      .select({ n: sql<number>`count(*)` })
      .from(matches)
      .where(
        and(
          eq(matches.status, "finished"),
          eq(matches.rated, true),
          ne(matches.id, state.matchId),
          gte(matches.endedAt, dayStart),
          or(
            and(eq(matches.playerA, a), eq(matches.playerB, b)),
            and(eq(matches.playerA, b), eq(matches.playerB, a)),
          ),
        ),
      );
    ctx.pairCount = Number(row?.n ?? 0);
  }

  return ctx;
}

async function isFinalized(orm: DrizzleD1Database, matchId: string): Promise<boolean> {
  const [row] = await orm
    .select({ matchId: matchFinalizations.matchId })
    .from(matchFinalizations)
    .where(eq(matchFinalizations.matchId, matchId));
  return row !== undefined;
}

/** The plan as D1 statements, match_finalizations first. Exported for tests. */
export function finalizationStatements(orm: DrizzleD1Database, plan: FinalizationPlan) {
  const guard = orm.insert(matchFinalizations).values({ matchId: plan.matchId, finalizedAt: plan.finalizedAt });
  const rest = [];

  rest.push(orm.update(matches).set(plan.match).where(eq(matches.id, plan.matchId)));

  for (const row of plan.rounds) rest.push(orm.insert(matchRounds).values(row).onConflictDoNothing());
  for (const row of plan.answers) rest.push(orm.insert(answers).values(row).onConflictDoNothing());

  for (const m of plan.missed) {
    rest.push(
      orm
        .insert(missedQuestions)
        .values({
          userId: m.userId,
          questionId: m.questionId,
          courseId: m.courseId,
          lectureId: m.lectureId,
          status: "open",
          timesMissed: 1,
          firstMissedAt: m.missedAt,
          lastMissedAt: m.missedAt,
          lastAnswerJson: m.lastAnswerJson,
          lastMatchId: m.matchId,
        })
        .onConflictDoUpdate({
          target: [missedQuestions.userId, missedQuestions.questionId],
          set: {
            timesMissed: sql`${missedQuestions.timesMissed} + 1`,
            lastMissedAt: m.missedAt,
            lastAnswerJson: m.lastAnswerJson,
            lastMatchId: m.matchId,
            status: "open",
            learnedAt: null,
          },
        }),
    );
  }

  for (const d of plan.items) {
    rest.push(
      orm
        .update(questions)
        .set({
          rating: sql`${questions.rating} + ${d.ratingDelta}`,
          ratingN: sql`${questions.ratingN} + ${d.ratingNDelta}`,
          attempts: sql`${questions.attempts} + ${d.attemptsDelta}`,
          correct: sql`${questions.correct} + ${d.correctDelta}`,
        })
        .where(eq(questions.id, d.questionId)),
    );
  }

  for (const row of plan.ratings) {
    rest.push(
      orm
        .insert(ratings)
        .values(row)
        .onConflictDoUpdate({
          target: [ratings.userId, ratings.courseId, ratings.kind],
          set: {
            rating: row.rating,
            rd: row.rd,
            vol: row.vol,
            n: row.n,
            played: row.played,
            won: row.won,
            lost: row.lost,
            drawn: row.drawn,
            surrendered: row.surrendered,
            abandoned: row.abandoned,
            curStreak: row.curStreak,
            bestStreak: row.bestStreak,
            highestBotLevel: row.highestBotLevel,
            lastPlayedAt: row.lastPlayedAt,
            updatedAt: row.updatedAt,
          },
        }),
    );
  }

  for (const d of plan.playerCourse) {
    rest.push(
      orm
        .insert(playerCourse)
        .values({
          userId: d.userId,
          courseId: d.courseId,
          answers: d.answersDelta,
          correct: d.correctDelta,
          lastAnswerAt: d.lastAnswerAt,
        })
        .onConflictDoUpdate({
          target: [playerCourse.userId, playerCourse.courseId],
          set: {
            answers: sql`${playerCourse.answers} + ${d.answersDelta}`,
            correct: sql`${playerCourse.correct} + ${d.correctDelta}`,
            lastAnswerAt: sql`max(coalesce(${playerCourse.lastAnswerAt}, 0), ${d.lastAnswerAt})`,
          },
        }),
    );
  }

  return [guard, ...rest] as const;
}

/**
 * Runs the batch. A primary-key error on match_finalizations means another
 * attempt already applied it: returns "already_finalized" and changes nothing.
 */
export async function writeFinalization(db: D1Database, plan: FinalizationPlan): Promise<"applied" | "already_finalized"> {
  const orm = drizzle(db);
  if (await isFinalized(orm, plan.matchId)) return "already_finalized";
  try {
    await orm.batch(finalizationStatements(orm, plan));
    return "applied";
  } catch (err) {
    // Lost a race with another attempt: the guard row exists and the whole
    // batch rolled back. Anything else is a real failure for the caller to retry.
    if (await isFinalized(orm, plan.matchId)) return "already_finalized";
    throw err;
  }
}
