// The match screen's state: one reducer over server messages plus a few local
// actions (optimistic taps and connection status). The server is
// authoritative: local actions only show what the player tapped until the
// server confirms or corrects it, and nothing here knows the answer before
// the reveal message arrives. Pure, no DOM.

import type {
  AnswerKey,
  BlindPowerupId,
  MatchMode,
  MatchSettings,
  Phase,
  PowerupId,
  QuickPowerupId,
} from "@shared/game/types";
import type {
  BannerItem,
  LobbyMessage,
  MatchEndPayload,
  MatchErrorCode,
  PlayerView,
  QuestionView,
  RematchState,
  RevealPayload,
  ServerMessage,
  SnapshotMessage,
} from "@shared/protocol";
import { inferQuestionType } from "./question-type";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  /** Closed with 4001: the same user connected from another tab or device. */
  | "replaced"
  | "not_authorised"
  | "not_found"
  /** Closed normally (1000) by the server. */
  | "closed";

export interface RevealFx {
  /** Increments on every reveal; components key their animations on it. */
  seq: number;
  /** True when the reveal arrived live (animate), false when rebuilt from a snapshot. */
  live: boolean;
  /** HP before this round's damage, for the delayed HP bar drop. */
  before: { you: number; opponent: number };
}

export interface BannerState {
  seq: number;
  round: number;
  items: BannerItem[];
  /** False when rebuilt from a snapshot (no sound). */
  live: boolean;
}

export interface QuickFx {
  seq: number;
  round: number;
  who: "you" | "opponent";
  powerup: QuickPowerupId;
}

export interface MatchUiState {
  status: ConnectionStatus;
  /** Whether any match message arrived yet. */
  loaded: boolean;
  matchId: string | null;
  courseId: string | null;
  mode: MatchMode | null;
  rated: boolean;
  settings: MatchSettings | null;
  phase: Phase | null;
  phaseEndsAt: number | null;
  /** serverNow of the message that started the phase; null after a snapshot. */
  phaseStartedAt: number | null;
  round: number;
  multiplier: number;
  suddenDeath: number;
  you: PlayerView | null;
  opponent: PlayerView | null;
  lobby: Omit<LobbyMessage, "type" | "serverNow"> | null;
  joinCode: string | null;
  /** Arming: unused blind power-ups. */
  armable: BlindPowerupId[];
  /** Arming: what the screen shows as armed (optimistic). */
  armed: BlindPowerupId | null;
  /** Arming: what the server last confirmed. */
  armedAcked: BlindPowerupId | null;
  banner: BannerState | null;
  question: QuestionView | null;
  /** Your Oracle hides (your opaque ids). */
  hidden: string[];
  /** Quick power-up the server confirmed this round. */
  quickUsed: QuickPowerupId | null;
  /** Quick power-up tapped and sent, not yet confirmed. */
  quickPending: QuickPowerupId | null;
  /** Your answer this round (optimistic until the reveal). */
  yourAnswer: AnswerKey | null;
  /** The server said the answer came too late. */
  answerRejected: boolean;
  opponentAnswered: boolean;
  /** End of the second answerer's countdown, once someone answered. */
  countdownEnd: number | null;
  /** Your last accepted moment (deadline, or the countdown end if the opponent answered first). */
  yourDeadline: number | null;
  reveal: RevealPayload | null;
  revealFx: RevealFx | null;
  quickFx: QuickFx | null;
  result: MatchEndPayload | null;
  rematch: RematchState | null;
  opponentForfeitAt: number | null;
  error: { seq: number; code: MatchErrorCode; message: string } | null;
}

export type MatchAction =
  | { type: "server"; msg: ServerMessage }
  | { type: "status"; status: ConnectionStatus }
  | { type: "local_arm"; round: number; powerup: BlindPowerupId | null }
  | { type: "local_use"; round: number; powerup: QuickPowerupId }
  | { type: "local_answer"; round: number; answer: AnswerKey }
  | { type: "local_rematch" }
  /** A new transport starts from scratch (StrictMode remounts, a new match). */
  | { type: "reset" };

export function initialMatchState(): MatchUiState {
  return {
    status: "idle",
    loaded: false,
    matchId: null,
    courseId: null,
    mode: null,
    rated: false,
    settings: null,
    phase: null,
    phaseEndsAt: null,
    phaseStartedAt: null,
    round: 0,
    multiplier: 1,
    suddenDeath: 0,
    you: null,
    opponent: null,
    lobby: null,
    joinCode: null,
    armable: [],
    armed: null,
    armedAcked: null,
    banner: null,
    question: null,
    hidden: [],
    quickUsed: null,
    quickPending: null,
    yourAnswer: null,
    answerRejected: false,
    opponentAnswered: false,
    countdownEnd: null,
    yourDeadline: null,
    reveal: null,
    revealFx: null,
    quickFx: null,
    result: null,
    rematch: null,
    opponentForfeitAt: null,
    error: null,
  };
}

function withUsed(p: PlayerView | null, powerup: PowerupId): PlayerView | null {
  if (!p || p.used.includes(powerup)) return p;
  return { ...p, used: [...p.used, powerup] };
}

/** Fields that reset at the start of every round. */
function roundReset(): Partial<MatchUiState> {
  return {
    armed: null,
    armedAcked: null,
    banner: null,
    question: null,
    hidden: [],
    quickUsed: null,
    quickPending: null,
    yourAnswer: null,
    answerRejected: false,
    opponentAnswered: false,
    countdownEnd: null,
    yourDeadline: null,
    reveal: null,
  };
}

function fromSnapshot(s: MatchUiState, m: SnapshotMessage): MatchUiState {
  const inReveal = m.phase === "reveal" && m.lastReveal !== null;
  return {
    ...s,
    loaded: true,
    matchId: m.matchId,
    courseId: m.courseId,
    mode: m.mode,
    rated: m.rated,
    settings: m.settings,
    phase: m.phase,
    phaseEndsAt: m.phaseEndsAt,
    phaseStartedAt: null,
    round: m.round,
    multiplier: m.multiplier,
    suddenDeath: m.suddenDeath,
    you: m.you,
    opponent: m.opponent,
    joinCode: m.joinCode,
    lobby:
      m.phase === "lobby"
        ? {
            code: m.joinCode,
            players: [m.you, ...(m.opponent ? [m.opponent] : [])].map((p) => ({
              name: p.name,
              avatarUrl: p.avatarUrl,
              ready: p.ready,
            })),
            rated: m.rated,
            settings: m.settings,
          }
        : s.lobby,
    armable: m.armable,
    armed: m.armed,
    armedAcked: m.armed,
    banner:
      m.phase === "banner" && m.banner
        ? { seq: (s.banner?.seq ?? 0) + 1, round: m.round, items: m.banner, live: false }
        : null,
    question: m.question,
    hidden: m.hidden,
    quickUsed: m.quickUsed,
    quickPending: null,
    yourAnswer: m.yourAnswer,
    answerRejected: false,
    opponentAnswered: m.opponentAnswered,
    countdownEnd: m.countdownEnd,
    yourDeadline: m.yourDeadline,
    reveal: inReveal ? m.lastReveal : null,
    revealFx: inReveal
      ? { seq: (s.revealFx?.seq ?? 0) + 1, live: false, before: { you: m.you.hp, opponent: m.opponent?.hp ?? 0 } }
      : s.revealFx,
    result: m.result,
    rematch: m.rematch,
    opponentForfeitAt: m.opponentForfeitAt,
  };
}

/** True for a message about an older round than the one on screen. */
function stale(s: MatchUiState, round: number): boolean {
  return round < s.round;
}

export function reduceServer(s: MatchUiState, m: ServerMessage): MatchUiState {
  switch (m.type) {
    case "snapshot":
      return fromSnapshot(s, m);

    case "lobby":
      return {
        ...s,
        loaded: true,
        phase: "lobby",
        joinCode: m.code,
        rated: m.rated,
        settings: m.settings,
        lobby: { code: m.code, players: m.players, rated: m.rated, settings: m.settings },
      };

    case "intro":
      return {
        ...s,
        loaded: true,
        phase: "intro",
        phaseEndsAt: m.phaseEndsAt,
        phaseStartedAt: m.serverNow,
        you: m.you,
        opponent: m.opponent,
        mode: m.mode,
        rated: m.rated,
        lobby: null,
      };

    case "arming":
      if (stale(s, m.round)) return s;
      return {
        ...s,
        ...roundReset(),
        loaded: true,
        phase: "arming",
        phaseEndsAt: m.phaseEndsAt,
        phaseStartedAt: m.serverNow,
        round: m.round,
        multiplier: m.multiplier,
        armable: m.armable,
      };

    case "armed_ack":
      if (m.round !== s.round) return s;
      return { ...s, armed: m.powerup, armedAcked: m.powerup };

    case "banner": {
      if (stale(s, m.round)) return s;
      let you = s.you;
      let opponent = s.opponent;
      for (const item of m.items) {
        if (item.who === "you") you = withUsed(you, item.powerup);
        else opponent = withUsed(opponent, item.powerup);
      }
      return {
        ...s,
        phase: "banner",
        phaseEndsAt: m.phaseEndsAt,
        phaseStartedAt: m.serverNow,
        round: m.round,
        you,
        opponent,
        banner: { seq: (s.banner?.seq ?? 0) + 1, round: m.round, items: m.items, live: true },
      };
    }

    case "question": {
      if (stale(s, m.round)) return s;
      const { type: _t, serverNow: _n, ...rest } = m;
      void _t;
      void _n;
      // The message's own `type` hides the question type (see question-type.ts).
      const question: QuestionView = { ...rest, type: inferQuestionType(rest) };
      return {
        ...s,
        phase: "question",
        phaseEndsAt: null,
        phaseStartedAt: m.shownAt,
        round: m.round,
        multiplier: m.multiplier,
        question,
        hidden: [],
        quickUsed: null,
        quickPending: null,
        yourAnswer: null,
        answerRejected: false,
        opponentAnswered: false,
        countdownEnd: null,
        yourDeadline: m.deadline,
        reveal: null,
        banner: null,
      };
    }

    case "answer_ack":
      if (m.round !== s.round) return s;
      return { ...s, countdownEnd: m.countdownEnd ?? s.countdownEnd, answerRejected: false };

    case "opponent_answered": {
      if (m.round !== s.round) return s;
      const deadline = s.yourDeadline ?? s.question?.deadline ?? m.countdownEnd;
      return {
        ...s,
        opponentAnswered: true,
        countdownEnd: m.countdownEnd,
        yourDeadline: Math.min(deadline, m.countdownEnd),
      };
    }

    case "powerup_result":
      if (m.round !== s.round) return s;
      return {
        ...s,
        quickUsed: m.powerup,
        quickPending: null,
        hidden: m.powerup === "oracle" ? m.hidden : s.hidden,
        you: withUsed(s.you, m.powerup),
        quickFx: { seq: (s.quickFx?.seq ?? 0) + 1, round: m.round, who: "you", powerup: m.powerup },
      };

    case "opponent_powerup":
      if (m.round !== s.round) return s;
      return {
        ...s,
        opponent: withUsed(s.opponent, m.powerup),
        quickFx: { seq: (s.quickFx?.seq ?? 0) + 1, round: m.round, who: "opponent", powerup: m.powerup },
      };

    case "reveal": {
      if (stale(s, m.round)) return s;
      const { type: _t, serverNow: _n, ...reveal } = m;
      void _t;
      void _n;
      const before = { you: s.you?.hp ?? m.hp.you + m.damageToYou, opponent: s.opponent?.hp ?? m.hp.opponent + m.damageToOpponent };
      let you = s.you ? { ...s.you, hp: m.hp.you } : null;
      let opponent = s.opponent ? { ...s.opponent, hp: m.hp.opponent } : null;
      if (m.phoenix === "you" && you) you = { ...withUsed(you, "phoenix")!, phoenixUsed: true };
      if (m.phoenix === "opponent" && opponent) opponent = { ...withUsed(opponent, "phoenix")!, phoenixUsed: true };
      return {
        ...s,
        phase: "reveal",
        phaseEndsAt: m.phaseEndsAt,
        phaseStartedAt: m.serverNow,
        round: m.round,
        you,
        opponent,
        yourAnswer: m.yourAnswer,
        reveal,
        revealFx: { seq: (s.revealFx?.seq ?? 0) + 1, live: true, before },
        quickPending: null,
      };
    }

    case "opponent_connection":
      return {
        ...s,
        opponent: s.opponent ? { ...s.opponent, connected: m.connected } : s.opponent,
        opponentForfeitAt: m.connected ? null : m.forfeitAt,
      };

    case "match_end": {
      const { type: _t, serverNow: _n, ...result } = m;
      void _t;
      void _n;
      const cancelled = m.result === "cancelled";
      return {
        ...s,
        loaded: true,
        phase: cancelled ? "cancelled" : "finished",
        phaseEndsAt: null,
        result,
        opponentForfeitAt: null,
        rematch:
          m.rematchUntil !== null
            ? { you: s.rematch?.you ?? false, opponent: s.rematch?.opponent ?? false, until: m.rematchUntil, matchId: null }
            : s.rematch,
      };
    }

    case "rematch": {
      const prev = s.rematch ?? { you: false, opponent: false, until: s.result?.rematchUntil ?? null, matchId: null };
      const accepted = m.state === "accepted";
      return {
        ...s,
        rematch: {
          ...prev,
          you: prev.you || m.by === "you" || accepted,
          opponent: prev.opponent || m.by === "opponent" || accepted,
          matchId: m.matchId ?? prev.matchId,
        },
      };
    }

    case "error": {
      const error = { seq: (s.error?.seq ?? 0) + 1, code: m.code, message: m.message };
      if (m.code === "round_closed" && s.phase === "question" && s.yourAnswer) {
        return { ...s, error, answerRejected: true };
      }
      if (m.code === "powerup_unavailable" || m.code === "wrong_phase") {
        return { ...s, error, quickPending: null, armed: s.armedAcked };
      }
      return { ...s, error };
    }
  }
}

export function matchReducer(s: MatchUiState, a: MatchAction): MatchUiState {
  switch (a.type) {
    case "server":
      return reduceServer(s, a.msg);
    case "status":
      return { ...s, status: a.status };
    case "local_arm":
      if (s.phase !== "arming" || a.round !== s.round) return s;
      if (a.powerup !== null && !s.armable.includes(a.powerup)) return s;
      return { ...s, armed: a.powerup };
    case "local_use":
      if (s.phase !== "question" || a.round !== s.round || s.yourAnswer || s.quickUsed || s.quickPending) return s;
      return { ...s, quickPending: a.powerup };
    case "local_answer":
      if (s.phase !== "question" || a.round !== s.round || s.yourAnswer) return s;
      return { ...s, yourAnswer: a.answer };
    case "reset":
      return initialMatchState();
    case "local_rematch":
      if (!s.rematch) return s;
      return { ...s, rematch: { ...s.rematch, you: true } };
  }
}

// ---------------------------------------------------------------------------
// Derived values the view needs
// ---------------------------------------------------------------------------

/** Phases in which the surrender flag works (design.md: intro to reveal). */
export const SURRENDER_PHASES: readonly Phase[] = ["intro", "arming", "banner", "question", "reveal"];

export function canSurrender(s: MatchUiState): boolean {
  return s.phase !== null && SURRENDER_PHASES.includes(s.phase) && s.status === "open";
}

/** Whether a blind power-up button is tappable right now. */
export function canArm(s: MatchUiState, p: BlindPowerupId): boolean {
  return s.phase === "arming" && s.armable.includes(p);
}

/** Whether a quick power-up button is tappable right now (the server still decides). */
export function canUseQuick(s: MatchUiState, p: QuickPowerupId, eligibleTypes: readonly string[], now: number): boolean {
  if (s.phase !== "question" || !s.question || !s.you) return false;
  if (s.yourAnswer || s.quickUsed || s.quickPending) return false;
  // At most one non-passive power-up per round; an armed one counts even if cancelled.
  if (s.armedAcked || s.armed) return false;
  if (!s.you.loadout.includes(p) || s.you.used.includes(p)) return false;
  if (p === "oracle" && !eligibleTypes.includes(s.question.type)) return false;
  if (s.yourDeadline !== null && now > s.yourDeadline) return false;
  return true;
}

/** Tiny store so the controller can compute cues from the state before each message. */
export class MatchStore {
  private state: MatchUiState = initialMatchState();
  private listeners = new Set<() => void>();

  getState = (): MatchUiState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  dispatch(action: MatchAction): { prev: MatchUiState; next: MatchUiState } {
    const prev = this.state;
    const next = matchReducer(prev, action);
    if (next !== prev) {
      this.state = next;
      for (const fn of this.listeners) fn();
    }
    return { prev, next };
  }
}
