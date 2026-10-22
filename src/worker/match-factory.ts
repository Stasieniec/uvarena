// STUB (Durable Objects package). Creates a match row and initialises its DO.
import { notImplemented } from "../shared/not-implemented";
import type { QuestionFull } from "../shared/game/types";
import type { CreateMatchResult, CreateMatchSpec } from "./do/contracts";
import type { Env } from "./env";
import type { questions } from "./db/schema";

/**
 * 1. Refuse if any human has an `active` match (MatchFactoryError
 *    already_in_match), and cancel lobbies they host.
 * 2. Load users, prefs, ratings and 7-day recent answers.
 * 3. Select questions (private lobby with one human: at join time instead).
 * 4. Insert the matches row, then MATCH_ROOM.getByName(id).init(...).
 * Private matches get a join code, retried on unique-index collision.
 */
export async function createMatch(env: Env, spec: CreateMatchSpec): Promise<CreateMatchResult> {
  void env; void spec;
  return notImplemented("match-factory.createMatch");
}

/**
 * Joins a private lobby by code: loads the joiner, selects questions for both
 * players, calls MatchRoom.join, sets matches.player_b. Throws
 * MatchFactoryError lobby_not_found, lobby_full, lobby_expired or already_in_match.
 */
export async function joinLobby(env: Env, code: string, userId: string): Promise<{ matchId: string }> {
  void env; void code; void userId;
  return notImplemented("match-factory.joinLobby");
}

/** A `questions` row as the MatchRoom needs it (with its key). */
export function toQuestionFull(row: typeof questions.$inferSelect): QuestionFull {
  void row;
  return notImplemented("match-factory.toQuestionFull");
}
