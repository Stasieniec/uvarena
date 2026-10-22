// WebSocket protocol: every frame between the client and the MatchRoom or
// Matchmaker Durable Objects. All frames are JSON text with a `type` field,
// validated with these schemas on both sides. The only non-JSON frames are
// the heartbeat text frames "ping" and "pong".
//
// Every server message carries `serverNow` (epoch ms). The client keeps
// offset = mean(serverNow - Date.now()) over the last NET.clockOffsetSamples
// messages and renders countdowns from server deadlines.
//
// Option ids in match messages are the receiving player's per-match opaque
// ids. No message before `reveal` may contain the key, correctness, or
// anything derived from them (Oracle hides, sent only to the player who used
// Oracle, are the one intended exception).

import { z } from "zod";
import {
  BANNER_OUTCOMES,
  END_REASONS,
  MATCH_MODES,
  PHASES,
  POWERUP_IDS,
  QUESTION_TYPES,
  type AnswerKey,
} from "./game/types";

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** Option, item, target and opaque ids. Short, URL-safe. */
export const IdSchema = z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/);

export const QuestionTypeSchema = z.enum(QUESTION_TYPES);
export const PowerupIdSchema = z.enum(POWERUP_IDS);
export const BlindPowerupIdSchema = z.enum(["zeus", "aegis", "nemesis"]);
export const QuickPowerupIdSchema = z.enum(["oracle", "hermes"]);
export const PhaseSchema = z.enum(PHASES);
export const MatchModeSchema = z.enum(MATCH_MODES);
export const EndReasonSchema = z.enum(END_REASONS);
export const BannerOutcomeSchema = z.enum(BANNER_OUTCOMES);
export const WhoSchema = z.enum(["you", "opponent"]);

const epochMs = z.number().int().nonnegative();
const durationMs = z.number().int().nonnegative();
const roundNo = z.number().int().min(1).max(100);

/** The answer union (see AnswerKey in game/types.ts). */
export const AnswerSchema: z.ZodType<AnswerKey> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("options"), ids: z.array(IdSchema).min(1).max(8) }),
  z.object({ kind: z.literal("bool"), value: z.boolean() }),
  z.object({ kind: z.literal("order"), ids: z.array(IdSchema).min(2).max(8) }),
  z.object({ kind: z.literal("match"), map: z.record(IdSchema, IdSchema) }),
]);

export const OptionSchema = z.object({ id: IdSchema, text: z.string() });

export const MatchSettingsSchema = z.object({
  powerups: z.boolean(),
  lectures: z.array(z.string().min(1).max(64)).nullable(),
});

/** A rating as shown next to a name: "1540?" is { value: 1540, provisional: true }. */
export const ShownRatingSchema = z.object({
  value: z.number().int(),
  provisional: z.boolean(),
});

/** One player as seen by the receiver. */
export const PlayerViewSchema = z.object({
  kind: z.enum(["human", "bot"]),
  /** Null for bots. */
  userId: z.string().nullable(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  /** Bot level (-1 Echo, 1 to 8 ladder, 0 and 9 test bots); null for humans. */
  botLevel: z.number().int().min(-1).max(9).nullable(),
  hp: z.number().int(),
  loadout: z.array(PowerupIdSchema),
  used: z.array(PowerupIdSchema),
  phoenixUsed: z.boolean(),
  connected: z.boolean(),
  ready: z.boolean(),
  /**
   * Rating shown in the intro: ranked rating in ranked and private matches,
   * bot rating (players) or strength (bots) in bot matches.
   */
  rating: ShownRatingSchema.nullable(),
});

/** The question as a client sees it: no key, options in the receiver's display order. */
export const QuestionViewSchema = z.object({
  round: roundNo,
  type: QuestionTypeSchema,
  prompt: z.string().nullable(),
  statement: z.string().nullable(),
  codeLang: z.string().nullable(),
  options: z.array(OptionSchema),
  /** match only: targets in the receiver's display order. */
  targets: z.array(OptionSchema).nullable(),
  timerMs: durationMs,
  shownAt: epochMs,
  deadline: epochMs,
  multiplier: z.number(),
});

export const BannerItemSchema = z.object({
  who: WhoSchema,
  powerup: PowerupIdSchema,
  outcome: BannerOutcomeSchema,
});

export const RatingChangeSchema = z.object({
  before: z.number(),
  after: z.number(),
  provisional: z.boolean(),
});

/** Reveal payload (the `reveal` message without type and serverNow). */
export const RevealPayloadSchema = z.object({
  round: roundNo,
  /** The question's stable bank id, so the reveal's report flag can post to /questions/:id/report. */
  questionId: z.string(),
  /** The key in the receiver's id space. */
  key: AnswerSchema,
  yourAnswer: AnswerSchema.nullable(),
  /** In the receiver's id space; null for no answer. */
  opponentAnswer: AnswerSchema.nullable(),
  yourCorrect: z.boolean(),
  opponentCorrect: z.boolean(),
  yourMs: durationMs.nullable(),
  opponentMs: durationMs.nullable(),
  yourScore: z.number().int(),
  opponentScore: z.number().int(),
  multiplier: z.number(),
  damageToYou: z.number().int(),
  damageToOpponent: z.number().int(),
  /** The round's damage hit its cap. */
  capped: z.boolean(),
  /** Whose Zeus was active, whose Aegis was active, whose Phoenix fired. */
  zeus: WhoSchema.nullable(),
  aegis: WhoSchema.nullable(),
  phoenix: WhoSchema.nullable(),
  hp: z.object({ you: z.number().int(), opponent: z.number().int() }),
  whyShort: z.string(),
  /** The receiver missed this one and it went into Missed questions. */
  savedToMissed: z.boolean(),
  phaseEndsAt: epochMs,
});

export const MatchEndSummarySchema = z.object({
  correct: z.number().int(),
  answered: z.number().int(),
  fastestMs: durationMs.nullable(),
  biggestHit: z.number().int(),
  powerupsUsed: z.array(PowerupIdSchema),
});

/** match_end payload (the message without type and serverNow). */
export const MatchEndPayloadSchema = z.object({
  result: z.enum(["win", "loss", "draw", "void", "cancelled"]),
  reason: EndReasonSchema,
  hp: z.object({ you: z.number().int(), opponent: z.number().int() }),
  rounds: z.number().int(),
  ranked: RatingChangeSchema.nullable(),
  bot: RatingChangeSchema.nullable(),
  pairCapped: z.boolean(),
  summary: MatchEndSummarySchema,
  missedCount: z.number().int(),
  /** Rematch window end (private and bot matches); null otherwise. */
  rematchUntil: epochMs.nullable(),
});

export const RematchStateSchema = z.object({
  you: z.boolean(),
  opponent: z.boolean(),
  until: epochMs.nullable(),
  /** Set once both accepted and the new match exists. */
  matchId: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Client to server (match)
// ---------------------------------------------------------------------------

export const ClientMessageSchema = z.discriminatedUnion("type", [
  /** Lobby: this player is ready. */
  z.object({ type: z.literal("ready") }),
  /** Arming: arm a blind power-up, or null to unarm. Switching is allowed. */
  z.object({ type: z.literal("arm"), round: roundNo, powerup: BlindPowerupIdSchema.nullable() }),
  /** Question, before answering: use Oracle or Hermes. */
  z.object({ type: z.literal("use"), round: roundNo, powerup: QuickPowerupIdSchema }),
  /** Question: lock in an answer (opaque ids). */
  z.object({ type: z.literal("answer"), round: roundNo, answer: AnswerSchema }),
  /** Intro to reveal: give up. */
  z.object({ type: z.literal("surrender") }),
  /** Finished, within the rematch window: offer or accept a rematch. */
  z.object({ type: z.literal("rematch") }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ---------------------------------------------------------------------------
// Server to client (match)
// ---------------------------------------------------------------------------

const base = { serverNow: epochMs };

export const SnapshotMessageSchema = z.object({
  type: z.literal("snapshot"),
  ...base,
  matchId: z.string(),
  courseId: z.string(),
  mode: MatchModeSchema,
  rated: z.boolean(),
  settings: MatchSettingsSchema,
  phase: PhaseSchema,
  phaseEndsAt: epochMs.nullable(),
  round: z.number().int().nonnegative(),
  suddenDeath: z.number().int().nonnegative(),
  multiplier: z.number(),
  you: PlayerViewSchema,
  /** Null in a private lobby until someone joins. */
  opponent: PlayerViewSchema.nullable(),
  /** Private lobbies. */
  joinCode: z.string().nullable(),
  /** Arming: your unused blind power-ups. */
  armable: z.array(BlindPowerupIdSchema),
  /** Arming: your own armed choice this round. */
  armed: BlindPowerupIdSchema.nullable(),
  /** Banner phase: the banner items. */
  banner: z.array(BannerItemSchema).nullable(),
  question: QuestionViewSchema.nullable(),
  /** Your Oracle hides this round (opaque ids). */
  hidden: z.array(IdSchema),
  /** Your quick power-up this round. */
  quickUsed: QuickPowerupIdSchema.nullable(),
  yourAnswer: AnswerSchema.nullable(),
  opponentAnswered: z.boolean(),
  countdownEnd: epochMs.nullable(),
  /** The last moment your answer is accepted, without grace; null outside the question phase. */
  yourDeadline: epochMs.nullable(),
  /** Reveal of the last finished round (shown during reveal, kept for reconnects). */
  lastReveal: RevealPayloadSchema.nullable(),
  /** Set once the match is finished or cancelled. */
  result: MatchEndPayloadSchema.nullable(),
  rematch: RematchStateSchema.nullable(),
  /** When the disconnected opponent forfeits; null while connected. */
  opponentForfeitAt: epochMs.nullable(),
});

export const LobbyMessageSchema = z.object({
  type: z.literal("lobby"),
  ...base,
  code: z.string().nullable(),
  players: z.array(z.object({ name: z.string(), avatarUrl: z.string().nullable(), ready: z.boolean() })),
  rated: z.boolean(),
  settings: MatchSettingsSchema,
});

export const IntroMessageSchema = z.object({
  type: z.literal("intro"),
  ...base,
  phaseEndsAt: epochMs,
  you: PlayerViewSchema,
  opponent: PlayerViewSchema,
  mode: MatchModeSchema,
  rated: z.boolean(),
});

export const ArmingMessageSchema = z.object({
  type: z.literal("arming"),
  ...base,
  round: roundNo,
  multiplier: z.number(),
  phaseEndsAt: epochMs,
  /** Your unused zeus, aegis, nemesis. Empty when power-ups are off. */
  armable: z.array(BlindPowerupIdSchema),
});

export const ArmedAckMessageSchema = z.object({
  type: z.literal("armed_ack"),
  ...base,
  round: roundNo,
  powerup: BlindPowerupIdSchema.nullable(),
});

export const BannerMessageSchema = z.object({
  type: z.literal("banner"),
  ...base,
  round: roundNo,
  phaseEndsAt: epochMs,
  items: z.array(BannerItemSchema),
});

export const QuestionMessageSchema = QuestionViewSchema.extend({
  type: z.literal("question"),
  /** The view's own `type` is overwritten by the message tag, so the question type travels here. */
  questionType: QuestionViewSchema.shape.type,
  ...base,
});

export const AnswerAckMessageSchema = z.object({
  type: z.literal("answer_ack"),
  ...base,
  round: roundNo,
  /** The opponent's countdown end; null if you answered second. */
  countdownEnd: epochMs.nullable(),
});

export const OpponentAnsweredMessageSchema = z.object({
  type: z.literal("opponent_answered"),
  ...base,
  round: roundNo,
  /** Your new deadline. */
  countdownEnd: epochMs,
});

export const PowerupResultMessageSchema = z.object({
  type: z.literal("powerup_result"),
  ...base,
  round: roundNo,
  powerup: QuickPowerupIdSchema,
  /** Oracle: hidden options (your opaque ids). Hermes: []. */
  hidden: z.array(IdSchema),
});

export const OpponentPowerupMessageSchema = z.object({
  type: z.literal("opponent_powerup"),
  ...base,
  round: roundNo,
  powerup: QuickPowerupIdSchema,
});

export const RevealMessageSchema = RevealPayloadSchema.extend({
  type: z.literal("reveal"),
  ...base,
});

export const OpponentConnectionMessageSchema = z.object({
  type: z.literal("opponent_connection"),
  ...base,
  connected: z.boolean(),
  /** When the opponent forfeits if still away; null when connected or outside intro to reveal. */
  forfeitAt: epochMs.nullable(),
});

export const MatchEndMessageSchema = MatchEndPayloadSchema.extend({
  type: z.literal("match_end"),
  ...base,
});

export const RematchMessageSchema = z.object({
  type: z.literal("rematch"),
  ...base,
  state: z.enum(["offered", "accepted"]),
  by: WhoSchema,
  /** The new match, when accepted. */
  matchId: z.string().nullable(),
});

export const MATCH_ERROR_CODES = [
  "not_a_player",
  "wrong_phase",
  "round_closed",
  "already_answered",
  "powerup_unavailable",
  "bad_message",
] as const;
export const MatchErrorCodeSchema = z.enum(MATCH_ERROR_CODES);

export const ErrorMessageSchema = z.object({
  type: z.literal("error"),
  ...base,
  code: MatchErrorCodeSchema,
  message: z.string(),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  SnapshotMessageSchema,
  LobbyMessageSchema,
  IntroMessageSchema,
  ArmingMessageSchema,
  ArmedAckMessageSchema,
  BannerMessageSchema,
  QuestionMessageSchema,
  AnswerAckMessageSchema,
  OpponentAnsweredMessageSchema,
  PowerupResultMessageSchema,
  OpponentPowerupMessageSchema,
  RevealMessageSchema,
  OpponentConnectionMessageSchema,
  MatchEndMessageSchema,
  RematchMessageSchema,
  ErrorMessageSchema,
]);

export type PlayerView = z.infer<typeof PlayerViewSchema>;
export type QuestionView = z.infer<typeof QuestionViewSchema>;
export type BannerItem = z.infer<typeof BannerItemSchema>;
export type ShownRating = z.infer<typeof ShownRatingSchema>;
export type RevealPayload = z.infer<typeof RevealPayloadSchema>;
export type MatchEndPayload = z.infer<typeof MatchEndPayloadSchema>;
export type MatchEndSummary = z.infer<typeof MatchEndSummarySchema>;
export type RematchState = z.infer<typeof RematchStateSchema>;
export type MatchErrorCode = z.infer<typeof MatchErrorCodeSchema>;

export type SnapshotMessage = z.infer<typeof SnapshotMessageSchema>;
export type LobbyMessage = z.infer<typeof LobbyMessageSchema>;
export type IntroMessage = z.infer<typeof IntroMessageSchema>;
export type ArmingMessage = z.infer<typeof ArmingMessageSchema>;
export type ArmedAckMessage = z.infer<typeof ArmedAckMessageSchema>;
export type BannerMessage = z.infer<typeof BannerMessageSchema>;
export type QuestionMessage = z.infer<typeof QuestionMessageSchema>;
export type AnswerAckMessage = z.infer<typeof AnswerAckMessageSchema>;
export type OpponentAnsweredMessage = z.infer<typeof OpponentAnsweredMessageSchema>;
export type PowerupResultMessage = z.infer<typeof PowerupResultMessageSchema>;
export type OpponentPowerupMessage = z.infer<typeof OpponentPowerupMessageSchema>;
export type RevealMessage = z.infer<typeof RevealMessageSchema>;
export type OpponentConnectionMessage = z.infer<typeof OpponentConnectionMessageSchema>;
export type MatchEndMessage = z.infer<typeof MatchEndMessageSchema>;
export type RematchMessage = z.infer<typeof RematchMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type ServerMessageType = ServerMessage["type"];

// ---------------------------------------------------------------------------
// Queue (Matchmaker). Client to server: nothing but "ping". Leaving the queue
// is closing the socket.
// ---------------------------------------------------------------------------

export const QueueStatusMessageSchema = z.object({
  type: z.literal("queue_status"),
  ...base,
  /** Players searching in this course, including you. */
  searching: z.number().int().nonnegative(),
  waitedMs: durationMs,
  /** Your current allowed rating gap; null once unlimited. */
  window: z.number().nullable(),
});

export const MatchedMessageSchema = z.object({
  type: z.literal("matched"),
  ...base,
  matchId: z.string(),
});

export const QUEUE_ERROR_CODES = ["already_in_match", "bad_course", "rate_limited", "internal"] as const;

export const QueueErrorMessageSchema = z.object({
  type: z.literal("error"),
  ...base,
  code: z.enum(QUEUE_ERROR_CODES),
  /** already_in_match: the running match, so the client can go back to it. */
  matchId: z.string().nullable(),
});

export const QueueServerMessageSchema = z.discriminatedUnion("type", [
  QueueStatusMessageSchema,
  MatchedMessageSchema,
  QueueErrorMessageSchema,
]);

export type QueueStatusMessage = z.infer<typeof QueueStatusMessageSchema>;
export type MatchedMessage = z.infer<typeof MatchedMessageSchema>;
export type QueueErrorMessage = z.infer<typeof QueueErrorMessageSchema>;
export type QueueServerMessage = z.infer<typeof QueueServerMessageSchema>;

// ---------------------------------------------------------------------------
// Heartbeat and close codes
// ---------------------------------------------------------------------------

/** Text frames, answered by setWebSocketAutoResponse without waking the DO. */
export const PING = "ping";
export const PONG = "pong";

export const CLOSE_CODES = {
  /** Normal end (match over, or matched in the queue). */
  normal: 1000,
  /** Replaced by a newer connection of the same user. Do not reconnect. */
  replaced: 4001,
  /** Not a player of this match, or not signed in. Do not reconnect. */
  notAuthorised: 4003,
  /** Match not found. Do not reconnect. */
  notFound: 4004,
  /** Too many frames from this socket (policy violation). Reconnect with backoff. */
  tooMany: 1008,
  /** A frame over NET.maxClientFrameBytes. Reconnect with backoff. */
  tooBig: 1009,
  /** Too many socket connections from this user; back off and retry. */
  tryLater: 1013,
} as const;
export type CloseCode = (typeof CLOSE_CODES)[keyof typeof CLOSE_CODES];

/** Close codes after which the client must not reconnect. Any other close: back off and retry. */
export const FINAL_CLOSE_CODES: readonly number[] = [
  CLOSE_CODES.normal,
  CLOSE_CODES.replaced,
  CLOSE_CODES.notAuthorised,
  CLOSE_CODES.notFound,
];

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Parses a client frame. Returns null for anything invalid (including "ping"). */
export function parseClientMessage(raw: string): ClientMessage | null {
  const result = ClientMessageSchema.safeParse(parseJson(raw));
  return result.success ? result.data : null;
}

/** Parses a match server frame. Returns null for anything invalid (including "pong"). */
export function parseServerMessage(raw: string): ServerMessage | null {
  const result = ServerMessageSchema.safeParse(parseJson(raw));
  return result.success ? result.data : null;
}

/** Parses a queue server frame. Returns null for anything invalid. */
export function parseQueueServerMessage(raw: string): QueueServerMessage | null {
  const result = QueueServerMessageSchema.safeParse(parseJson(raw));
  return result.success ? result.data : null;
}
