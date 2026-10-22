// Engine state, events and the shapes shared between the engine, the
// Durable Objects, finalization and the client. Pure types plus a few
// literal lists; no logic. Numbers live in config.ts.
//
// Conventions:
// - All timestamps are epoch milliseconds, passed in as `now`. The engine never
//   reads the clock or Math.random.
// - Side 0 is player a (`matches.player_a`), side 1 is player b or the bot.
// - "Real" ids are the stable ids from the question bank. "Opaque" ids are the
//   per-match, per-side random ids a client sees. The engine maps between them.

import type {
  MatchEndMessage,
  ServerMessage,
  SnapshotMessage,
} from "../protocol";

// ---------------------------------------------------------------------------
// Literal lists (the zod schemas in protocol.ts are built from these)
// ---------------------------------------------------------------------------

export const QUESTION_TYPES = ["single", "multi", "truefalse", "cloze", "order", "match"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const POWERUP_IDS = ["zeus", "aegis", "nemesis", "oracle", "hermes", "phoenix"] as const;
export type PowerupId = (typeof POWERUP_IDS)[number];
/** Armed in the arming window. */
export type BlindPowerupId = "zeus" | "aegis" | "nemesis";
/** Used during the question, before answering. */
export type QuickPowerupId = "oracle" | "hermes";

export const PHASES = ["lobby", "intro", "arming", "banner", "question", "reveal", "finished", "cancelled"] as const;
export type Phase = (typeof PHASES)[number];

export type Side = 0 | 1;

export const MATCH_MODES = ["ranked", "private", "bot"] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

/** matches.status in D1. */
export const MATCH_STATUSES = ["lobby", "active", "finished", "cancelled", "void"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

/**
 * Why a match ended. `cancelled` is an RPC cancel (for example the host
 * started another match while the lobby was open); the rest are from the
 * build plan.
 */
export const END_REASONS = ["hp", "rounds", "surrender", "abandon", "void", "no_show", "expired", "cancelled"] as const;
export type EndReason = (typeof END_REASONS)[number];

/** Reasons the MatchRoom `cancel` RPC accepts. */
export type CancelReason = "no_show" | "expired" | "cancelled";

/** Banner outcome per armed power-up, see build-plan.md "Arming resolution". */
export const BANNER_OUTCOMES = ["active", "cancelled", "nemesis_hit", "nemesis_watch", "nemesis_wasted"] as const;
export type BannerOutcome = (typeof BANNER_OUTCOMES)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const BLOOM_LEVELS = ["remember", "understand", "apply", "analyze"] as const;
export type BloomLevel = (typeof BLOOM_LEVELS)[number];

/**
 * Bot level as stored in `matches.bot_level`: -1 Echo, 1 to 8 the ladder,
 * 0 (Dummy) and 9 (Oracle Bot) in test mode only.
 */
export type BotLevel = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

/**
 * The one answer union, used for answer keys (`questions.key_json`, real ids)
 * and for client answers (opaque ids in a match, stable ids in the missed
 * question screens).
 *
 * Correct means: options, exact set equality (all or nothing); bool, equal;
 * order, identical sequence; match, identical map.
 */
export type AnswerKey =
  | { kind: "options"; ids: string[] } // single, cloze: one id; multi: the correct set
  | { kind: "bool"; value: boolean } // truefalse
  | { kind: "order"; ids: string[] } // the correct sequence
  | { kind: "match"; map: Record<string, string> }; // item id -> target id

/** An answer as the client sends it. Same shape as AnswerKey. */
export type ClientAnswer = AnswerKey;

/** An option, order item, match item or match target. */
export interface OptionText {
  id: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Questions inside a match
// ---------------------------------------------------------------------------

/**
 * A question as the MatchRoom holds it: with its key, never sent to a client.
 * Built by the match factory from a `questions` row.
 */
export interface QuestionFull {
  id: string;
  rev: number;
  courseId: string;
  lectureId: string;
  type: QuestionType;
  /** Markdown. Null for truefalse. */
  prompt: string | null;
  /** Truefalse only. */
  statement: string | null;
  /** Language of code in the prompt or options, for highlighting. */
  codeLang: string | null;
  /**
   * Stable ids. single, multi, cloze: the options. order: the items, in the
   * authored (correct) order. match: the items. truefalse: [].
   */
  options: OptionText[];
  /** match only: the categories. Null for every other type. */
  targets: OptionText[] | null;
  key: AnswerKey;
  /** False when the options are in a logical order and must not be shuffled. */
  shuffle: boolean;
  /** One-line explanation shown in the reveal. */
  whyShort: string;
  /** Timer override in seconds, from the item's `time`. */
  timeS: number | null;
  /** Word count of prompt or statement plus every option text. */
  words: number;
  /** Chance of a correct random answer (the bot model's floor c). */
  chance: number;
  /** Item rating as loaded at match start. Item deltas are relative to this. */
  rating: number;
  ratingN: number;
}

// ---------------------------------------------------------------------------
// Match setup
// ---------------------------------------------------------------------------

export interface GlickoRating {
  r: number;
  rd: number;
  vol: number;
}

/** A human joining a match, as the match factory loads them from D1. */
export interface PlayerInit {
  userId: string;
  /** Display username. */
  name: string;
  avatarUrl: string | null;
  /** From user_prefs. The engine ignores it when power-ups are off. */
  loadout: PowerupId[];
  /** Bot rating in this course; null before the first rated bot answer (counts as 1500). */
  botRating: number | null;
  /** Rated bot answers so far (ratings.n of the bot row). */
  botRatingN: number;
  /** Ranked rating in this course; null if the player has never played ranked. */
  ranked: GlickoRating | null;
}

export interface BotInit {
  level: BotLevel;
  name: string;
  /** Strength R on the item scale (ladder rating, or player's bot rating - 75 for Echo). */
  strength: number;
}

export interface MatchSettings {
  powerups: boolean;
  /** Lecture ids to draw from; null for the whole course. */
  lectures: string[] | null;
}

/** Everything the MatchRoom needs to start a match. Sent once through the `init` RPC. */
export interface MatchInit {
  matchId: string;
  courseId: string;
  mode: MatchMode;
  rated: boolean;
  settings: MatchSettings;
  /** Private lobbies only. */
  joinCode: string | null;
  createdAt: number;
  /** Seed for the match PRNG (32-bit unsigned). */
  seed: number;
  /**
   * The humans. Ranked: both. Bot: one. Private: the host alone (player b
   * arrives with the `join` event), or both for a rematch.
   */
  humans: PlayerInit[];
  bot: BotInit | null;
  /** Selected questions. Empty for a private lobby with one human (selected at join). */
  questions: QuestionFull[];
  /** 1 in production; TEST_MODE.timeScale in test mode. See config.scaleMs. */
  timeScale: number;
}

// ---------------------------------------------------------------------------
// Engine state
// ---------------------------------------------------------------------------

/** Per-question plan of a bot, made when the question is shown. */
export interface BotQuestionPlan {
  round: number;
  knows: boolean;
  /** Answer in real ids. */
  answer: AnswerKey;
  /** When the bot answers; null for a planned timeout. */
  answerAt: number | null;
  /** When the bot uses Oracle, if it does. */
  oracleAt: number | null;
  /** When the bot uses Hermes, if it does. */
  hermesAt: number | null;
  /** Whether the late-guess rule has already been applied this round. */
  lateGuessResolved: boolean;
}

/** A bot's match-long plan, drawn at init with the match PRNG. */
export interface BotPlan {
  level: BotLevel;
  /** Strength R. */
  strength: number;
  /** Speed level s = clamp(1 + (R - 1050) / 150, 1, 8). */
  speed: number;
  /** Round in which the bot arms each blind power-up it holds (null: not held, or Aegis). */
  zeusRound: number | null;
  nemesisRound: number | null;
  /** Weak bots only: the random round for Aegis. Smart bots use the HP rule. */
  aegisRound: number | null;
  /** Plan for the current question; null outside the question phase. */
  q: BotQuestionPlan | null;
}

/** Per-round state of one player. Reset at the start of every arming phase. */
export interface PlayerRoundState {
  /** Chosen in the arming window. */
  armed: BlindPowerupId | null;
  /** After Nemesis resolution. */
  effective: BlindPowerupId | null;
  /** The opponent's Nemesis hit this player (also blocks Phoenix this round). */
  nemesisAgainst: boolean;
  /** Oracle or Hermes used this round. */
  quick: QuickPowerupId | null;
  /** Mapped to real ids. */
  answer: AnswerKey | null;
  answeredAt: number | null;
  /** Option ids removed by Oracle (real ids). */
  hidden: string[];
}

export interface PlayerState {
  kind: "human" | "bot";
  /** Null for bots. */
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  hp: number;
  /** 3 distinct power-ups; [] when power-ups are off. */
  loadout: PowerupId[];
  /** Spent, including cancelled and fizzled ones, and a triggered Phoenix. */
  used: PowerupId[];
  phoenixUsed: boolean;
  connected: boolean;
  everConnected: boolean;
  disconnectedSince: number | null;
  ready: boolean;
  /** Players: bot rating (1500 when null in PlayerInit). Bots: strength. Item scale. */
  botRating: number;
  /** Players: rated bot answers so far. Bots: 0. */
  botRatingN: number;
  /** Ranked rating at match start; null for bots and for players with no ranked row. */
  rankedBefore: GlickoRating | null;
  bot: BotPlan | null;
  r: PlayerRoundState;
}

/** The question currently on screen. */
export interface CurrentQuestion {
  question: QuestionFull;
  shownAt: number;
  timerMs: number;
  deadline: number;
  /** Side that answered first this round. */
  firstSide: Side | null;
  /** End of the second player's countdown, once someone answered. */
  countdownEnd: number | null;
  /** Opaque id -> real id, per side. Covers options and match targets. */
  idMap: [Record<string, string>, Record<string, string>];
  /** Display order of options (opaque ids), per side. */
  order: [string[], string[]];
  /** match only: display order of targets (opaque ids), per side. */
  targetOrder: [string[], string[]] | null;
}

/** One side's part of a finished round. */
export interface RoundSideRecord {
  /** Real ids; null when the player did not answer. */
  answer: AnswerKey | null;
  answeredAt: number | null;
  /** answeredAt - shownAt, clamped to the timer; null when no answer. */
  ms: number | null;
  correct: boolean;
  /** No answer by the round end. */
  timedOut: boolean;
  /** Timed out after the opponent's countdown had started (excluded from item ratings). */
  timedOutAfterCountdown: boolean;
  /** Used Oracle this round (the answer moves no rating). */
  helped: boolean;
  score: number;
  damageTaken: number;
  hpAfter: number;
  armed: BlindPowerupId | null;
  effective: BlindPowerupId | null;
  nemesisAgainst: boolean;
  quick: QuickPowerupId | null;
  /** Phoenix triggered for this side this round. */
  phoenix: boolean;
}

export interface RoundRecord {
  round: number;
  /** True for rounds after maxRounds. */
  suddenDeath: boolean;
  questionId: string;
  questionRev: number;
  /** Lecture of the question (answers and missed rows need it). */
  lectureId: string;
  multiplier: number;
  shownAt: number;
  timerMs: number;
  deadline: number;
  countdownEnd: number | null;
  firstSide: Side | null;
  /** The round's damage hit its cap. */
  capped: boolean;
  /** Item rating at match start, copied for finalization. */
  itemRating: number;
  itemRatingN: number;
  /** The question's chance floor c, copied for finalization. */
  chance: number;
  sides: [RoundSideRecord, RoundSideRecord];
}

export interface MatchResult {
  winner: Side | "draw" | null;
  reason: EndReason;
  endedAt: number;
}

/** Rating change shown on the end screen. */
export interface RatingChange {
  before: number;
  after: number;
  provisional: boolean;
}

/** Per-side outcome of finalization, kept in state for reconnects and match_end. */
export interface SideEndSummary {
  ranked: RatingChange | null;
  bot: RatingChange | null;
  pairCapped: boolean;
  /** Questions this side missed in the match (added to or reopened in Missed). */
  missedCount: number;
}

export interface MatchState {
  v: 1;
  matchId: string;
  courseId: string;
  mode: MatchMode;
  rated: boolean;
  settings: MatchSettings;
  joinCode: string | null;
  /** 1 in production; see config.scaleMs. */
  timeScale: number;
  phase: Phase;
  phaseEndsAt: number | null;
  /** 1-based; 0 before round 1. */
  round: number;
  /** Sudden-death rounds played. */
  suddenDeath: number;
  /** Side 1 is null in a private lobby until someone joins. */
  players: [PlayerState, PlayerState | null];
  /** With keys; never sent. */
  questions: QuestionFull[];
  qIndex: number;
  q: CurrentQuestion | null;
  rounds: RoundRecord[];
  /** PRNG state. */
  rng: number;
  createdAt: number;
  startedAt: number | null;
  noShowAt: number | null;
  lobbyExpiresAt: number | null;
  result: MatchResult | null;
  rematch: [boolean, boolean];
  rematchUntil: number | null;
  /** Set by the MatchRoom when a rematch was created. */
  rematchMatchId: string | null;
  cleanupAt: number | null;
  /** Set by the MatchRoom after the finalization batch ran (or was found already done). */
  finalized: boolean;
  /** Set by the MatchRoom with finalized; per side. Null until then and for cancelled matches. */
  endSummaries: [SideEndSummary, SideEndSummary] | null;
}

// ---------------------------------------------------------------------------
// Engine interface
// ---------------------------------------------------------------------------

/**
 * Events after init. Match creation goes through `initState(init, now)`
 * instead of an `init` event (see docs/CONTRACTS.md).
 */
export type EngineEvent =
  | { type: "join"; player: PlayerInit; questions: QuestionFull[] }
  | { type: "connect"; side: Side }
  | { type: "disconnect"; side: Side }
  | { type: "ready"; side: Side }
  | { type: "arm"; side: Side; round: number; powerup: BlindPowerupId | null }
  | { type: "use"; side: Side; round: number; powerup: QuickPowerupId }
  | { type: "answer"; side: Side; round: number; answer: ClientAnswer }
  | { type: "surrender"; side: Side }
  | { type: "rematch"; side: Side }
  | { type: "tick" }
  | { type: "cancel"; reason: CancelReason };

/** Side effects the MatchRoom performs after persisting the new state. */
export type Effect =
  | { kind: "started" } // D1 matches.status = 'active', started_at
  | { kind: "finalize" } // run planFinalization and the D1 batch, then send match_end
  | { kind: "rematch" } // both accepted: create the new match, send `rematch` with its id
  | { kind: "cancelled"; reason: EndReason }; // D1 matches.status = 'cancelled', send match_end

export interface Outbound {
  to: Side;
  msg: ServerMessage;
}

export interface StepResult {
  state: MatchState;
  /** Already personalised per side. Messages to a bot side are dropped by the MatchRoom. */
  out: Outbound[];
  effects: Effect[];
}

/** Signatures of the engine entry points (engine.ts, view.ts). */
export interface EngineApi {
  initState(init: MatchInit, now: number): StepResult;
  step(state: MatchState, event: EngineEvent, now: number): StepResult;
  nextDeadline(state: MatchState): number | null;
  view(state: MatchState, side: Side, now: number): SnapshotMessage;
  matchEnd(state: MatchState, side: Side, now: number): MatchEndMessage;
}

/** Seeded PRNG (rng.ts). State is a 32-bit unsigned integer kept in MatchState.rng. */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** Standard normal draw (Box-Muller). */
  normal(): number;
  pick<T>(items: readonly T[]): T;
  /** Returns a new shuffled array (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** Current state, to store back into MatchState.rng. */
  state(): number;
}

// ---------------------------------------------------------------------------
// Finalization (finalize.ts produces it, finalize-writer.ts writes it)
// ---------------------------------------------------------------------------
//
// Field names match the Drizzle schema's TypeScript keys in
// src/worker/db/schema.ts, so the writer can pass rows straight to
// insert().values(). src/worker/db/plan-compat.ts checks this at compile time.

export type RatingKind = "ranked" | "bot" | "casual";

/** A `ratings` row. */
export interface RatingRow {
  userId: string;
  courseId: string;
  kind: RatingKind;
  rating: number | null;
  rd: number | null;
  vol: number | null;
  n: number;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  surrendered: number;
  abandoned: number;
  curStreak: number;
  bestStreak: number;
  highestBotLevel: number;
  lastPlayedAt: number | null;
  updatedAt: number;
}

/** A `player_course` row. */
export interface PlayerCourseRow {
  userId: string;
  courseId: string;
  answers: number;
  correct: number;
  lastAnswerAt: number | null;
}

/** What planFinalization reads besides the match state. Loaded by the MatchRoom. */
export interface FinalizationContext {
  now: number;
  /** Current rating rows of each human, by userId. Missing kinds are null. */
  ratings: Record<string, Record<RatingKind, RatingRow | null>>;
  /** player_course row of each human in this course, by userId. */
  playerCourse: Record<string, PlayerCourseRow | null>;
  /**
   * By userId: question ids the player answered in the
   * ELO.itemRepeatWindowDays days before this match started (item guard).
   */
  recentAnswers: Record<string, string[]>;
  /**
   * Rated finished matches between these two users that ended today
   * (PAIR_CAP.timeZone calendar day), not counting this one. 0 for bot matches.
   */
  pairCount: number;
}

/** Fields set on the `matches` row. */
export interface MatchRowUpdate {
  status: "finished" | "void";
  winner: "a" | "b" | "draw" | null;
  endReason: EndReason;
  roundsPlayed: number;
  hpA: number;
  hpB: number;
  ratingABefore: number | null;
  ratingAAfter: number | null;
  ratingBBefore: number | null;
  ratingBAfter: number | null;
  botRatingBefore: number | null;
  botRatingAfter: number | null;
  pairCapped: boolean;
  startedAt: number | null;
  endedAt: number;
}

/** Blind and quick power-up record of one round, stored in match_rounds.powerups_json. */
export interface RoundPowerups {
  armed: [BlindPowerupId | null, BlindPowerupId | null];
  effective: [BlindPowerupId | null, BlindPowerupId | null];
  /** Side whose armed power-up was cancelled by Nemesis. */
  cancelled: [boolean, boolean];
  quick: [QuickPowerupId | null, QuickPowerupId | null];
  phoenix: [boolean, boolean];
}

/** A `match_rounds` row. */
export interface MatchRoundRow {
  matchId: string;
  roundNo: number;
  questionId: string;
  questionRev: number;
  multiplier: number;
  answerAJson: AnswerKey | null;
  answerBJson: AnswerKey | null;
  correctA: boolean;
  correctB: boolean;
  msA: number | null;
  msB: number | null;
  scoreA: number;
  scoreB: number;
  damageToA: number;
  damageToB: number;
  hpAAfter: number;
  hpBAfter: number;
  powerupsJson: RoundPowerups;
}

/** An `answers` row. Human answers only. id = `${matchId}:${roundNo}:${side}` (idempotent). */
export interface AnswerRow {
  id: string;
  userId: string;
  matchId: string;
  roundNo: number;
  questionId: string;
  courseId: string;
  lectureId: string;
  mode: MatchMode;
  correct: boolean;
  timedOut: boolean;
  ms: number | null;
  helped: boolean;
  answerJson: AnswerKey | null;
  answeredAt: number;
}

/**
 * Upsert of a `missed_questions` row: insert with times_missed 1, or on
 * conflict times_missed + 1, last_* fields, status 'open', learned_at null.
 */
export interface MissedUpsert {
  userId: string;
  questionId: string;
  courseId: string;
  lectureId: string;
  missedAt: number;
  /** Stable option ids; null for a timeout. */
  lastAnswerJson: AnswerKey | null;
  matchId: string;
}

/** Relative update of a `questions` row: rating = rating + ratingDelta, and so on. */
export interface ItemDelta {
  questionId: string;
  ratingDelta: number;
  /** 1 when this answer moved the rating, else 0. */
  ratingNDelta: number;
  attemptsDelta: number;
  correctDelta: number;
}

/** Relative update of a `player_course` row (inserted if missing). */
export interface PlayerCourseDelta {
  userId: string;
  courseId: string;
  answersDelta: number;
  correctDelta: number;
  lastAnswerAt: number;
}

export interface FinalizationPlan {
  matchId: string;
  finalizedAt: number;
  match: MatchRowUpdate;
  rounds: MatchRoundRow[];
  answers: AnswerRow[];
  missed: MissedUpsert[];
  items: ItemDelta[];
  /** Full rows to upsert (absolute values: a user has one active match at a time). */
  ratings: RatingRow[];
  playerCourse: PlayerCourseDelta[];
  /** Per side, for match_end and MatchState.endSummaries. Side 1 of a bot match is all null. */
  summaries: [SideEndSummary, SideEndSummary];
}
