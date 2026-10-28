// Every tunable number in the game, in one file. A rule change in design.md
// should be a one-line edit here. Nothing in this file reads the clock or
// randomness, and nothing outside it should hard-code these values.
//
// Units: all durations are milliseconds unless the name says otherwise.

import type { BotLevel, PowerupId, QuestionType } from "./types";

// ---------------------------------------------------------------------------
// Match flow and timers
// ---------------------------------------------------------------------------

export const TIMING = {
  /** Match intro: both players, loadouts and ratings on screen. */
  introMs: 4000,
  /** Arming window before each question, for the blind power-ups. */
  armingMs: 3000,
  /** Arming window when power-ups are off (just the "Round N" card). */
  armingMsNoPowerups: 2000,
  /** Power-up banner phase. Skipped when nobody armed anything. */
  bannerMs: 1500,
  /** Reveal phase after each question. */
  revealMs: 5000,
  /** Countdown the second player gets once the first one answers. */
  countdownMs: 10000,
  /** Countdown when the first answerer used Gotta Go Fast this round. */
  fastCountdownMs: 5000,
  /**
   * Answers arriving up to this long after a deadline are still accepted, to
   * absorb network latency and alarm jitter. Not scaled in test mode.
   */
  graceMs: 400,
} as const;

/** Question timer by type, before the reading bonus. */
export const TIMER_MS_BY_TYPE: Record<QuestionType, number> = {
  truefalse: 15000,
  single: 20000,
  cloze: 20000,
  multi: 30000,
  order: 30000,
  match: 30000,
};

/**
 * Reading bonus for long questions: +msPerStep for every started wordsPerStep
 * words above freeWords, capped at maxMs. An item's own `time` overrides the
 * whole timer (type timer and bonus).
 */
export const READING_BONUS = {
  freeWords: 40,
  wordsPerStep: 15,
  msPerStep: 1000,
  maxMs: 10000,
} as const;

/** Match length and lifecycle deadlines. */
export const MATCH = {
  /** Both players start with this much HP. */
  startHp: 6000,
  /** Rounds before the match is decided on HP. */
  maxRounds: 20,
  /** Extra rounds at equal HP after maxRounds; a draw after this many. */
  suddenDeathMax: 5,
  /** Questions selected per match (maxRounds + suddenDeathMax). */
  questionsPerMatch: 25,
  /** Continuous disconnect after which a player abandons (loses). */
  forfeitMs: 45000,
  /** Ranked and private: a human who never connected by then cancels the match. */
  noShowMs: 30000,
  /** A private lobby nobody joins expires after this long. */
  lobbyTtlMs: 15 * 60 * 1000,
  /**
   * Once the second player joins, the lobby lives at least this much longer,
   * so a join near the end of lobbyTtlMs still leaves time to ready up.
   */
  lobbyReadyMs: 5 * 60 * 1000,
  /** Window after the match in which both players can accept a rematch. */
  rematchMs: 20000,
  /** The MatchRoom deletes its storage this long after the match ends. */
  cleanupMs: 10 * 60 * 1000,
  /**
   * A `matches` row still marked running whose MatchRoom has no state is only
   * treated as dead (and closed) once it is this old: the factory initialises
   * the room right after inserting the row.
   */
  roomInitGraceMs: 60 * 1000,
} as const;

// ---------------------------------------------------------------------------
// Score, multiplier, damage
// ---------------------------------------------------------------------------

export const SCORING = {
  /** Score for an instant correct answer. Falls linearly to half at the buzzer. */
  maxScore: 1000,
  /**
   * Multiplier schedule: x1 up to and including flatRounds, then +stepPerRound
   * per round, frozen after capRound (sudden death keeps the round-20 value).
   * multiplier(r) = r <= 4 ? 1 : 1 + 0.5 * (min(r, 20) - 4)
   */
  multiplierFlatRounds: 4,
  multiplierStepPerRound: 0.5,
  multiplierCapRound: 20,
  /** Most damage one round can deal. */
  roundCap: 3000,
  /** Cap in a round where the attacker's Bibi is active. */
  bibiRoundCap: 4500,
  /** Bibi multiplies the attacker's raw damage by this. */
  bibiFactor: 2,
  /** Shield multiplies damage taken (after the cap) by this. */
  shieldFactor: 0.5,
} as const;

// ---------------------------------------------------------------------------
// Power-ups
// ---------------------------------------------------------------------------

export const POWERUPS = {
  /** Power-ups a player picks before a match. Distinct. */
  loadoutSize: 3,
  /** Loadout for new players (user_prefs default). */
  defaultLoadout: ["bibi", "shield", "fifty"] as readonly PowerupId[],
  /** Armed in the arming window, before the question is shown. */
  blind: ["bibi", "shield"] as readonly PowerupId[],
  /** Used during the question, before answering. */
  quick: ["fifty", "fast"] as readonly PowerupId[],
  /** Power-ups per player per round. */
  maxPerRound: 1,
  fifty: {
    /** Question types 50:50 may be used on. */
    eligibleTypes: ["single", "cloze", "multi"] as readonly QuestionType[],
    /** single and cloze: wrong options left visible (key plus this many). */
    singleWrongKept: 1,
    /** multi: wrong options hidden. */
    multiWrongHidden: 1,
  },
} as const;

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export const QUESTIONS = {
  /** Types the first release can render. The selector skips the others. */
  uiTypes: ["single", "multi", "truefalse", "cloze"] as readonly QuestionType[],
  /** Starting item rating by authored difficulty. */
  startRating: { easy: 1300, medium: 1500, hard: 1700 },
  /** Opaque per-match option id length (per side, per question). */
  opaqueIdLength: 6,
  /** Bank question ids: `<course>-<6 chars>` from this alphabet. */
  idAlphabet: "23456789abcdefghjkmnpqrstuvwxyz",
  idLength: 6,
  /** The in-match reveal line: first sentence of `why`, at most this many words. */
  whyShortMaxWords: 25,
  /** Character preview of a question in the missed list. */
  missedPreviewChars: 140,
} as const;

/** Question selection (select.ts). */
export const SELECTION = {
  /** Target item rating = mean of the relevant ratings plus this offset. */
  targetOffset: -150,
  /** A player with no bot rating yet counts as this. */
  defaultRating: 1500,
  /** A question either player answered within this many days counts as seen. */
  freshWindowDays: 7,
  /** Sampling weight exp(-((rating - target) / weightWidth)^2). */
  weightWidth: 250,
} as const;

// ---------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------

/** Ranked rating, Glicko-2 (glicko2.ts). One game is one rating period. */
export const GLICKO = {
  startRating: 1500,
  startRd: 350,
  startVol: 0.06,
  /** System constant tau. */
  tau: 0.5,
  /** Convergence tolerance for the volatility iteration (Illinois method). */
  epsilon: 1e-6,
  /** Glicko-2 scale factor between the Glicko and Glicko-2 scales. */
  scale: 173.7178,
  rdMin: 45,
  rdMax: 350,
  ratingFloor: 400,
  /** Largest rating change from one game, either direction. */
  maxChangePerGame: 700,
  /** Provisional (shown with "?") while RD is at least this. */
  provisionalRd: 110,
  /** Scores. Surrender and abandon count as losses. */
  scoreWin: 1,
  scoreDraw: 0.5,
  scoreLoss: 0,
} as const;

/** Rated games between the same two users per calendar day that move ratings. */
export const PAIR_CAP = {
  perDay: 5,
  timeZone: "Europe/Amsterdam",
} as const;

/** Per-answer bot rating and item ratings (elo.ts). */
export const ELO = {
  startBotRating: 1500,
  /** Player K: max(min, base / (1 + decay * n)). */
  playerK: { min: 24, base: 174, decay: 0.05 },
  /** Item K: max(min, base / (1 + decay * m)). */
  itemK: { min: 8, base: 174, decay: 0.05 },
  /** n is reduced by 1 per this many full idle days. */
  idleDaysPerNStep: 3,
  /** Bot rating shows "?" while the player has fewer rated bot answers than this. */
  botProvisionalAnswers: 30,
  /** A player needs this many answers in the course before they move item ratings. */
  itemMinPlayerAnswers: 10,
  /** An answer moves the item only if the player did not answer it in this many previous days. */
  itemRepeatWindowDays: 30,
} as const;

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

export interface BotLadderEntry {
  level: BotLevel;
  name: string;
  /** Line under the name on the ladder (design.md). */
  line: string;
  /** Strength R on the item rating scale. */
  rating: number;
}

/** Ladder level L has R = ladderBase + ladderStep * (L - 1). */
export const BOT_STRENGTH = { ladderBase: 1050, ladderStep: 150 } as const;

/** The eight ladder bots, weakest first. Each is unlocked by beating the one before. */
export const BOT_LADDER: readonly BotLadderEntry[] = [
  { level: 1, name: "Skimmed the slides", line: "Recognises most of the words.", rating: 1050 },
  { level: 2, name: "Attended once", line: "Remembers the room, mostly.", rating: 1200 },
  { level: 3, name: "Has the notes open", line: "Searches faster than they read.", rating: 1350 },
  { level: 4, name: "Did the reading", line: "Most of it. The first half twice.", rating: 1500 },
  { level: 5, name: "Went to every tutorial", line: "Knows which questions come back.", rating: 1650 },
  { level: 6, name: "Made the flashcards", line: "Has seen this one before.", rating: 1800 },
  { level: 7, name: "Asks questions after class", line: "Already asked about your answer.", rating: 1950 },
  { level: 8, name: "Wrote the exam", line: "Knows why the wrong options are there.", rating: 2100 },
];

/** Echo plays at the player's own bot rating plus this offset. Level -1 in the database. */
export const ECHO = {
  level: -1 as BotLevel,
  name: "Echo",
  line: "Plays at your level.",
  ratingOffset: -75,
} as const;

/** Test-mode-only bots. Never offered outside test mode. */
export const TEST_BOTS = {
  dummy: { level: 0 as BotLevel, name: "Dummy", answerMs: 2000, alwaysCorrect: false },
  perfect: { level: 9 as BotLevel, name: "Perfect Bot", answerMs: 2000, alwaysCorrect: true },
} as const;

/** Bot answer model (bot.ts). See build-plan.md "Bot model". */
export const BOT_MODEL = {
  /** Base answer time when the bot knows the answer, by type. */
  baseMsByType: {
    truefalse: 6000,
    single: 8000,
    cloze: 8000,
    multi: 12000,
    order: 12000,
    match: 12000,
  } as Record<QuestionType, number>,
  /** Known-answer time factor: speedBase - speedSlope * (s - 1), s = speed level 1..8. */
  speedBase: 1.25,
  speedSlope: 0.07,
  /** Log-normal noise: exp(normal(0, sigma)). */
  timeSigma: 0.35,
  /** Reading time added per word. */
  msPerWord: 25,
  /** Fastest possible answer: floorBaseMs + floorMsPerWord * words. */
  floorBaseMs: 1500,
  floorMsPerWord: 25,
  /** Latest answer as a fraction of the timer. */
  maxTimerFraction: 0.95,
  /** When the bot does not know: answers at uniform(min, max) * timerMs. */
  unknownTimerFraction: { min: 0.6, max: 0.95 },
  /** When the human answered first and the bot's plan is after countdownEnd: chance it still guesses in time. */
  lateGuessProbability: 0.8,
} as const;

/** Bot power-up policy (bot.ts). */
export const BOT_POLICY = {
  /** Levels from this one up (and Echo, and test levels) play the smart policy; below it, random rounds. */
  smartFromLevel: 4,
  /** Smart: Bibi round drawn uniformly from this inclusive range at init. */
  bibiRounds: [5, 9] as const,
  /** Weak bots (levels 1 to 3): every blind power-up's round drawn from this range. */
  weakRounds: [1, 12] as const,
  /** Shield: armed in the first arming window after the bot's HP drops below this. */
  shieldBelowHp: 3000,
  /** When two blind power-ups fall in one round, the first in this list wins. */
  priority: ["bibi", "shield"] as readonly PowerupId[],
  /** 50:50: used at shownAt + this, when the bot does not know and the type is eligible. */
  fiftyAtMs: 1500,
  /** Gotta Go Fast: used at shownAt + this, when the bot knows and the round is at least fastFromRound. */
  fastAtMs: 500,
  fastFromRound: 3,
} as const;

// ---------------------------------------------------------------------------
// Matchmaking
// ---------------------------------------------------------------------------

export const MATCHMAKER = {
  /** Re-pair on an alarm this often while 2 or more players are queued. */
  tickMs: 2000,
  /** Allowed rating gap: baseWindow + widenBy * floor(waitedSec / widenEverySec). */
  baseWindow: 100,
  widenBy: 50,
  widenEverySec: 5,
  /** From this wait on, anyone in the queue is acceptable. */
  unlimitedAfterSec: 45,
  /** A provisional player (RD >= GLICKO.provisionalRd) starts with this window. */
  provisionalStartWindow: 350,
  /** The queue screen offers "Send a friend a link" / "Play a bot instead" after this. */
  nobodySearchingHintSec: 20,
  /** Durable Object location hint for the per-course matchmaker. */
  locationHint: "weur",
} as const;

// ---------------------------------------------------------------------------
// Network and client
// ---------------------------------------------------------------------------

export const NET = {
  /** Client sends the text frame "ping" this often; the DO auto-answers "pong". */
  pingIntervalMs: 20000,
  /** Clock offset = mean(serverNow - Date.now()) over this many recent messages. */
  clockOffsetSamples: 5,
  /** Reconnect backoff: start, doubling, capped, with jitter. */
  reconnectInitialMs: 500,
  reconnectMaxMs: 5000,
  /** WebSocket close reasons must stay under 123 UTF-8 bytes; keep them shorter. */
  closeReasonMaxBytes: 120,
  /** Largest client frame the DOs read; a bigger one closes the socket. Real frames are under 1 KB. */
  maxClientFrameBytes: 4096,
  /**
   * At most this many client frames per clientFrameWindowMs on one socket
   * ("ping" is answered by the runtime and not counted); more closes it.
   */
  clientFrameBurst: 20,
  clientFrameWindowMs: 1000,
} as const;

// ---------------------------------------------------------------------------
// Accounts, lobbies and limits
// ---------------------------------------------------------------------------

export const LIMITS = {
  usernameMin: 3,
  usernameMax: 20,
  /** Letters, digits, underscore and dot. */
  usernamePattern: /^[A-Za-z0-9_.]+$/,
  nameMin: 1,
  nameMax: 50,
  passwordMin: 8,
  /** BETTER_AUTH_SECRET length a deployed Worker requires (openssl rand -base64 32 gives 44). */
  authSecretMin: 32,
  /** Session lifetime, refreshed daily. */
  sessionDays: 60,
  /** Avatar upload: raw JPEG, PNG or WebP, at most this many bytes. */
  avatarMaxBytes: 512 * 1024,
  /** Private lobby join code: length and alphabet (no 0, O, 1, I). */
  joinCodeLength: 6,
  joinCodeAlphabet: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
  /** Question report note. */
  reportNoteMax: 500,
  /** Page sizes. */
  matchHistoryPage: 20,
  missedPage: 50,
  homeRecentMatches: 3,
} as const;

// ---------------------------------------------------------------------------
// Test mode
// ---------------------------------------------------------------------------

/**
 * Test mode (TEST_MODE=1 and a localhost request): every phase duration and
 * question timer is multiplied by timeScale, with a floor of minPhaseMs.
 * graceMs and bot answer times of the test bots are not scaled.
 */
export const TEST_MODE = {
  timeScale: 0.2,
  minPhaseMs: 1000,
  /** Password for the seeded test users alice and bob. */
  seedPassword: "testpass123",
  seedUsers: ["alice", "bob"] as readonly string[],
} as const;

/** Applies a match's time scale to a duration (1 in production). */
export function scaleMs(ms: number, timeScale: number): number {
  if (timeScale === 1) return ms;
  return Math.max(TEST_MODE.minPhaseMs, Math.round(ms * timeScale));
}
