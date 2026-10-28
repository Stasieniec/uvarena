// HTTP API contract: zod schemas for every request body, query and response
// under /api, plus the `endpoints` table that ties each route to its schemas.
// The Worker validates with these (@hono/zod-validator); the client builds its
// typed fetch helpers from `endpoints`.
//
// Conventions:
// - JSON everywhere except PUT /api/me/avatar (raw image bytes) and
//   GET /api/avatars/:key (image bytes).
// - Timestamps are epoch ms. Query parameters arrive as strings and are coerced.
// - Errors: any non-2xx response has the body ApiErrorSchema.
// - A session is required except for health, config, auth and avatars.

import { z } from "zod";
import { LIMITS, POWERUPS } from "./game/config";
import {
  AnswerSchema,
  EndReasonSchema,
  IdSchema,
  MatchModeSchema,
  MatchSettingsSchema,
  OptionSchema,
  PowerupIdSchema,
  QuestionTypeSchema,
} from "./protocol";

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

export const ApiErrorCodeSchema = z.enum([
  "bad_request",
  "unauthorised",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "payload_too_large",
  "unsupported_media_type",
  "already_in_match",
  "username_taken",
  "bot_locked",
  "no_questions",
  "lobby_full",
  "lobby_expired",
  "not_a_lobby",
  "test_mode_off",
  "internal",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    /** already_in_match: the running match. */
    matchId: z.string().optional(),
    /** bad_request: zod issues, flattened to path and message. */
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const OkSchema = z.object({ ok: z.literal(true) });

const epochMs = z.number().int().nonnegative();
/** A cursor or timestamp in a query string. */
const epochMsQuery = z.coerce.number().int().nonnegative();

/** Course ids: lowercase codes such as `agai`, `eprm`. */
export const CourseIdSchema = z.string().regex(/^[a-z0-9-]{2,16}$/);
/** Lecture ids: file stems such as `AGAI-L05`, `AGAI-starter-games`. */
export const LectureIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_.-]+$/);
/** Question ids: `<course>-<6 chars>`, e.g. `agai-3f9k2m`. */
export const QuestionIdSchema = z.string().regex(/^[a-z0-9]{2,16}-[23456789abcdefghjkmnpqrstuvwxyz]{6}$/);
export const MatchIdSchema = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);
export const JoinCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(LIMITS.joinCodeLength)
  .regex(new RegExp(`^[${LIMITS.joinCodeAlphabet}]+$`));

export const UsernameSchema = z
  .string()
  .trim()
  .min(LIMITS.usernameMin)
  .max(LIMITS.usernameMax)
  .regex(LIMITS.usernamePattern, "Letters, digits, underscore and dot only");
export const PersonNameSchema = z.string().trim().min(LIMITS.nameMin).max(LIMITS.nameMax);

/** Exactly POWERUPS.loadoutSize distinct power-ups. */
export const LoadoutSchema = z
  .array(PowerupIdSchema)
  .length(POWERUPS.loadoutSize)
  .refine((ids) => new Set(ids).size === ids.length, "Power-ups must be distinct");

/** Lecture filter in create requests: omitted or null means the whole course. */
export const LectureFilterSchema = z.array(LectureIdSchema).min(1).max(64).nullable().optional();

/** A user as other signed-in players see them. Full names are visible to signed-in players. */
export const PublicUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayUsername: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  image: z.string().nullable(),
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

/** The signed-in user. */
export const MeUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  /** First name + surname. */
  name: z.string(),
  /** Null for Google users until onboarding. */
  username: z.string().nullable(),
  displayUsername: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  image: z.string().nullable(),
  role: z.enum(["user", "admin"]),
  createdAt: epochMs,
});
export type MeUser = z.infer<typeof MeUserSchema>;

export const PrefsSchema = z.object({
  loadout: LoadoutSchema,
  sound: z.boolean(),
  courseId: CourseIdSchema.nullable(),
});
export type Prefs = z.infer<typeof PrefsSchema>;

/** A rating as shown in the UI. */
export const RatingViewSchema = z.object({
  /** Null when the player has no rating yet (shown as the start value with "?"). */
  rating: z.number().nullable(),
  provisional: z.boolean(),
});

export const RankedStatsSchema = RatingViewSchema.extend({
  rd: z.number().nullable(),
  played: z.number().int(),
  won: z.number().int(),
  lost: z.number().int(),
  drawn: z.number().int(),
  surrendered: z.number().int(),
  abandoned: z.number().int(),
  curStreak: z.number().int(),
  bestStreak: z.number().int(),
});

export const BotStatsSchema = RatingViewSchema.extend({
  /** Rated bot answers so far. */
  n: z.number().int(),
  played: z.number().int(),
  won: z.number().int(),
  lost: z.number().int(),
  drawn: z.number().int(),
  /** Strongest ladder bot beaten (0 for none). */
  highestBotLevel: z.number().int(),
});

/** One line in match lists (home, history, profiles). From the viewer's or profile owner's side. */
export const MatchSummarySchema = z.object({
  id: MatchIdSchema,
  courseId: CourseIdSchema,
  mode: MatchModeSchema,
  rated: z.boolean(),
  /** Null for a bot opponent. */
  opponent: PublicUserSchema.nullable(),
  /** Bot matches: the bot. */
  bot: z.object({ level: z.number().int(), name: z.string() }).nullable(),
  result: z.enum(["win", "loss", "draw", "void"]),
  endReason: EndReasonSchema,
  /** Ranked or bot rating change for this side; null when nothing moved. */
  ratingChange: z.number().nullable(),
  hp: z.object({ you: z.number().int(), opponent: z.number().int() }),
  roundsPlayed: z.number().int(),
  endedAt: epochMs,
});
export type MatchSummary = z.infer<typeof MatchSummarySchema>;

export const BotLadderItemSchema = z.object({
  level: z.number().int().min(1).max(8),
  name: z.string(),
  line: z.string(),
  rating: z.number(),
  unlocked: z.boolean(),
  beaten: z.boolean(),
});

/** A question shown outside a match (missed questions): stable ids, never the key. */
export const QuestionPublicSchema = z.object({
  id: QuestionIdSchema,
  rev: z.number().int(),
  courseId: CourseIdSchema,
  lectureId: LectureIdSchema,
  lectureTitle: z.string(),
  type: QuestionTypeSchema,
  prompt: z.string().nullable(),
  statement: z.string().nullable(),
  codeLang: z.string().nullable(),
  /** Shuffled per request when the question allows it. */
  options: z.array(OptionSchema),
  targets: z.array(OptionSchema).nullable(),
});
export type QuestionPublic = z.infer<typeof QuestionPublicSchema>;

/** Everything shown after answering a missed question. */
export const AnswerExplanationSchema = z.object({
  /** Stable ids. */
  key: AnswerSchema,
  why: z.string(),
  /** Reason per wrong option, by stable option id. */
  optionWhy: z.record(z.string(), z.string()),
  /** Deep link into the lecture note; null when there is no note. */
  noteUrl: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Public: health, config
// ---------------------------------------------------------------------------

export const HealthResponseSchema = z.object({ ok: z.literal(true) });

export const ConfigResponseSchema = z.object({
  googleEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  testMode: z.boolean(),
});

// ---------------------------------------------------------------------------
// Me
// ---------------------------------------------------------------------------

export const MeResponseSchema = z.object({
  user: MeUserSchema,
  prefs: PrefsSchema,
  /** True while username is null (Google sign-ups): the client sends them to onboarding. */
  needsOnboarding: z.boolean(),
  /** A match with status `active` this user plays in. */
  activeMatchId: MatchIdSchema.nullable(),
});

export const PatchMeBodySchema = z
  .object({
    username: UsernameSchema.optional(),
    firstName: PersonNameSchema.optional(),
    lastName: PersonNameSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "Nothing to update");
export const PatchMeResponseSchema = z.object({ user: MeUserSchema });

/** PUT /api/me/avatar: raw JPEG, PNG or WebP body, at most LIMITS.avatarMaxBytes. */
export const AVATAR_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const AvatarResponseSchema = z.object({ image: z.string().nullable() });

export const PutPrefsBodySchema = z
  .object({
    loadout: LoadoutSchema.optional(),
    sound: z.boolean().optional(),
    courseId: CourseIdSchema.nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "Nothing to update");
export const PrefsResponseSchema = z.object({ prefs: PrefsSchema });

// ---------------------------------------------------------------------------
// Courses and home
// ---------------------------------------------------------------------------

export const CoursesResponseSchema = z.object({
  courses: z.array(
    z.object({
      id: CourseIdSchema,
      code: z.string(),
      title: z.string(),
      shortTitle: z.string(),
      sort: z.number().int(),
      /** Active questions the UI can play. */
      questionCount: z.number().int(),
      lectures: z.array(
        z.object({
          id: LectureIdSchema,
          title: z.string(),
          sort: z.number().int(),
          questionCount: z.number().int(),
        }),
      ),
    }),
  ),
});

export const CourseQuerySchema = z.object({ course: CourseIdSchema });

export const HomeResponseSchema = z.object({
  courseId: CourseIdSchema,
  ranked: RankedStatsSchema,
  bot: BotStatsSchema,
  /** Players in this course's ranked queue right now. */
  searching: z.number().int(),
  /** Open missed questions in this course. */
  missedOpen: z.number().int(),
  recentMatches: z.array(MatchSummarySchema).max(LIMITS.homeRecentMatches),
  /** Next ladder bot to beat; null when the ladder is done. */
  nextBot: BotLadderItemSchema.nullable(),
});

// ---------------------------------------------------------------------------
// Bots and match creation
// ---------------------------------------------------------------------------

export const BotsResponseSchema = z.object({
  courseId: CourseIdSchema,
  echo: z.object({ name: z.string(), line: z.string(), rating: z.number() }),
  ladder: z.array(BotLadderItemSchema),
});

/** Ladder levels 1 to 8, or "echo". Test mode also accepts 0 (Dummy) and 9 (Perfect Bot). */
export const BotChoiceSchema = z.union([z.literal("echo"), z.number().int().min(0).max(9)]);

export const CreateBotMatchBodySchema = z.object({
  courseId: CourseIdSchema,
  bot: BotChoiceSchema,
  lectures: LectureFilterSchema,
});
export const CreateBotMatchResponseSchema = z.object({ matchId: MatchIdSchema });

export const CreateLobbyBodySchema = z.object({
  courseId: CourseIdSchema,
  lectures: LectureFilterSchema,
  powerups: z.boolean(),
  /** Forced to false when any setting is custom (a lecture filter, power-ups off). */
  rated: z.boolean(),
});
export const CreateLobbyResponseSchema = z.object({
  matchId: MatchIdSchema,
  code: z.string(),
  /** Rated after the custom-settings rule was applied. */
  rated: z.boolean(),
});

export const JoinLobbyBodySchema = z.object({ code: JoinCodeSchema });
export const JoinLobbyResponseSchema = z.object({ matchId: MatchIdSchema });

/** GET /api/queue/ws?course=... (WebSocket upgrade). */
export const QueueWsQuerySchema = CourseQuerySchema;

// ---------------------------------------------------------------------------
// Match detail and history
// ---------------------------------------------------------------------------

export const MatchDetailPlayerSchema = z.object({
  side: z.enum(["a", "b"]),
  user: PublicUserSchema.nullable(),
  bot: z.object({ level: z.number().int(), name: z.string() }).nullable(),
  hpEnd: z.number().int(),
  ratingBefore: z.number().nullable(),
  ratingAfter: z.number().nullable(),
});

export const MatchDetailRoundSideSchema = z.object({
  /** Stable ids; null for no answer. */
  answer: AnswerSchema.nullable(),
  correct: z.boolean(),
  ms: z.number().int().nullable(),
  score: z.number().int(),
  damageTaken: z.number().int(),
  hpAfter: z.number().int(),
  armed: PowerupIdSchema.nullable(),
  quick: PowerupIdSchema.nullable(),
});

export const MatchDetailResponseSchema = z.object({
  id: MatchIdSchema,
  courseId: CourseIdSchema,
  mode: MatchModeSchema,
  rated: z.boolean(),
  status: z.enum(["finished", "void"]),
  settings: MatchSettingsSchema,
  winner: z.enum(["a", "b", "draw"]).nullable(),
  endReason: EndReasonSchema,
  pairCapped: z.boolean(),
  roundsPlayed: z.number().int(),
  startedAt: epochMs.nullable(),
  endedAt: epochMs,
  players: z.tuple([MatchDetailPlayerSchema, MatchDetailPlayerSchema]),
  /**
   * True when the viewer did not play in the match: `rounds` is then empty,
   * because round detail carries every question's key.
   */
  roundsHidden: z.boolean().optional(),
  rounds: z.array(
    z.object({
      round: z.number().int(),
      multiplier: z.number(),
      /** The question with its key: the match is over. */
      question: QuestionPublicSchema.extend({ key: AnswerSchema, why: z.string() }),
      a: MatchDetailRoundSideSchema,
      b: MatchDetailRoundSideSchema,
    }),
  ),
});

export const UserProfileQuerySchema = z.object({ course: CourseIdSchema.optional() });

export const LectureAccuracySchema = z.object({
  lectureId: LectureIdSchema,
  title: z.string(),
  answers: z.number().int(),
  correct: z.number().int(),
});

export const UserProfileResponseSchema = z.object({
  user: PublicUserSchema,
  isSelf: z.boolean(),
  courses: z.array(
    z.object({
      courseId: CourseIdSchema,
      ranked: RankedStatsSchema,
      bot: BotStatsSchema,
      /** Unrated private matches. */
      casual: z.object({ played: z.number().int(), won: z.number().int(), lost: z.number().int(), drawn: z.number().int() }),
      accuracy: z.array(LectureAccuracySchema),
    }),
  ),
  /** Viewer's record against this user, over all courses; null on your own profile. */
  headToHead: z.object({ wins: z.number().int(), losses: z.number().int(), draws: z.number().int() }).nullable(),
});

export const UserMatchesQuerySchema = z.object({
  course: CourseIdSchema.optional(),
  /** Cursor: only matches that ended before this. */
  before: epochMsQuery.optional(),
});
export const UserMatchesResponseSchema = z.object({
  items: z.array(MatchSummarySchema).max(LIMITS.matchHistoryPage),
  /** Pass as `before` for the next page; null at the end. */
  nextBefore: epochMs.nullable(),
});

// ---------------------------------------------------------------------------
// Leaderboards
// ---------------------------------------------------------------------------

export const LeaderboardRowSchema = z.object({
  rank: z.number().int().min(1),
  user: PublicUserSchema,
  rating: z.number(),
  played: z.number().int(),
  won: z.number().int(),
});

export const LeaderboardResponseSchema = z.object({
  courseId: CourseIdSchema,
  /** Players past their provisional games (RD below GLICKO.provisionalRd). */
  established: z.array(LeaderboardRowSchema),
  /** "Still provisional", ranked separately. */
  provisional: z.array(LeaderboardRowSchema),
});

// ---------------------------------------------------------------------------
// Missed questions (only ever the caller's own rows)
// ---------------------------------------------------------------------------

export const MissedStatusSchema = z.enum(["open", "learned"]);
export type MissedStatus = z.infer<typeof MissedStatusSchema>;

export const MissedListQuerySchema = z.object({
  course: CourseIdSchema,
  lecture: LectureIdSchema.optional(),
  status: MissedStatusSchema.default("open"),
  /** Cursor on last_missed_at. */
  before: epochMsQuery.optional(),
});

export const MissedListItemSchema = z.object({
  questionId: QuestionIdSchema,
  lectureId: LectureIdSchema,
  lectureTitle: z.string(),
  /** First QUESTIONS.missedPreviewChars characters of the prompt or statement. */
  preview: z.string(),
  type: QuestionTypeSchema,
  timesMissed: z.number().int(),
  lastMissedAt: epochMs,
});

export const MissedListResponseSchema = z.object({
  /** Total rows matching the filter (not just this page). */
  count: z.number().int(),
  items: z.array(MissedListItemSchema),
  nextBefore: epochMs.nullable(),
});

export const MissedQuestionResponseSchema = z.object({
  question: QuestionPublicSchema,
  status: MissedStatusSchema,
  timesMissed: z.number().int(),
  lastMissedAt: epochMs,
  retries: z.number().int(),
});

export const MissedAnswerResponseSchema = AnswerExplanationSchema.extend({
  /** Your last answer in a match (stable ids); null for a timeout. */
  lastAnswer: AnswerSchema.nullable(),
});

export const MissedRetryBodySchema = z.object({ answer: AnswerSchema });
export const MissedRetryResponseSchema = AnswerExplanationSchema.extend({
  correct: z.boolean(),
  /** learned when the retry was correct. */
  status: MissedStatusSchema,
});

export const MissedStatusBodySchema = z.object({ status: MissedStatusSchema });
export const MissedStatusResponseSchema = z.object({ status: MissedStatusSchema });

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const ReportReasonSchema = z.enum(["wrong_answer", "ambiguous", "typo", "other"]);
export const ReportBodySchema = z.object({
  reason: ReportReasonSchema,
  note: z.string().trim().max(LIMITS.reportNoteMax).optional(),
  matchId: MatchIdSchema.optional(),
});

// ---------------------------------------------------------------------------
// Test mode (TEST_MODE=1 and localhost only)
// ---------------------------------------------------------------------------

export const TestSeedResponseSchema = z.object({
  ok: z.literal(true),
  users: z.array(z.object({ id: z.string(), username: z.string() })),
  questions: z.number().int(),
});

// ---------------------------------------------------------------------------
// Endpoint table
// ---------------------------------------------------------------------------

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface EndpointDef {
  method: Method;
  /** Hono-style path with :params. */
  path: string;
  /** False for endpoints that work signed out. */
  auth: boolean;
  query?: z.ZodType;
  body?: z.ZodType;
  /** Null for non-JSON responses (images, WebSocket upgrades). */
  response: z.ZodType | null;
}

function endpoint<const E extends EndpointDef>(e: E): E {
  return e;
}

/** Every route under /api except Better Auth's own /api/auth/*. */
export const endpoints = {
  health: endpoint({ method: "GET", path: "/api/health", auth: false, response: HealthResponseSchema }),
  config: endpoint({ method: "GET", path: "/api/config", auth: false, response: ConfigResponseSchema }),

  me: endpoint({ method: "GET", path: "/api/me", auth: true, response: MeResponseSchema }),
  patchMe: endpoint({ method: "PATCH", path: "/api/me", auth: true, body: PatchMeBodySchema, response: PatchMeResponseSchema }),
  putAvatar: endpoint({ method: "PUT", path: "/api/me/avatar", auth: true, response: AvatarResponseSchema }),
  deleteAvatar: endpoint({ method: "DELETE", path: "/api/me/avatar", auth: true, response: AvatarResponseSchema }),
  putPrefs: endpoint({ method: "PUT", path: "/api/me/prefs", auth: true, body: PutPrefsBodySchema, response: PrefsResponseSchema }),
  avatar: endpoint({ method: "GET", path: "/api/avatars/:key", auth: false, response: null }),

  courses: endpoint({ method: "GET", path: "/api/courses", auth: true, response: CoursesResponseSchema }),
  home: endpoint({ method: "GET", path: "/api/home", auth: true, query: CourseQuerySchema, response: HomeResponseSchema }),
  bots: endpoint({ method: "GET", path: "/api/bots", auth: true, query: CourseQuerySchema, response: BotsResponseSchema }),

  createBotMatch: endpoint({ method: "POST", path: "/api/bot-matches", auth: true, body: CreateBotMatchBodySchema, response: CreateBotMatchResponseSchema }),
  createLobby: endpoint({ method: "POST", path: "/api/lobbies", auth: true, body: CreateLobbyBodySchema, response: CreateLobbyResponseSchema }),
  joinLobby: endpoint({ method: "POST", path: "/api/lobbies/join", auth: true, body: JoinLobbyBodySchema, response: JoinLobbyResponseSchema }),

  matchSocket: endpoint({ method: "GET", path: "/api/matches/:id/ws", auth: true, response: null }),
  queueSocket: endpoint({ method: "GET", path: "/api/queue/ws", auth: true, query: QueueWsQuerySchema, response: null }),

  match: endpoint({ method: "GET", path: "/api/matches/:id", auth: true, response: MatchDetailResponseSchema }),
  user: endpoint({ method: "GET", path: "/api/users/:username", auth: true, query: UserProfileQuerySchema, response: UserProfileResponseSchema }),
  userMatches: endpoint({ method: "GET", path: "/api/users/:username/matches", auth: true, query: UserMatchesQuerySchema, response: UserMatchesResponseSchema }),
  leaderboard: endpoint({ method: "GET", path: "/api/leaderboards/:course", auth: true, response: LeaderboardResponseSchema }),

  missedList: endpoint({ method: "GET", path: "/api/missed", auth: true, query: MissedListQuerySchema, response: MissedListResponseSchema }),
  missedQuestion: endpoint({ method: "GET", path: "/api/missed/:questionId", auth: true, response: MissedQuestionResponseSchema }),
  missedAnswer: endpoint({ method: "GET", path: "/api/missed/:questionId/answer", auth: true, response: MissedAnswerResponseSchema }),
  missedRetry: endpoint({ method: "POST", path: "/api/missed/:questionId/retry", auth: true, body: MissedRetryBodySchema, response: MissedRetryResponseSchema }),
  missedStatus: endpoint({ method: "POST", path: "/api/missed/:questionId/status", auth: true, body: MissedStatusBodySchema, response: MissedStatusResponseSchema }),

  report: endpoint({ method: "POST", path: "/api/questions/:id/report", auth: true, body: ReportBodySchema, response: OkSchema }),

  testSeed: endpoint({ method: "POST", path: "/api/test/seed", auth: false, response: TestSeedResponseSchema }),
  testReset: endpoint({ method: "POST", path: "/api/test/reset", auth: false, response: OkSchema }),
} as const;

export type Endpoints = typeof endpoints;
export type EndpointName = keyof Endpoints;

type InferOr<T, Fallback> = T extends z.ZodType ? z.infer<T> : Fallback;
/** Parsed query type of an endpoint (never when it takes none). */
export type EndpointQuery<N extends EndpointName> = InferOr<Endpoints[N] extends { query: infer Q } ? Q : undefined, never>;
/** Body type of an endpoint (never when it takes no JSON body). */
export type EndpointBody<N extends EndpointName> = InferOr<Endpoints[N] extends { body: infer B } ? B : undefined, never>;
/** Response type of an endpoint (never for non-JSON responses). */
export type EndpointResponse<N extends EndpointName> = InferOr<Endpoints[N]["response"], never>;

export type HealthResponse = EndpointResponse<"health">;
export type ConfigResponse = EndpointResponse<"config">;
export type MeResponse = EndpointResponse<"me">;
export type CoursesResponse = EndpointResponse<"courses">;
export type HomeResponse = EndpointResponse<"home">;
export type BotsResponse = EndpointResponse<"bots">;
export type MatchDetailResponse = EndpointResponse<"match">;
export type UserProfileResponse = EndpointResponse<"user">;
export type UserMatchesResponse = EndpointResponse<"userMatches">;
export type LeaderboardResponse = EndpointResponse<"leaderboard">;
export type MissedListResponse = EndpointResponse<"missedList">;
export type MissedQuestionResponse = EndpointResponse<"missedQuestion">;
export type MissedAnswerResponse = EndpointResponse<"missedAnswer">;
export type MissedRetryResponse = EndpointResponse<"missedRetry">;

/** Re-exported so API code can import every schema it needs from one file. */
export { AnswerSchema, IdSchema };
