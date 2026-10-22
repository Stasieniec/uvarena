// Contracts between the Worker (routes, match factory) and the two Durable
// Object classes: RPC interfaces, the headers the Worker forwards on WebSocket
// upgrades, socket attachments, naming, and the match factory's spec.
//
// Flow for a match socket: the Worker authenticates the user, checks the
// Origin header and that the user plays in the match (D1), then forwards the
// upgrade to MATCH_ROOM.getByName(matchId).fetch() with HEADERS.userId set.
// The DO trusts that header; it is never reachable from outside the Worker.

import type {
  BotLevel,
  CancelReason,
  MatchInit,
  MatchMode,
  MatchSettings,
  Phase,
  PlayerInit,
  QuestionFull,
} from "../../shared/game/types";

// ---------------------------------------------------------------------------
// MatchRoom: one per match, env.MATCH_ROOM.getByName(matchId)
// ---------------------------------------------------------------------------

/** Result of MatchRoom.join. */
export type JoinResult = "ok" | "full" | "expired" | "not_lobby";

export interface MatchRoomSummary {
  /** False when the room has no state (never initialised, or cleaned up); phase is then "cancelled". */
  exists: boolean;
  phase: Phase;
  /** User ids of the human players, side order. */
  players: string[];
  /** The finalization batch landed in D1. */
  finalized: boolean;
  /** An effect (D1 write, rematch) is still waiting to be retried. */
  effectsPending: boolean;
}

export interface MatchRoomRpc {
  /** Creates the match state. Idempotent on matchId: a second call is a no-op. */
  init(init: MatchInit): Promise<void>;
  /** Private lobby: adds player b and the selected questions. */
  join(player: PlayerInit, questions: QuestionFull[]): Promise<JoinResult>;
  /**
   * Cancels a lobby or a match that has not started. No-op once it has
   * started or ended. Returns the phase afterwards (null: no room state).
   */
  cancel(reason: CancelReason): Promise<Phase | null>;
  summary(): Promise<MatchRoomSummary>;
}

/** Stored on each match socket with serializeAttachment. */
export interface MatchSocketAttachment {
  userId: string;
}

// ---------------------------------------------------------------------------
// Matchmaker: one per course, env.MATCHMAKER.getByName(matchmakerName(courseId), { locationHint })
// ---------------------------------------------------------------------------

export interface MatchmakerRpc {
  /** Players currently queued in this course. */
  searching(): Promise<number>;
}

/** Stored on each queue socket with serializeAttachment. */
export interface QueueSocketAttachment {
  userId: string;
  rating: number;
  rd: number;
  joinedAt: number;
  /** Last ranked opponent, avoided when another candidate fits. */
  lastOpponent: string | null;
}

export function matchmakerName(courseId: string): string {
  return `mm:${courseId}`;
}

// ---------------------------------------------------------------------------
// Headers the Worker sets when forwarding a WebSocket upgrade to a DO
// ---------------------------------------------------------------------------

export const HEADERS = {
  /** Authenticated user id. Both DOs. */
  userId: "x-user-id",
  /** Queue only: ranked rating (start value when the user has none). */
  rating: "x-rating",
  /** Queue only: ranked RD. */
  rd: "x-rd",
  /** Queue only: last ranked opponent's user id, if any. */
  lastOpponent: "x-last-opponent",
} as const;

// ---------------------------------------------------------------------------
// Match factory (src/worker/match-factory.ts)
// ---------------------------------------------------------------------------

export interface CreateMatchSpec {
  courseId: string;
  mode: MatchMode;
  rated: boolean;
  settings: MatchSettings;
  /**
   * Human user ids, side order. Ranked: two. Bot: one. Private: the host
   * (a lobby with a join code is created), or two for a rematch (no lobby).
   */
  humans: string[];
  /** Bot matches only. Levels 0 and 9 only in test mode. */
  bot?: { level: Exclude<BotLevel, -1> | "echo" };
  /** The match this one is a rematch of. */
  rematchOf?: string;
  /** Apply TEST_MODE.timeScale (the caller decides test mode). */
  testMode?: boolean;
}

export interface CreateMatchResult {
  matchId: string;
  /** Private lobbies only. */
  code: string | null;
}

export type MatchFactoryErrorCode =
  | "already_in_match"
  | "unknown_course"
  | "bot_locked"
  | "no_questions"
  | "user_not_found"
  | "lobby_not_found"
  | "lobby_full"
  | "lobby_expired";

/** Thrown by createMatch; routes map it to an ApiError with the same code. */
export class MatchFactoryError extends Error {
  readonly code: MatchFactoryErrorCode;
  /** already_in_match: the user's running match. */
  readonly matchId: string | null;

  constructor(code: MatchFactoryErrorCode, message: string, matchId: string | null = null) {
    super(message);
    this.name = "MatchFactoryError";
    this.code = code;
    this.matchId = matchId;
  }
}
