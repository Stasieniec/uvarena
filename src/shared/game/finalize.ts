// End of match: finished MatchState plus the loaded context -> every row the
// finalization batch writes. Pure and deterministic: the same state and
// context always give the same plan, and neither input is mutated. The batch
// itself is made idempotent by finalize-writer.ts (match_finalizations).
//
// Rules, from build-plan.md "Ratings" and "Finalization" and design.md:
// - Ranked rating (Glicko-2) moves on ranked matches and rated private
//   matches, one game per rating period: win 1, draw 0.5, loss 0. Surrender
//   and abandon are losses. Both players update from their pre-match ratings,
//   each after RD inflation for full idle days since their last ranked game.
// - Pair cap: with PAIR_CAP.perDay or more rated matches between the two
//   players already today, ratings stay as they are, pairCapped is set, and
//   the stats still count.
// - Bot rating moves per answer in bot matches only, in round order. Oracle
//   answers move neither the player nor the item. Timeouts count as wrong.
// - Item ratings move on human answers from every mode, subject to the guards
//   in itemGuardPasses().
// - A question asked again in the same match (a lecture filter with fewer
//   questions than the match needs) moves neither the bot rating nor the
//   item rating after its first appearance: its key was already revealed.
// - Void (both players gone): match, rounds, answers, missed questions and
//   answer totals are written; no rating of any kind moves (ranked, bot or
//   item) and no win, loss or played counter changes.
// - Cancelled matches (no_show, expired, cancelled) never reach this
//   function: the MatchRoom writes them directly (docs/CONTRACTS.md).

import { BOT_LADDER, ELO, GLICKO, PAIR_CAP } from "./config";
import { eloUpdate, effectiveN, isBotRatingProvisional } from "./elo";
import { defaultGlicko, fullIdleDays, glicko2Update, inflateForIdleDays, isProvisional, sanitizeGlicko } from "./glicko2";
import type {
  AnswerRow,
  EndReason,
  FinalizationContext,
  FinalizationPlan,
  GlickoRating,
  ItemDelta,
  MatchRoundRow,
  MatchRowUpdate,
  MatchState,
  MissedUpsert,
  PlayerCourseDelta,
  PlayerState,
  RatingChange,
  RatingKind,
  RatingRow,
  RoundRecord,
  Side,
  SideEndSummary,
} from "./types";

const SIDES: readonly Side[] = [0, 1];

/** End reasons that are written by the MatchRoom's cancel path, never planned here. */
export const CANCELLED_REASONS: readonly EndReason[] = ["no_show", "expired", "cancelled"];

export function isCancelledReason(reason: EndReason): boolean {
  return CANCELLED_REASONS.includes(reason);
}

/** Answer row id; stable so a retried batch cannot duplicate answers. */
export function answerRowId(matchId: string, roundNo: number, side: Side): string {
  return `${matchId}:${roundNo}:${side}`;
}

/** Which ratings row carries the win/loss counters of a match. */
export function statsKindFor(mode: MatchState["mode"], rated: boolean): RatingKind {
  if (mode === "bot") return "bot";
  if (mode === "ranked") return "ranked";
  return rated ? "ranked" : "casual";
}

/** Ranked and rated private matches between two humans move the ranked rating. */
export function movesRankedRating(state: Pick<MatchState, "mode" | "rated">): boolean {
  return state.mode === "ranked" || (state.mode === "private" && state.rated);
}

// ---------------------------------------------------------------------------
// Pair cap calendar day
// ---------------------------------------------------------------------------

/** Offset (ms) of the time zone's wall clock from UTC at instant t. */
function zoneOffsetMs(t: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(t));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(t / 1000) * 1000;
}

/** UTC instant of local midnight on the given local calendar date. */
function localMidnight(year: number, month: number, day: number, timeZone: string): number {
  const guess = Date.UTC(year, month - 1, day);
  // Two passes settle the offset; Europe/Amsterdam never changes it at midnight.
  const first = guess - zoneOffsetMs(guess, timeZone);
  return guess - zoneOffsetMs(first, timeZone);
}

/**
 * Start (inclusive) and end (exclusive) of the PAIR_CAP.timeZone calendar day
 * containing `now`, as epoch ms. The context loader counts rated finished
 * matches between the pair with ended_at in [start, end).
 */
export function pairCapDay(now: number, timeZone: string = PAIR_CAP.timeZone): { start: number; end: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(
    new Date(now),
  );
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const y = get("year");
  const m = get("month");
  const d = get("day");
  return { start: localMidnight(y, m, d, timeZone), end: localMidnight(y, m, d + 1, timeZone) };
}

/** True when this pair already played enough rated matches today. */
export function isPairCapped(pairCount: number): boolean {
  return pairCount >= PAIR_CAP.perDay;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Human {
  side: Side;
  userId: string;
  player: PlayerState;
}

function humansOf(state: MatchState): Human[] {
  const out: Human[] = [];
  for (const side of SIDES) {
    const player = state.players[side];
    if (player && player.kind === "human" && player.userId) out.push({ side, userId: player.userId, player });
  }
  return out;
}

function ratingRowOf(ctx: FinalizationContext, userId: string, kind: RatingKind): RatingRow | null {
  return ctx.ratings[userId]?.[kind] ?? null;
}

function emptyRow(userId: string, courseId: string, kind: RatingKind, now: number): RatingRow {
  return {
    userId,
    courseId,
    kind,
    rating: null,
    rd: null,
    vol: null,
    n: 0,
    played: 0,
    won: 0,
    lost: 0,
    drawn: 0,
    surrendered: 0,
    abandoned: 0,
    curStreak: 0,
    bestStreak: 0,
    highestBotLevel: 0,
    lastPlayedAt: null,
    updatedAt: now,
  };
}

/** A copy of the stored row, or a fresh one; the context is never mutated. */
function workingRow(ctx: FinalizationContext, userId: string, courseId: string, kind: RatingKind): RatingRow {
  const row = ratingRowOf(ctx, userId, kind);
  return row ? { ...row, userId, courseId, kind } : emptyRow(userId, courseId, kind, ctx.now);
}

function storedGlicko(row: RatingRow | null): GlickoRating {
  if (!row || row.rating === null) return defaultGlicko();
  return sanitizeGlicko({ r: row.rating, rd: row.rd ?? GLICKO.startRd, vol: row.vol ?? GLICKO.startVol });
}

/** Player's bot rating at match start: stored row, else the state's value, else the start value. */
function botThetaAtStart(ctx: FinalizationContext, human: Human): number {
  const row = ratingRowOf(ctx, human.userId, "bot");
  if (row && row.rating !== null && Number.isFinite(row.rating)) return row.rating;
  if (Number.isFinite(human.player.botRating)) return human.player.botRating;
  return ELO.startBotRating;
}

/** When the side answered, or the round end for a timeout. */
function answeredAtOf(round: RoundRecord, side: Side): number {
  const s = round.sides[side];
  if (s.answeredAt !== null) return s.answeredAt;
  return round.countdownEnd !== null ? Math.min(round.countdownEnd, round.deadline) : round.deadline;
}

type Outcome = "win" | "loss" | "draw" | "none";

function outcomeOf(winner: Side | "draw" | null, side: Side): Outcome {
  if (winner === null) return "none";
  if (winner === "draw") return "draw";
  return winner === side ? "win" : "loss";
}

function ladderLevelOf(state: MatchState): number | null {
  const level = state.players[1]?.bot?.level;
  if (level === undefined || level === null) return null;
  return BOT_LADDER.some((b) => b.level === level) ? level : null;
}

/** Applies one finished match to a row's counters. */
function applyCounters(row: RatingRow, outcome: Outcome, flags: { surrendered: boolean; abandoned: boolean }, endedAt: number, now: number): void {
  row.played += 1;
  if (outcome === "win") {
    row.won += 1;
    row.curStreak += 1;
    row.bestStreak = Math.max(row.bestStreak, row.curStreak);
  } else if (outcome === "loss") {
    row.lost += 1;
    row.curStreak = 0;
  } else if (outcome === "draw") {
    row.drawn += 1;
    row.curStreak = 0;
  }
  if (flags.surrendered) row.surrendered += 1;
  if (flags.abandoned) row.abandoned += 1;
  row.lastPlayedAt = endedAt;
  row.updatedAt = now;
}

// ---------------------------------------------------------------------------
// Item guard
// ---------------------------------------------------------------------------

export interface ItemGuardInput {
  /** The player's answers in this course before this one (stored plus earlier in this match). */
  playerAnswersBefore: number;
  helped: boolean;
  /** The player answered this item in the ELO.itemRepeatWindowDays days before the match. */
  answeredRecently: boolean;
  timedOutAfterCountdown: boolean;
}

/** Whether a human answer may move the item's rating. */
export function itemGuardPasses(input: ItemGuardInput): boolean {
  return (
    input.playerAnswersBefore >= ELO.itemMinPlayerAnswers &&
    !input.helped &&
    !input.answeredRecently &&
    !input.timedOutAfterCountdown
  );
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

function roundRow(matchId: string, round: RoundRecord): MatchRoundRow {
  const [a, b] = round.sides;
  return {
    matchId,
    roundNo: round.round,
    questionId: round.questionId,
    questionRev: round.questionRev,
    multiplier: round.multiplier,
    answerAJson: a.answer,
    answerBJson: b.answer,
    correctA: a.correct,
    correctB: b.correct,
    msA: a.ms,
    msB: b.ms,
    scoreA: a.score,
    scoreB: b.score,
    damageToA: a.damageTaken,
    damageToB: b.damageTaken,
    hpAAfter: a.hpAfter,
    hpBAfter: b.hpAfter,
    powerupsJson: {
      armed: [a.armed, b.armed],
      effective: [a.effective, b.effective],
      cancelled: [a.armed !== null && a.effective === null, b.armed !== null && b.effective === null],
      quick: [a.quick, b.quick],
      phoenix: [a.phoenix, b.phoenix],
    },
  };
}

const NO_SUMMARY: SideEndSummary = { ranked: null, bot: null, pairCapped: false, missedCount: 0 };

/** Everything the end-of-match D1 batch writes, per build-plan.md "Finalization". */
export function planFinalization(state: MatchState, ctx: FinalizationContext): FinalizationPlan {
  const result = state.result;
  if (!result) throw new Error(`planFinalization: match ${state.matchId} has no result`);
  if (isCancelledReason(result.reason)) {
    throw new Error(`planFinalization: match ${state.matchId} was cancelled (${result.reason}); the MatchRoom writes it directly`);
  }
  const opponent = state.players[1];
  if (!opponent) throw new Error(`planFinalization: match ${state.matchId} has no second player`);

  const isVoid = result.reason === "void";
  const humans = humansOf(state);
  const now = ctx.now;
  const endedAt = result.endedAt;
  const playStart = state.startedAt ?? endedAt;
  const rounds = [...state.rounds].sort((x, y) => x.round - y.round);

  const answers: AnswerRow[] = [];
  const missed: MissedUpsert[] = [];
  const itemMap = new Map<string, ItemDelta>();
  const playerCourse: PlayerCourseDelta[] = [];
  const ratingRows: RatingRow[] = [];
  const summaries: [SideEndSummary, SideEndSummary] = [{ ...NO_SUMMARY }, { ...NO_SUMMARY }];

  // Bot rating (bot matches only), processed in round order alongside the items.
  const botMatch = state.mode === "bot";
  const botState = new Map<string, { theta: number; n: number; before: number }>();
  for (const human of humans) {
    const before = botThetaAtStart(ctx, human);
    const row = ratingRowOf(ctx, human.userId, "bot");
    const n = effectiveN(row?.n ?? human.player.botRatingN, fullIdleDays(row?.lastPlayedAt ?? null, playStart));
    botState.set(human.userId, { theta: before, n, before });
  }

  // Answers, missed questions, item deltas, player_course totals.
  for (const human of humans) {
    const pc = ctx.playerCourse[human.userId] ?? null;
    let answersSoFar = pc?.answers ?? 0;
    const recent = new Set(ctx.recentAnswers[human.userId] ?? []);
    // A narrow lecture filter can repeat a question within the match after
    // its key was revealed; only its first appearance moves any rating.
    const seenThisMatch = new Set<string>();
    const bot = botState.get(human.userId)!;
    let answered = 0;
    let correct = 0;
    let lastAnswerAt: number | null = null;

    for (const round of rounds) {
      const s = round.sides[human.side];
      const at = answeredAtOf(round, human.side);
      answers.push({
        id: answerRowId(state.matchId, round.round, human.side),
        userId: human.userId,
        matchId: state.matchId,
        roundNo: round.round,
        questionId: round.questionId,
        courseId: state.courseId,
        lectureId: round.lectureId,
        mode: state.mode,
        correct: s.correct,
        timedOut: s.timedOut,
        ms: s.ms,
        helped: s.helped,
        answerJson: s.answer,
        answeredAt: at,
      });

      if (!s.correct) {
        missed.push({
          userId: human.userId,
          questionId: round.questionId,
          courseId: state.courseId,
          lectureId: round.lectureId,
          missedAt: at,
          lastAnswerJson: s.timedOut ? null : s.answer,
          matchId: state.matchId,
        });
      }

      const item = itemMap.get(round.questionId) ?? {
        questionId: round.questionId,
        ratingDelta: 0,
        ratingNDelta: 0,
        attemptsDelta: 0,
        correctDelta: 0,
      };
      item.attemptsDelta += 1;
      if (s.correct) item.correctDelta += 1;

      const repeat = seenThisMatch.has(round.questionId);
      seenThisMatch.add(round.questionId);
      if (!isVoid && !s.helped && !repeat) {
        const update = eloUpdate(bot.theta, bot.n, round.itemRating, round.itemRatingN + item.ratingNDelta, round.chance, s.correct);
        const movesItem = itemGuardPasses({
          playerAnswersBefore: answersSoFar,
          helped: s.helped,
          answeredRecently: recent.has(round.questionId),
          timedOutAfterCountdown: s.timedOutAfterCountdown,
        });
        if (movesItem) {
          item.ratingDelta += update.itemDelta;
          item.ratingNDelta += 1;
        }
        if (botMatch) {
          bot.theta += update.playerDelta;
          bot.n += 1;
        }
      }
      itemMap.set(round.questionId, item);

      answersSoFar += 1;
      answered += 1;
      if (s.correct) correct += 1;
      lastAnswerAt = lastAnswerAt === null ? at : Math.max(lastAnswerAt, at);
    }

    if (answered > 0 && lastAnswerAt !== null) {
      playerCourse.push({
        userId: human.userId,
        courseId: state.courseId,
        answersDelta: answered,
        correctDelta: correct,
        lastAnswerAt,
      });
    }
    summaries[human.side].missedCount = missed.filter((m) => m.userId === human.userId).length;
  }

  // Ranked rating.
  const rankedMatch = movesRankedRating(state) && humans.length === 2 && !isVoid;
  const pairCapped = rankedMatch && isPairCapped(ctx.pairCount);
  const rankedBefore = new Map<string, GlickoRating>();
  const rankedAfter = new Map<string, GlickoRating>();
  if (rankedMatch) {
    const start = new Map<string, GlickoRating>();
    for (const human of humans) {
      const row = ratingRowOf(ctx, human.userId, "ranked");
      const stored = storedGlicko(row);
      rankedBefore.set(human.userId, stored);
      start.set(human.userId, inflateForIdleDays(stored, fullIdleDays(row?.lastPlayedAt ?? null, playStart)));
    }
    for (const human of humans) {
      const other = humans.find((h) => h.side !== human.side)!;
      const outcome = outcomeOf(result.winner, human.side);
      const score = outcome === "win" ? GLICKO.scoreWin : outcome === "draw" ? GLICKO.scoreDraw : GLICKO.scoreLoss;
      const after = pairCapped
        ? rankedBefore.get(human.userId)!
        : glicko2Update(start.get(human.userId)!, [{ opponent: start.get(other.userId)!, score }]);
      rankedAfter.set(human.userId, after);
      summaries[human.side].ranked = { before: rankedBefore.get(human.userId)!.r, after: after.r, provisional: isProvisional(after.rd) };
      summaries[human.side].pairCapped = pairCapped;
    }
  }

  // Rating rows: counters on the row for this mode, plus the rating values.
  if (!isVoid) {
    const kind = statsKindFor(state.mode, state.rated);
    const loser: Side | null = result.winner === 0 ? 1 : result.winner === 1 ? 0 : null;
    const ladderLevel = ladderLevelOf(state);
    for (const human of humans) {
      const row = workingRow(ctx, human.userId, state.courseId, kind);
      const outcome = outcomeOf(result.winner, human.side);
      applyCounters(
        row,
        outcome,
        {
          surrendered: result.reason === "surrender" && loser === human.side,
          abandoned: result.reason === "abandon" && loser === human.side,
        },
        endedAt,
        now,
      );

      if (kind === "ranked") {
        const after = rankedAfter.get(human.userId) ?? storedGlicko(ratingRowOf(ctx, human.userId, "ranked"));
        row.rating = after.r;
        row.rd = after.rd;
        row.vol = after.vol;
      }
      if (kind === "bot") {
        const bot = botState.get(human.userId)!;
        row.rating = bot.theta;
        row.n = bot.n;
        if (outcome === "win" && ladderLevel !== null) row.highestBotLevel = Math.max(row.highestBotLevel, ladderLevel);
        summaries[human.side].bot = { before: bot.before, after: bot.theta, provisional: isBotRatingProvisional(bot.n) };
      }
      ratingRows.push(row);
    }
  }

  const sideA = state.players[0];
  const ranked = (side: Side, which: "before" | "after"): number | null => {
    const s = summaries[side].ranked;
    return s ? s[which] : null;
  };
  const botA: RatingChange | null = botMatch ? summaries[0].bot : null;
  const match: MatchRowUpdate = {
    status: isVoid ? "void" : "finished",
    winner: isVoid || result.winner === null ? null : result.winner === "draw" ? "draw" : result.winner === 0 ? "a" : "b",
    endReason: result.reason,
    roundsPlayed: rounds.length,
    hpA: sideA.hp,
    hpB: opponent.hp,
    ratingABefore: ranked(0, "before"),
    ratingAAfter: ranked(0, "after"),
    ratingBBefore: ranked(1, "before"),
    ratingBAfter: ranked(1, "after"),
    botRatingBefore: botA ? botA.before : null,
    botRatingAfter: botA ? botA.after : null,
    pairCapped,
    startedAt: state.startedAt,
    endedAt,
  };

  return {
    matchId: state.matchId,
    finalizedAt: now,
    match,
    rounds: rounds.map((round) => roundRow(state.matchId, round)),
    answers,
    missed,
    items: [...itemMap.values()],
    ratings: ratingRows,
    playerCourse,
    summaries,
  };
}
