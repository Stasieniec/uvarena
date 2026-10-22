// Match creation: refuses players who are already in a match, loads the
// players and their ratings, selects the questions, inserts the `matches` row
// and initialises the match's MatchRoom. Also joins private lobbies by code.
//
// D1 status at creation: `lobby` for a private lobby waiting for its second
// player, `active` for every match whose players are all known (ranked, bot,
// private rematch), so "already in a match" and "Back to your match" work
// from the moment a pairing is made. The MatchRoom's `started` effect then
// sets started_at, and finalization or cancellation closes the row.

import { and, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { botInit } from "../shared/game/bot";
import { ECHO, LIMITS, MATCH, POWERUPS, QUESTIONS, SELECTION, TEST_BOTS, TEST_MODE } from "../shared/game/config";
import { createRng } from "../shared/game/rng";
import { selectQuestions, selectionTarget } from "../shared/game/select";
import type { BotInit, BotLevel, MatchInit, MatchMode, MatchSettings, PlayerInit, PowerupId, QuestionFull } from "../shared/game/types";
import { POWERUP_IDS } from "../shared/game/types";
import { answers, courses, matches, questions, ratings, user, userPrefs } from "./db/schema";
import { MatchFactoryError, type CreateMatchResult, type CreateMatchSpec } from "./do/contracts";
import type { Env } from "./env";
import { isTestEnv } from "./middleware/test-mode";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Join code insert attempts before giving up on unique-index collisions. */
const JOIN_CODE_ATTEMPTS = 8;

// ---------------------------------------------------------------------------
// Engine functions the factory uses. The DO test suite runs before the engine
// package is merged, so in test mode (and only there) it may swap in scripted
// stand-ins through globalThis[FACTORY_TEST_DEPS_KEY].
// ---------------------------------------------------------------------------

export interface FactoryDeps {
  createRng: typeof createRng;
  selectQuestions: typeof selectQuestions;
  selectionTarget: typeof selectionTarget;
  botInit: typeof botInit;
}

export const FACTORY_TEST_DEPS_KEY = "__matchFactoryTestDeps";

const realDeps: FactoryDeps = { createRng, selectQuestions, selectionTarget, botInit };

function deps(env: Env): FactoryDeps {
  if (isTestEnv(env)) {
    const override = (globalThis as Record<string, unknown>)[FACTORY_TEST_DEPS_KEY];
    if (override) return override as FactoryDeps;
  }
  return realDeps;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

function newMatchId(): string {
  return crypto.randomUUID();
}

/** 6 characters from LIMITS.joinCodeAlphabet (32 symbols, so byte % 32 is unbiased). */
export function newJoinCode(): string {
  const alphabet = LIMITS.joinCodeAlphabet;
  const bytes = crypto.getRandomValues(new Uint8Array(LIMITS.joinCodeLength));
  let code = "";
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return code;
}

export function normaliseJoinCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (code.length !== LIMITS.joinCodeLength) return null;
  for (const ch of code) if (!LIMITS.joinCodeAlphabet.includes(ch)) return null;
  return code;
}

function errorText(err: unknown): string {
  const parts: string[] = [];
  let e: unknown = err;
  for (let depth = 0; e && depth < 4; depth++) {
    parts.push(e instanceof Error ? e.message : String(e));
    e = e instanceof Error ? e.cause : undefined;
  }
  return parts.join(" | ");
}

function isJoinCodeCollision(err: unknown): boolean {
  const text = errorText(err);
  return text.includes("UNIQUE") && text.includes("join_code");
}

function isLoadout(value: unknown): value is PowerupId[] {
  return (
    Array.isArray(value) &&
    value.length === POWERUPS.loadoutSize &&
    new Set(value).size === value.length &&
    value.every((v) => (POWERUP_IDS as readonly unknown[]).includes(v))
  );
}

/** A `questions` row as the MatchRoom needs it (with its key). */
export function toQuestionFull(row: typeof questions.$inferSelect): QuestionFull {
  return {
    id: row.id,
    rev: row.rev,
    courseId: row.courseId,
    lectureId: row.lectureId,
    type: row.type,
    prompt: row.promptMd,
    statement: row.statementMd,
    codeLang: row.codeLang,
    options: row.optionsJson,
    targets: row.targetsJson ?? null,
    key: row.keyJson,
    shuffle: row.shuffle,
    whyShort: row.whyShort,
    timeS: row.timeS,
    words: row.words,
    chance: row.chance,
    rating: row.rating,
    ratingN: row.ratingN,
  };
}

// ---------------------------------------------------------------------------
// Loading players
// ---------------------------------------------------------------------------

interface LoadedPlayer {
  init: PlayerInit;
  /** Strongest ladder bot beaten in this course (bot rating row), 0 for none. */
  highestBotLevel: number;
}

async function loadPlayers(orm: DrizzleD1Database, userIds: string[], courseId: string): Promise<LoadedPlayer[]> {
  const users = await orm
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      displayUsername: user.displayUsername,
      image: user.image,
    })
    .from(user)
    .where(inArray(user.id, userIds));
  const prefs = await orm.select().from(userPrefs).where(inArray(userPrefs.userId, userIds));
  const ratingRows = await orm
    .select()
    .from(ratings)
    .where(and(inArray(ratings.userId, userIds), eq(ratings.courseId, courseId), inArray(ratings.kind, ["ranked", "bot"])));

  return userIds.map((id) => {
    const u = users.find((row) => row.id === id);
    if (!u) throw new MatchFactoryError("user_not_found", "User not found");
    const pref = prefs.find((row) => row.userId === id);
    const ranked = ratingRows.find((row) => row.userId === id && row.kind === "ranked");
    const bot = ratingRows.find((row) => row.userId === id && row.kind === "bot");
    const init: PlayerInit = {
      userId: id,
      name: u.displayUsername ?? u.username ?? u.name,
      avatarUrl: u.image,
      loadout: isLoadout(pref?.loadoutJson) ? [...pref.loadoutJson] : [...POWERUPS.defaultLoadout],
      botRating: bot?.rating ?? null,
      botRatingN: bot?.n ?? 0,
      ranked:
        ranked && ranked.rating !== null && ranked.rd !== null && ranked.vol !== null
          ? { r: ranked.rating, rd: ranked.rd, vol: ranked.vol }
          : null,
    };
    return { init, highestBotLevel: bot?.highestBotLevel ?? 0 };
  });
}

// ---------------------------------------------------------------------------
// Busy players
// ---------------------------------------------------------------------------

async function cancelLobby(env: Env, orm: DrizzleD1Database, matchId: string, now: number): Promise<void> {
  try {
    await env.MATCH_ROOM.getByName(matchId).cancel("cancelled");
  } catch (err) {
    console.error("cancelLobby: room cancel failed", matchId, err);
  }
  // The room's cancelled effect does this too; repeat it in case the room is gone.
  await orm
    .update(matches)
    .set({ status: "cancelled", endReason: "cancelled", endedAt: now })
    .where(and(eq(matches.id, matchId), eq(matches.status, "lobby")));
}

/**
 * Throws already_in_match if any of the users plays in a running match, then
 * cancels the private lobbies they are in. A row still marked `active` whose
 * room says the match is over (its D1 update is pending or was lost) does not
 * count, so a stuck row never locks a player out.
 */
async function refuseIfBusy(env: Env, orm: DrizzleD1Database, userIds: string[], now: number): Promise<void> {
  const rows = await orm
    .select({ id: matches.id, status: matches.status })
    .from(matches)
    .where(
      and(
        inArray(matches.status, ["lobby", "active"]),
        or(inArray(matches.playerA, userIds), inArray(matches.playerB, userIds)),
      ),
    );

  for (const row of rows) {
    if (row.status !== "active") continue;
    let over = false;
    try {
      const summary = await env.MATCH_ROOM.getByName(row.id).summary();
      over = summary.phase === "finished" || summary.phase === "cancelled";
    } catch (err) {
      console.error("refuseIfBusy: summary failed", row.id, err);
    }
    if (!over) throw new MatchFactoryError("already_in_match", "Already in a match", row.id);
  }

  for (const row of rows) {
    if (row.status === "lobby") await cancelLobby(env, orm, row.id, now);
  }
}

// ---------------------------------------------------------------------------
// Question selection
// ---------------------------------------------------------------------------

async function pickQuestions(
  env: Env,
  orm: DrizzleD1Database,
  args: {
    courseId: string;
    mode: MatchMode;
    settings: MatchSettings;
    players: PlayerInit[];
    botStrength: number | null;
    now: number;
  },
): Promise<QuestionFull[]> {
  const d = deps(env);
  const filters = [
    eq(questions.courseId, args.courseId),
    eq(questions.status, "active"),
    inArray(questions.type, [...QUESTIONS.uiTypes]),
  ];
  const lectures = args.settings.lectures;
  if (lectures && lectures.length > 0) filters.push(inArray(questions.lectureId, lectures));

  const candidates = await orm
    .select({ id: questions.id, rating: questions.rating })
    .from(questions)
    .where(and(...filters));
  if (candidates.length === 0) throw new MatchFactoryError("no_questions", "No questions to play");

  const userIds = args.players.map((p) => p.userId);
  const seenRows = await orm
    .select({ questionId: answers.questionId, last: sql<number>`max(${answers.answeredAt})` })
    .from(answers)
    .where(
      and(
        inArray(answers.userId, userIds),
        eq(answers.courseId, args.courseId),
        gte(answers.answeredAt, args.now - SELECTION.freshWindowDays * DAY_MS),
      ),
    )
    .groupBy(answers.questionId);
  const lastSeen = new Map(seenRows.map((r) => [r.questionId, Number(r.last)]));

  const target = d.selectionTarget({
    mode: args.mode,
    playerBotRatings: args.players.map((p) => p.botRating),
    botStrength: args.botStrength,
  });
  const picked = d.selectQuestions(candidates, {
    target,
    count: MATCH.questionsPerMatch,
    seenRecently: new Set(lastSeen.keys()),
    lastSeen,
    rng: d.createRng(randomSeed()),
  });
  if (picked.length === 0) throw new MatchFactoryError("no_questions", "No questions to play");

  // A narrow lecture filter can leave fewer questions than a long match can
  // use; repeat the picked ones so the match never runs out.
  const ids = picked.map((q) => q.id);
  for (let i = 0; ids.length < MATCH.questionsPerMatch; i++) ids.push(ids[i]!);

  const rows = await orm
    .select()
    .from(questions)
    .where(inArray(questions.id, [...new Set(ids)]));
  const byId = new Map(rows.map((row) => [row.id, toQuestionFull(row)]));
  return ids.map((id) => {
    const q = byId.get(id);
    if (!q) throw new MatchFactoryError("no_questions", "A selected question disappeared");
    return q;
  });
}

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

function resolveBot(env: Env, spec: CreateMatchSpec, player: LoadedPlayer): BotInit {
  const requested = spec.bot?.level;
  if (requested === undefined) throw new Error("createMatch: bot matches need spec.bot");
  const level: BotLevel = requested === "echo" ? ECHO.level : requested;
  const testOnly = level === TEST_BOTS.dummy.level || level === TEST_BOTS.oracle.level;
  if (testOnly && !spec.testMode) throw new MatchFactoryError("bot_locked", "That bot is not available");
  if (!testOnly && level !== ECHO.level && level > 1 && player.highestBotLevel < level - 1) {
    throw new MatchFactoryError("bot_locked", "Beat the bot before this one first");
  }
  return deps(env).botInit(level, player.init.botRating);
}

// ---------------------------------------------------------------------------
// createMatch
// ---------------------------------------------------------------------------

function checkSpec(spec: CreateMatchSpec): void {
  const n = spec.humans.length;
  const distinct = new Set(spec.humans).size === n;
  const ok =
    distinct &&
    ((spec.mode === "ranked" && n === 2) ||
      (spec.mode === "bot" && n === 1 && spec.bot !== undefined) ||
      (spec.mode === "private" && (n === 1 || n === 2)));
  if (!ok) throw new Error(`createMatch: invalid spec for mode ${spec.mode} with ${n} humans`);
}

async function initRoom(env: Env, orm: DrizzleD1Database, init: MatchInit): Promise<void> {
  try {
    await env.MATCH_ROOM.getByName(init.matchId).init(init);
  } catch (err) {
    // Without a room the row would lock its players out: close it.
    await orm
      .update(matches)
      .set({ status: "cancelled", endReason: "cancelled", endedAt: Date.now() })
      .where(eq(matches.id, init.matchId));
    throw err;
  }
}

/**
 * 1. Refuse if any human has an `active` match (MatchFactoryError
 *    already_in_match), and cancel lobbies they are in.
 * 2. Load users, prefs, ratings and 7-day recent answers.
 * 3. Select questions (private lobby with one human: at join time instead).
 * 4. Insert the matches row, then MATCH_ROOM.getByName(id).init(...).
 * Private lobbies get a join code, retried on unique-index collision.
 */
export async function createMatch(env: Env, spec: CreateMatchSpec): Promise<CreateMatchResult> {
  checkSpec(spec);
  const orm = drizzle(env.DB);
  const now = Date.now();

  const [course] = await orm
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, spec.courseId), eq(courses.active, true)));
  if (!course) throw new MatchFactoryError("unknown_course", "Unknown course");

  await refuseIfBusy(env, orm, spec.humans, now);
  const loaded = await loadPlayers(orm, spec.humans, spec.courseId);
  const players = loaded.map((p) => p.init);
  const bot = spec.mode === "bot" ? resolveBot(env, spec, loaded[0]!) : null;
  const rated = spec.mode === "ranked" ? true : spec.mode === "bot" ? false : spec.rated;
  const isLobby = spec.mode === "private" && players.length === 1;

  const selected = isLobby
    ? []
    : await pickQuestions(env, orm, {
        courseId: spec.courseId,
        mode: spec.mode,
        settings: spec.settings,
        players,
        botStrength: bot?.strength ?? null,
        now,
      });

  const matchId = newMatchId();
  const loadout = (p: PlayerInit | undefined) => (p ? (spec.settings.powerups ? p.loadout : []) : null);
  let code: string | null = null;
  for (let attempt = 1; ; attempt++) {
    code = isLobby ? newJoinCode() : null;
    try {
      await orm.insert(matches).values({
        id: matchId,
        courseId: spec.courseId,
        mode: spec.mode,
        rated,
        joinCode: code,
        status: isLobby ? "lobby" : "active",
        playerA: players[0]!.userId,
        playerB: players[1]?.userId ?? null,
        botLevel: bot?.level ?? null,
        botRating: bot?.strength ?? null,
        settingsJson: spec.settings,
        loadoutAJson: loadout(players[0]),
        loadoutBJson: loadout(players[1]),
        createdAt: now,
      });
      break;
    } catch (err) {
      if (isLobby && attempt < JOIN_CODE_ATTEMPTS && isJoinCodeCollision(err)) continue;
      throw err;
    }
  }

  await initRoom(env, orm, {
    matchId,
    courseId: spec.courseId,
    mode: spec.mode,
    rated,
    settings: spec.settings,
    joinCode: code,
    createdAt: now,
    seed: randomSeed(),
    humans: players,
    bot,
    questions: selected,
    timeScale: spec.testMode ? TEST_MODE.timeScale : 1,
  });

  return { matchId, code };
}

// ---------------------------------------------------------------------------
// joinLobby
// ---------------------------------------------------------------------------

/**
 * Joins a private lobby by code: loads the joiner, selects questions for both
 * players, calls MatchRoom.join, sets matches.player_b. Throws
 * MatchFactoryError lobby_not_found, lobby_full, lobby_expired or already_in_match.
 * Opening your own lobby's code (host, or a joiner retrying) returns its id.
 */
export async function joinLobby(env: Env, code: string, userId: string): Promise<{ matchId: string }> {
  const orm = drizzle(env.DB);
  const now = Date.now();
  const normalised = normaliseJoinCode(code);
  if (!normalised) throw new MatchFactoryError("lobby_not_found", "No match with that code");

  const [row] = await orm.select().from(matches).where(eq(matches.joinCode, normalised));
  if (!row) throw new MatchFactoryError("lobby_not_found", "No match with that code");
  if (row.playerA === userId || row.playerB === userId) return { matchId: row.id };
  if (row.status === "cancelled") throw new MatchFactoryError("lobby_expired", "That match has expired");
  if (row.status !== "lobby" || row.playerB !== null) throw new MatchFactoryError("lobby_full", "That match is full");

  await refuseIfBusy(env, orm, [userId], now);
  const loaded = await loadPlayers(orm, [row.playerA, userId], row.courseId);
  const players = loaded.map((p) => p.init);
  const joiner = players[1]!;
  const selected = await pickQuestions(env, orm, {
    courseId: row.courseId,
    mode: "private",
    settings: row.settingsJson,
    players,
    botStrength: null,
    now,
  });

  const result = await env.MATCH_ROOM.getByName(row.id).join(joiner, selected);
  if (result === "ok") {
    await orm
      .update(matches)
      .set({ playerB: userId, loadoutBJson: row.settingsJson.powerups ? joiner.loadout : [] })
      .where(and(eq(matches.id, row.id), isNull(matches.playerB)));
    return { matchId: row.id };
  }
  if (result === "full") throw new MatchFactoryError("lobby_full", "That match is full");
  if (result === "expired") throw new MatchFactoryError("lobby_expired", "That match has expired");

  const [after] = await orm.select({ status: matches.status }).from(matches).where(eq(matches.id, row.id));
  if (!after || after.status === "cancelled") throw new MatchFactoryError("lobby_expired", "That match has expired");
  throw new MatchFactoryError("lobby_full", "That match is full");
}
