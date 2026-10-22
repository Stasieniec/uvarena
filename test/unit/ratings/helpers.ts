// Builders for finished MatchState values and finalization contexts, so the
// finalization tests read as "who answered what" rather than 100-line literals.
import { MATCH } from "@shared/game/config";
import type {
  AnswerKey,
  BotLevel,
  EndReason,
  FinalizationContext,
  MatchMode,
  MatchState,
  PlayerCourseRow,
  PlayerState,
  RatingKind,
  RatingRow,
  RoundRecord,
  RoundSideRecord,
  Side,
} from "@shared/game/types";

export const T0 = Date.UTC(2026, 9, 22, 12, 0, 0); // 2026-10-22 14:00 Amsterdam
export const DAY = 24 * 60 * 60 * 1000;

export function human(userId: string, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    kind: "human",
    userId,
    name: userId,
    avatarUrl: null,
    hp: MATCH.startHp,
    loadout: ["zeus", "aegis", "oracle"],
    used: [],
    phoenixUsed: false,
    connected: true,
    everConnected: true,
    disconnectedSince: null,
    ready: true,
    botRating: 1500,
    botRatingN: 0,
    rankedBefore: null,
    bot: null,
    r: { armed: null, effective: null, nemesisAgainst: false, quick: null, answer: null, answeredAt: null, hidden: [] },
    ...overrides,
  };
}

export function botPlayer(level: BotLevel, strength: number, overrides: Partial<PlayerState> = {}): PlayerState {
  return human("", {
    kind: "bot",
    userId: null,
    name: `bot${level}`,
    botRating: strength,
    bot: { level, strength, speed: 1, zeusRound: null, nemesisRound: null, aegisRound: null, q: null },
    ...overrides,
  });
}

/** One side of a round. `true` = correct, `false` = wrong, `null` = timed out. */
export type SideSpec =
  | boolean
  | null
  | (Partial<RoundSideRecord> & { correct?: boolean });

export interface RoundSpec {
  a: SideSpec;
  b: SideSpec;
  questionId?: string;
  lectureId?: string;
  itemRating?: number;
  itemRatingN?: number;
  chance?: number;
}

const RIGHT: AnswerKey = { kind: "options", ids: ["right"] };
const WRONG: AnswerKey = { kind: "options", ids: ["wrong"] };

function sideRecord(spec: SideSpec, shownAt: number): RoundSideRecord {
  const base: RoundSideRecord = {
    answer: null,
    answeredAt: null,
    ms: null,
    correct: false,
    timedOut: true,
    timedOutAfterCountdown: false,
    helped: false,
    score: 0,
    damageTaken: 0,
    hpAfter: MATCH.startHp,
    armed: null,
    effective: null,
    nemesisAgainst: false,
    quick: null,
    phoenix: false,
  };
  if (spec === null) return base;
  if (typeof spec === "boolean") {
    return { ...base, answer: spec ? RIGHT : WRONG, answeredAt: shownAt + 4000, ms: 4000, correct: spec, timedOut: false, score: spec ? 900 : 0 };
  }
  const correct = spec.correct ?? false;
  const answered = spec.timedOut !== true;
  return {
    ...base,
    answer: answered ? (correct ? RIGHT : WRONG) : null,
    answeredAt: answered ? shownAt + 4000 : null,
    ms: answered ? 4000 : null,
    correct,
    timedOut: !answered,
    score: correct ? 900 : 0,
    ...spec,
  };
}

export function rounds(specs: RoundSpec[], start = T0): RoundRecord[] {
  return specs.map((spec, i) => {
    const shownAt = start + i * 30_000;
    return {
      round: i + 1,
      suddenDeath: i + 1 > MATCH.maxRounds,
      questionId: spec.questionId ?? `q${i + 1}`,
      questionRev: 1,
      lectureId: spec.lectureId ?? "AGAI-L01",
      multiplier: 1,
      shownAt,
      timerMs: 20_000,
      deadline: shownAt + 20_000,
      countdownEnd: null,
      firstSide: null,
      capped: false,
      itemRating: spec.itemRating ?? 1500,
      itemRatingN: spec.itemRatingN ?? 0,
      chance: spec.chance ?? 0.25,
      sides: [sideRecord(spec.a, shownAt), sideRecord(spec.b, shownAt)],
    };
  });
}

export interface StateSpec {
  mode?: MatchMode;
  rated?: boolean;
  players?: [PlayerState, PlayerState];
  rounds?: RoundRecord[];
  winner: Side | "draw" | null;
  reason: EndReason;
  hp?: [number, number];
}

export function finishedState(spec: StateSpec): MatchState {
  const mode = spec.mode ?? "ranked";
  const players: [PlayerState, PlayerState] = spec.players ? [spec.players[0], spec.players[1]] : [human("alice"), human("bob")];
  const rs = spec.rounds ?? [];
  const endedAt = T0 + rs.length * 30_000 + 5_000;
  if (spec.hp) {
    players[0] = { ...players[0], hp: spec.hp[0] };
    players[1] = { ...players[1], hp: spec.hp[1] };
  }
  return {
    v: 1,
    matchId: "m1",
    courseId: "agai",
    mode,
    rated: spec.rated ?? mode === "ranked",
    settings: { powerups: true, lectures: null },
    joinCode: null,
    timeScale: 1,
    phase: "finished",
    phaseEndsAt: null,
    round: rs.length,
    suddenDeath: Math.max(0, rs.length - MATCH.maxRounds),
    players,
    questions: [],
    qIndex: rs.length,
    q: null,
    rounds: rs,
    rng: 1,
    createdAt: T0 - 10_000,
    startedAt: T0 - 4_000,
    noShowAt: null,
    lobbyExpiresAt: null,
    result: { winner: spec.winner, reason: spec.reason, endedAt },
    rematch: [false, false],
    rematchUntil: null,
    rematchMatchId: null,
    cleanupAt: null,
    finalized: false,
    endSummaries: null,
  };
}

export function ratingRow(userId: string, kind: RatingKind, overrides: Partial<RatingRow> = {}): RatingRow {
  return {
    userId,
    courseId: "agai",
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
    updatedAt: T0 - DAY,
    ...overrides,
  };
}

export function pcRow(userId: string, answers: number): PlayerCourseRow {
  return { userId, courseId: "agai", answers, correct: Math.floor(answers / 2), lastAnswerAt: T0 - DAY };
}

export interface CtxSpec {
  users?: string[];
  ratings?: RatingRow[];
  playerCourse?: PlayerCourseRow[];
  recentAnswers?: Record<string, string[]>;
  pairCount?: number;
  now?: number;
}

/** Context with no rows unless given; players default to 50 answers so item guards pass. */
export function context(spec: CtxSpec = {}): FinalizationContext {
  const users = spec.users ?? ["alice", "bob"];
  const ratings: FinalizationContext["ratings"] = {};
  const playerCourse: FinalizationContext["playerCourse"] = {};
  for (const u of users) {
    ratings[u] = { ranked: null, bot: null, casual: null };
    playerCourse[u] = pcRow(u, 50);
  }
  for (const row of spec.ratings ?? []) {
    ratings[row.userId] = { ...(ratings[row.userId] ?? { ranked: null, bot: null, casual: null }), [row.kind]: row };
  }
  for (const row of spec.playerCourse ?? []) playerCourse[row.userId] = row;
  return {
    now: spec.now ?? T0 + 3_600_000,
    ratings,
    playerCourse,
    recentAnswers: spec.recentAnswers ?? {},
    pairCount: spec.pairCount ?? 0,
  };
}

/** Recursively freezes a value, so a test fails if planFinalization mutates its input. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}
