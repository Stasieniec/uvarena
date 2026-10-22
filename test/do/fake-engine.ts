// A scripted stand-in for the game engine, so the MatchRoom shell (sockets,
// alarms, effects, D1) can be tested before the engine package is merged.
// It follows the engine contract for the parts the shell depends on: lobby,
// ready, connect and disconnect, no-show, lobby expiry, forfeit and void,
// surrender, rematch, cancel and cleanup. Rounds are bare arming windows with
// no questions. Finalization uses the real planFinalization.
//
// Installed through the TEST_MODE-only seams in match-room.ts and
// match-factory.ts. Tests that need the real engine call removeFakes().
import { planFinalization } from "@shared/game/finalize";
import { BOT_LADDER, ECHO, MATCH, TIMING, scaleMs } from "@shared/game/config";
import type {
  BotInit,
  EngineEvent,
  MatchInit,
  MatchState,
  Outbound,
  PlayerInit,
  PlayerState,
  Rng,
  Side,
  StepResult,
} from "@shared/game/types";
import type { MatchEndMessage, PlayerView, SnapshotMessage } from "@shared/protocol";
import { FACTORY_TEST_DEPS_KEY, type FactoryDeps } from "../../src/worker/match-factory";
import { ROOM_TEST_ENGINE_KEY, type RoomEngine } from "../../src/worker/do/match-room";

const IN_PLAY = new Set(["intro", "arming", "banner", "question", "reveal"]);

function roundState(): PlayerState["r"] {
  return { armed: null, effective: null, nemesisAgainst: false, quick: null, answer: null, answeredAt: null, hidden: [] };
}

function human(p: PlayerInit, ready: boolean, powerups: boolean): PlayerState {
  return {
    kind: "human",
    userId: p.userId,
    name: p.name,
    avatarUrl: p.avatarUrl,
    hp: MATCH.startHp,
    loadout: powerups ? p.loadout : [],
    used: [],
    phoenixUsed: false,
    connected: false,
    everConnected: false,
    disconnectedSince: null,
    ready,
    botRating: p.botRating ?? 1500,
    botRatingN: p.botRatingN,
    rankedBefore: p.ranked,
    bot: null,
    r: roundState(),
  };
}

function botPlayer(b: BotInit): PlayerState {
  return {
    kind: "bot",
    userId: null,
    name: b.name,
    avatarUrl: null,
    hp: MATCH.startHp,
    loadout: [],
    used: [],
    phoenixUsed: false,
    connected: true,
    everConnected: true,
    disconnectedSince: null,
    ready: true,
    botRating: b.strength,
    botRatingN: 0,
    rankedBefore: null,
    bot: {
      level: b.level,
      strength: b.strength,
      speed: 1,
      zeusRound: null,
      nemesisRound: null,
      aegisRound: null,
      q: null,
    },
    r: roundState(),
  };
}

function other(side: Side): Side {
  return side === 0 ? 1 : 0;
}

function humansReady(s: MatchState): boolean {
  return s.players.every((p) => p !== null && (p.kind === "bot" || (p.connected && p.ready)));
}

function playerView(p: PlayerState): PlayerView {
  return {
    kind: p.kind,
    userId: p.userId,
    name: p.name,
    avatarUrl: p.avatarUrl,
    botLevel: p.bot?.level ?? null,
    hp: p.hp,
    loadout: p.loadout,
    used: p.used,
    phoenixUsed: p.phoenixUsed,
    connected: p.connected,
    ready: p.ready,
    rating: null,
  };
}

function forfeitAt(s: MatchState, p: PlayerState | null): number | null {
  if (!p || p.kind !== "human" || p.disconnectedSince === null || !IN_PLAY.has(s.phase)) return null;
  return p.disconnectedSince + MATCH.forfeitMs;
}

export function fakeMatchEnd(s: MatchState, side: Side, now: number): MatchEndMessage {
  const r = s.result!;
  const summary = s.endSummaries?.[side] ?? null;
  const me = s.players[side]!;
  const opp = s.players[other(side)];
  const result =
    s.phase === "cancelled"
      ? "cancelled"
      : r.reason === "void"
        ? "void"
        : r.winner === "draw"
          ? "draw"
          : r.winner === side
            ? "win"
            : "loss";
  return {
    type: "match_end",
    serverNow: now,
    result,
    reason: r.reason,
    hp: { you: me.hp, opponent: opp?.hp ?? 0 },
    rounds: s.rounds.length,
    ranked: summary?.ranked ?? null,
    bot: summary?.bot ?? null,
    pairCapped: summary?.pairCapped ?? false,
    summary: { correct: 0, answered: 0, fastestMs: null, biggestHit: 0, powerupsUsed: [] },
    missedCount: summary?.missedCount ?? 0,
    rematchUntil: s.rematchUntil,
  };
}

function fakeView(s: MatchState, side: Side, now: number): SnapshotMessage {
  const me = s.players[side]!;
  const opp = s.players[other(side)];
  const over = s.phase === "finished" || s.phase === "cancelled";
  const { type: _t, serverNow: _n, ...result } = over ? fakeMatchEnd(s, side, now) : ({} as MatchEndMessage);
  return {
    type: "snapshot",
    serverNow: now,
    matchId: s.matchId,
    courseId: s.courseId,
    mode: s.mode,
    rated: s.rated,
    settings: s.settings,
    phase: s.phase,
    phaseEndsAt: s.phaseEndsAt,
    round: s.round,
    suddenDeath: s.suddenDeath,
    multiplier: 1,
    you: playerView(me),
    opponent: opp ? playerView(opp) : null,
    joinCode: s.joinCode,
    armable: [],
    armed: null,
    banner: null,
    question: null,
    hidden: [],
    quickUsed: null,
    yourAnswer: null,
    opponentAnswered: false,
    countdownEnd: null,
    yourDeadline: null,
    lastReveal: null,
    result: over ? result : null,
    rematch: null,
    opponentForfeitAt: forfeitAt(s, opp),
  };
}

function lobbyMsgs(s: MatchState, now: number): Outbound[] {
  const players = s.players.filter((p): p is PlayerState => p !== null).map((p) => ({ name: p.name, avatarUrl: p.avatarUrl, ready: p.ready }));
  return ([0, 1] as Side[]).map((to) => ({
    to,
    msg: { type: "lobby", serverNow: now, code: s.joinCode, players, rated: s.rated, settings: s.settings },
  }));
}

function finish(s: MatchState, winner: Side | "draw" | null, reason: "surrender" | "abandon" | "void", now: number): StepResult {
  s.phase = "finished";
  s.phaseEndsAt = null;
  s.result = { winner, reason, endedAt: now };
  s.rematchUntil = s.mode === "ranked" ? null : now + MATCH.rematchMs;
  s.cleanupAt = now + MATCH.cleanupMs;
  return { state: s, out: [], effects: [{ kind: "finalize" }] };
}

function cancel(s: MatchState, reason: "no_show" | "expired" | "cancelled", now: number): StepResult {
  s.phase = "cancelled";
  s.phaseEndsAt = null;
  s.result = { winner: null, reason, endedAt: now };
  s.cleanupAt = now + MATCH.cleanupMs;
  return { state: s, out: [], effects: [{ kind: "cancelled", reason }] };
}

function error(s: MatchState, side: Side, now: number): StepResult {
  return { state: s, out: [{ to: side, msg: { type: "error", serverNow: now, code: "wrong_phase", message: "Not now." } }], effects: [] };
}

function tick(s: MatchState, now: number): StepResult {
  const out: Outbound[] = [];
  const effects: StepResult["effects"] = [];
  if (s.phase === "lobby") {
    if (!s.players[1] && s.lobbyExpiresAt !== null && now >= s.lobbyExpiresAt) return cancel(s, "expired", now);
    const missing = s.players.some((p) => p?.kind === "human" && !p.everConnected);
    if (missing && s.noShowAt !== null && now >= s.noShowAt) return cancel(s, "no_show", now);
  }
  if (IN_PLAY.has(s.phase)) {
    const gone = ([0, 1] as Side[]).filter((i) => {
      const at = forfeitAt(s, s.players[i]);
      return at !== null && now >= at;
    });
    if (gone.length === 2) return finish(s, null, "void", now);
    if (gone.length === 1) return finish(s, other(gone[0]!), "abandon", now);
    while (s.phaseEndsAt !== null && now >= s.phaseEndsAt) {
      s.phase = "arming";
      s.round += 1;
      s.phaseEndsAt += scaleMs(TIMING.armingMs, s.timeScale);
      for (const to of [0, 1] as Side[]) {
        out.push({ to, msg: { type: "arming", serverNow: now, round: s.round, multiplier: 1, phaseEndsAt: s.phaseEndsAt, armable: [] } });
      }
    }
  }
  if (s.phase === "finished" && s.rematchUntil !== null && now >= s.rematchUntil) s.rematchUntil = null;
  return { state: s, out, effects };
}

function maybeStart(s: MatchState, now: number, res: StepResult): void {
  if (s.phase !== "lobby" || !humansReady(s)) return;
  s.phase = "intro";
  s.phaseEndsAt = now + scaleMs(TIMING.introMs, s.timeScale);
  s.startedAt = now;
  s.noShowAt = null;
  res.effects.push({ kind: "started" });
  for (const to of [0, 1] as Side[]) {
    const me = s.players[to]!;
    res.out.push({
      to,
      msg: {
        type: "intro",
        serverNow: now,
        phaseEndsAt: s.phaseEndsAt,
        you: playerView(me),
        opponent: playerView(s.players[other(to)]!),
        mode: s.mode,
        rated: s.rated,
      },
    });
  }
}

export const fakeEngine: RoomEngine = {
  initState(init: MatchInit, now: number): StepResult {
    const lobby = init.mode === "private" && init.humans.length === 1;
    const autoReady = init.mode !== "private";
    const humans = init.humans.map((p) => human(p, autoReady, init.settings.powerups));
    const second = init.bot ? botPlayer(init.bot) : (humans[1] ?? null);
    const state: MatchState = {
      v: 1,
      matchId: init.matchId,
      courseId: init.courseId,
      mode: init.mode,
      rated: init.rated,
      settings: init.settings,
      joinCode: init.joinCode,
      timeScale: init.timeScale,
      phase: "lobby",
      phaseEndsAt: null,
      round: 0,
      suddenDeath: 0,
      players: [humans[0]!, second],
      questions: init.questions,
      qIndex: 0,
      q: null,
      rounds: [],
      rng: init.seed,
      createdAt: init.createdAt,
      startedAt: null,
      noShowAt: lobby || init.mode === "bot" ? null : now + MATCH.noShowMs,
      lobbyExpiresAt: lobby ? now + MATCH.lobbyTtlMs : null,
      result: null,
      rematch: [false, false],
      rematchUntil: null,
      rematchMatchId: null,
      cleanupAt: null,
      finalized: false,
      endSummaries: null,
    };
    return { state, out: [], effects: [] };
  },

  step(prev: MatchState, event: EngineEvent, now: number): StepResult {
    const s = structuredClone(prev);
    const res: StepResult = { state: s, out: [], effects: [] };
    switch (event.type) {
      case "connect": {
        const p = s.players[event.side]!;
        p.connected = true;
        p.everConnected = true;
        p.disconnectedSince = null;
        res.out.push({ to: event.side, msg: fakeView(s, event.side, now) });
        res.out.push({ to: other(event.side), msg: { type: "opponent_connection", serverNow: now, connected: true, forfeitAt: null } });
        maybeStart(s, now, res);
        return res;
      }
      case "disconnect": {
        const p = s.players[event.side]!;
        p.connected = false;
        p.disconnectedSince = now;
        res.out.push({
          to: other(event.side),
          msg: { type: "opponent_connection", serverNow: now, connected: false, forfeitAt: forfeitAt(s, p) },
        });
        return res;
      }
      case "ready": {
        if (s.phase !== "lobby") return error(prev, event.side, now);
        s.players[event.side]!.ready = true;
        res.out.push(...lobbyMsgs(s, now));
        maybeStart(s, now, res);
        return res;
      }
      case "join": {
        if (s.phase !== "lobby" || s.players[1]) return { state: prev, out: [], effects: [] };
        s.players[1] = human(event.player, false, s.settings.powerups);
        s.questions = event.questions;
        s.noShowAt = now + MATCH.noShowMs;
        res.out.push(...lobbyMsgs(s, now));
        return res;
      }
      case "surrender":
        if (!IN_PLAY.has(s.phase)) return error(prev, event.side, now);
        return finish(s, other(event.side), "surrender", now);
      case "rematch": {
        if (s.phase !== "finished" || s.rematchUntil === null || now > s.rematchUntil) return error(prev, event.side, now);
        s.rematch[event.side] = true;
        const opp = other(event.side);
        if (s.players[opp]?.kind === "bot") s.rematch[opp] = true;
        if (s.rematch[0] && s.rematch[1]) res.effects.push({ kind: "rematch" });
        else res.out.push({ to: opp, msg: { type: "rematch", serverNow: now, state: "offered", by: "opponent", matchId: null } });
        return res;
      }
      case "cancel":
        // Like the real engine: only a match still in its lobby can be cancelled.
        if (s.phase !== "lobby") return { state: prev, out: [], effects: [] };
        return cancel(s, event.reason, now);
      case "tick":
        return tick(s, now);
      default:
        return error(prev, event.side, now);
    }
  },

  nextDeadline(s: MatchState): number | null {
    const times: number[] = [];
    if (s.phase === "lobby") {
      if (!s.players[1] && s.lobbyExpiresAt !== null) times.push(s.lobbyExpiresAt);
      if (s.noShowAt !== null && s.players.some((p) => p?.kind === "human" && !p.everConnected)) times.push(s.noShowAt);
    }
    if (IN_PLAY.has(s.phase)) {
      if (s.phaseEndsAt !== null) times.push(s.phaseEndsAt);
      for (const p of s.players) {
        const at = forfeitAt(s, p);
        if (at !== null) times.push(at);
      }
    }
    if (s.phase === "finished" && s.rematchUntil !== null) times.push(s.rematchUntil);
    if (s.cleanupAt !== null) times.push(s.cleanupAt);
    return times.length > 0 ? Math.min(...times) : null;
  },

  sideOf(s: MatchState, userId: string): Side | null {
    if (s.players[0].userId === userId) return 0;
    if (s.players[1]?.userId === userId) return 1;
    return null;
  },

  view: fakeView,
  matchEnd: fakeMatchEnd,
  planFinalization,
};

// ---------------------------------------------------------------------------
// Factory stand-ins
// ---------------------------------------------------------------------------

function fakeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    normal: () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next()),
    pick: (items) => items[Math.floor(next() * items.length)]!,
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    state: () => a,
  };
  return rng;
}

export const fakeFactoryDeps: FactoryDeps = {
  createRng: fakeRng,
  selectQuestions: (candidates, opts) =>
    [...candidates]
      .sort((x, y) => Math.abs(x.rating - opts.target) - Math.abs(y.rating - opts.target) || x.id.localeCompare(y.id))
      .slice(0, opts.count),
  selectionTarget: (input) => {
    const values = input.playerBotRatings.map((r) => r ?? 1500);
    if (input.botStrength !== null) values.push(input.botStrength);
    return values.reduce((a, b) => a + b, 0) / values.length - 150;
  },
  botInit: (level, playerBotRating): BotInit => {
    if (level === ECHO.level) return { level, name: ECHO.name, strength: (playerBotRating ?? 1500) + ECHO.ratingOffset };
    const ladder = BOT_LADDER.find((b) => b.level === level);
    return { level, name: ladder?.name ?? `Bot ${level}`, strength: ladder?.rating ?? 1500 };
  },
};

export function installFakes(): void {
  const g = globalThis as Record<string, unknown>;
  g[ROOM_TEST_ENGINE_KEY] = fakeEngine;
  g[FACTORY_TEST_DEPS_KEY] = fakeFactoryDeps;
}

export function removeFakes(): void {
  const g = globalThis as Record<string, unknown>;
  delete g[ROOM_TEST_ENGINE_KEY];
  delete g[FACTORY_TEST_DEPS_KEY];
}
