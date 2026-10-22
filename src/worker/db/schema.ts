// App tables in D1 (Drizzle, SQLite). Better Auth's tables are in
// auth-schema.ts. Column names are snake_case; TypeScript keys are camelCase.
// All timestamps are integer epoch ms. Booleans are stored as 0/1 integers.
//
// After changing this file: `npm run db:generate` (drizzle-kit writes the next
// migrations/NNNN_*.sql), then `npm run db:migrate:local`. Never edit an
// applied migration.

import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type {
  AnswerKey,
  BloomLevel,
  Difficulty,
  EndReason,
  MatchMode,
  MatchSettings,
  MatchStatus,
  OptionText,
  PowerupId,
  QuestionType,
  RatingKind,
  RoundPowerups,
} from "../../shared/game/types";
import { user } from "./auth-schema";

export * from "./auth-schema";

const bool = (name: string) => integer(name, { mode: "boolean" });

// ---------------------------------------------------------------------------
// Courses, lectures, questions
// ---------------------------------------------------------------------------

/** Seeded by migration 0000. */
export const courses = sqliteTable("courses", {
  /** Lowercase code: agai, eprm. */
  id: text("id").primaryKey(),
  /** AGAI, EPRM. */
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  /** Agentic AI, Engineering. */
  shortTitle: text("short_title").notNull(),
  active: bool("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
});

/** Written by the bank importer. id is the quiz file stem, e.g. AGAI-L05. */
export const lectures = sqliteTable(
  "lectures",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    title: text("title").notNull(),
    sort: integer("sort").notNull().default(0),
    noteUrl: text("note_url"),
  },
  (t) => [index("lectures_course_sort_idx").on(t.courseId, t.sort)],
);

/** Written by the bank importer; rating columns also by match finalization. */
export const questions = sqliteTable(
  "questions",
  {
    /** e.g. agai-3f9k2m */
    id: text("id").primaryKey(),
    rev: integer("rev").notNull().default(1),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    lectureId: text("lecture_id")
      .notNull()
      .references(() => lectures.id),
    status: text("status").$type<"active" | "retired">().notNull().default("active"),
    type: text("type").$type<QuestionType>().notNull(),
    promptMd: text("prompt_md"),
    statementMd: text("statement_md"),
    codeLang: text("code_lang"),
    /** Stable ids. Options; order items in correct order; match items. [] for truefalse. */
    optionsJson: text("options_json", { mode: "json" }).$type<OptionText[]>().notNull().default(sql`'[]'`),
    /** match only: targets [{id: "t1", text}]. */
    targetsJson: text("targets_json", { mode: "json" }).$type<OptionText[]>(),
    /** Server only. Never sent before the reveal. */
    keyJson: text("key_json", { mode: "json" }).$type<AnswerKey>().notNull(),
    shuffle: bool("shuffle").notNull().default(true),
    whyMd: text("why_md").notNull(),
    /** First sentence of why, at most 25 words. */
    whyShort: text("why_short").notNull(),
    /** {optionId: reason} for every wrong option. */
    optionWhyJson: text("option_why_json", { mode: "json" }).$type<Record<string, string>>().notNull().default(sql`'{}'`),
    /** Deep link into the lecture note, with section anchor. */
    noteUrl: text("note_url"),
    difficulty: text("difficulty").$type<Difficulty>().notNull(),
    level: text("level").$type<BloomLevel>().notNull(),
    topicsJson: text("topics_json", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    timeS: integer("time_s"),
    words: integer("words").notNull().default(0),
    chance: real("chance").notNull(),
    startRating: real("start_rating").notNull(),
    rating: real("rating").notNull(),
    ratingN: integer("rating_n").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    correct: integer("correct").notNull().default(0),
    fingerprint: text("fingerprint").notNull(),
    contentHash: text("content_hash").notNull(),
    sourcePath: text("source_path").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("questions_course_status_rating_idx").on(t.courseId, t.status, t.rating),
    index("questions_lecture_idx").on(t.lectureId),
  ],
);

// ---------------------------------------------------------------------------
// Ratings and per-course counters
// ---------------------------------------------------------------------------

/**
 * One row per (user, course, kind). ranked: Glicko-2 (rating, rd, vol).
 * bot: per-answer Elo (rating, n = rated answers). casual: counters only.
 */
export const ratings = sqliteTable(
  "ratings",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    kind: text("kind").$type<RatingKind>().notNull(),
    rating: real("rating"),
    rd: real("rd"),
    vol: real("vol"),
    n: integer("n").notNull().default(0),
    played: integer("played").notNull().default(0),
    won: integer("won").notNull().default(0),
    lost: integer("lost").notNull().default(0),
    drawn: integer("drawn").notNull().default(0),
    surrendered: integer("surrendered").notNull().default(0),
    abandoned: integer("abandoned").notNull().default(0),
    curStreak: integer("cur_streak").notNull().default(0),
    bestStreak: integer("best_streak").notNull().default(0),
    /** bot only: strongest ladder level beaten, 0 for none. */
    highestBotLevel: integer("highest_bot_level").notNull().default(0),
    lastPlayedAt: integer("last_played_at"),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.courseId, t.kind] }),
    index("ratings_leaderboard_idx").on(t.courseId, t.kind, sql`${t.rating} DESC`),
  ],
);

/** Answer totals per course; the "at least 10 answers" item-rating guard. */
export const playerCourse = sqliteTable(
  "player_course",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    answers: integer("answers").notNull().default(0),
    correct: integer("correct").notNull().default(0),
    lastAnswerAt: integer("last_answer_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.courseId] })],
);

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------
// Match history keeps no foreign keys to users, so it never blocks or
// cascades from account changes.

export const matches = sqliteTable(
  "matches",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id").notNull(),
    mode: text("mode").$type<MatchMode>().notNull(),
    rated: bool("rated").notNull(),
    /** Private lobbies. */
    joinCode: text("join_code"),
    status: text("status").$type<MatchStatus>().notNull(),
    /** Host for private matches. */
    playerA: text("player_a").notNull(),
    /** Null for bot matches and open lobbies. */
    playerB: text("player_b"),
    /** 0 to 9, or -1 for Echo. Bot matches only. */
    botLevel: integer("bot_level"),
    botRating: real("bot_rating"),
    settingsJson: text("settings_json", { mode: "json" }).$type<MatchSettings>().notNull(),
    loadoutAJson: text("loadout_a_json", { mode: "json" }).$type<PowerupId[]>(),
    loadoutBJson: text("loadout_b_json", { mode: "json" }).$type<PowerupId[]>(),
    winner: text("winner").$type<"a" | "b" | "draw">(),
    endReason: text("end_reason").$type<EndReason>(),
    roundsPlayed: integer("rounds_played"),
    hpA: integer("hp_a"),
    hpB: integer("hp_b"),
    /** Ranked rating; null when unrated. */
    ratingABefore: real("rating_a_before"),
    ratingAAfter: real("rating_a_after"),
    ratingBBefore: real("rating_b_before"),
    ratingBAfter: real("rating_b_after"),
    /** Player a's bot rating; bot matches only. */
    botRatingBefore: real("bot_rating_before"),
    botRatingAfter: real("bot_rating_after"),
    pairCapped: bool("pair_capped").notNull().default(false),
    createdAt: integer("created_at").notNull(),
    startedAt: integer("started_at"),
    endedAt: integer("ended_at"),
  },
  (t) => [
    uniqueIndex("matches_join_code_idx").on(t.joinCode),
    index("matches_player_a_idx").on(t.playerA, t.endedAt),
    index("matches_player_b_idx").on(t.playerB, t.endedAt),
    index("matches_status_idx").on(t.status),
    index("matches_course_mode_idx").on(t.courseId, t.mode, t.endedAt),
  ],
);

/** Written in the end-of-match batch. */
export const matchRounds = sqliteTable(
  "match_rounds",
  {
    matchId: text("match_id").notNull(),
    roundNo: integer("round_no").notNull(),
    questionId: text("question_id").notNull(),
    questionRev: integer("question_rev").notNull(),
    multiplier: real("multiplier").notNull(),
    /** Stable ids; null for no answer. */
    answerAJson: text("answer_a_json", { mode: "json" }).$type<AnswerKey>(),
    answerBJson: text("answer_b_json", { mode: "json" }).$type<AnswerKey>(),
    correctA: bool("correct_a").notNull(),
    correctB: bool("correct_b").notNull(),
    msA: integer("ms_a"),
    msB: integer("ms_b"),
    scoreA: integer("score_a").notNull(),
    scoreB: integer("score_b").notNull(),
    damageToA: integer("damage_to_a").notNull(),
    damageToB: integer("damage_to_b").notNull(),
    hpAAfter: integer("hp_a_after").notNull(),
    hpBAfter: integer("hp_b_after").notNull(),
    powerupsJson: text("powerups_json", { mode: "json" }).$type<RoundPowerups>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.roundNo] })],
);

/** Human answers only. Seen-question exclusion, accuracy per lecture, item analysis. */
export const answers = sqliteTable(
  "answers",
  {
    /** `${matchId}:${roundNo}:${side}` */
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    matchId: text("match_id").notNull(),
    roundNo: integer("round_no").notNull(),
    questionId: text("question_id").notNull(),
    courseId: text("course_id").notNull(),
    lectureId: text("lecture_id").notNull(),
    mode: text("mode").$type<MatchMode>().notNull(),
    correct: bool("correct").notNull(),
    timedOut: bool("timed_out").notNull(),
    ms: integer("ms"),
    /** Oracle was used. */
    helped: bool("helped").notNull(),
    answerJson: text("answer_json", { mode: "json" }).$type<AnswerKey>(),
    answeredAt: integer("answered_at").notNull(),
  },
  (t) => [
    index("answers_user_time_idx").on(t.userId, t.answeredAt),
    index("answers_user_question_idx").on(t.userId, t.questionId),
    index("answers_user_lecture_idx").on(t.userId, t.courseId, t.lectureId),
  ],
);

/** First statement of the end-of-match batch: a retried alarm cannot apply results twice. */
export const matchFinalizations = sqliteTable("match_finalizations", {
  matchId: text("match_id").primaryKey(),
  finalizedAt: integer("finalized_at").notNull(),
});

// ---------------------------------------------------------------------------
// Missed questions, reports, imports, prefs
// ---------------------------------------------------------------------------

export const missedQuestions = sqliteTable(
  "missed_questions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    courseId: text("course_id").notNull(),
    lectureId: text("lecture_id").notNull(),
    status: text("status").$type<"open" | "learned">().notNull().default("open"),
    timesMissed: integer("times_missed").notNull().default(1),
    firstMissedAt: integer("first_missed_at").notNull(),
    lastMissedAt: integer("last_missed_at").notNull(),
    /** Stable option ids; null for a timeout. */
    lastAnswerJson: text("last_answer_json", { mode: "json" }).$type<AnswerKey>(),
    lastMatchId: text("last_match_id"),
    learnedAt: integer("learned_at"),
    retries: integer("retries").notNull().default(0),
    retryCorrect: integer("retry_correct").notNull().default(0),
    lastRetryAt: integer("last_retry_at"),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.questionId] }),
    index("missed_list_idx").on(t.userId, t.status, t.courseId, t.lectureId, sql`${t.lastMissedAt} DESC`),
  ],
);

export const questionReports = sqliteTable(
  "question_reports",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    questionRev: integer("question_rev").notNull(),
    reason: text("reason").$type<"wrong_answer" | "ambiguous" | "typo" | "other">().notNull(),
    /** At most 500 characters. */
    note: text("note"),
    matchId: text("match_id"),
    createdAt: integer("created_at").notNull(),
    resolvedAt: integer("resolved_at"),
  },
  (t) => [
    index("question_reports_question_idx").on(t.questionId),
    index("question_reports_open_idx").on(t.resolvedAt, t.createdAt),
  ],
);

/** Audit trail of bank imports. */
export const questionImports = sqliteTable("question_imports", {
  id: text("id").primaryKey(),
  vaultCommit: text("vault_commit"),
  added: integer("added").notNull(),
  changed: integer("changed").notNull(),
  revBumped: integer("rev_bumped").notNull(),
  retired: integer("retired").notNull(),
  unchanged: integer("unchanged").notNull(),
  importedAt: integer("imported_at").notNull(),
});

export const userPrefs = sqliteTable("user_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  loadoutJson: text("loadout_json", { mode: "json" })
    .$type<PowerupId[]>()
    .notNull()
    .default(sql`'["zeus","aegis","oracle"]'`),
  sound: bool("sound").notNull().default(true),
  courseId: text("course_id"),
});
