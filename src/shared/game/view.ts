// Per-side views of the match state. Everything a client receives is built
// here, in the receiver's opaque id space. Before a round's reveal nothing
// here carries the key, correctness, or the opponent's answer or Oracle hides.
import type {
  BannerItem,
  IntroMessage,
  LobbyMessage,
  MatchEndMessage,
  MatchEndPayload,
  PlayerView,
  QuestionView,
  RevealPayload,
  ShownRating,
  SnapshotMessage,
} from "../protocol";
import { ELO, GLICKO, MATCH, POWERUPS, TIMING, scaleMs } from "./config";
import { canUsePowerup, resolveArming } from "./powerups";
import { multiplier } from "./scoring";
import type {
  AnswerKey,
  BlindPowerupId,
  CurrentQuestion,
  MatchState,
  Phase,
  PlayerState,
  RoundRecord,
  Side,
} from "./types";

// ---------------------------------------------------------------------------
// Small helpers shared with engine.ts
// ---------------------------------------------------------------------------

/** Phases in which a match is being played: surrender and forfeits apply. */
export const IN_PLAY_PHASES: readonly Phase[] = ["intro", "arming", "banner", "question", "reveal"];

export function isInPlay(state: MatchState): boolean {
  return IN_PLAY_PHASES.includes(state.phase);
}

export function other(side: Side): Side {
  return side === 0 ? 1 : 0;
}

/** Continuous disconnect after which a player abandons, with the match time scale. */
export function forfeitDelay(state: MatchState): number {
  return scaleMs(MATCH.forfeitMs, state.timeScale);
}

/** The last moment this side's answer is accepted, before grace. */
export function ownDeadline(q: CurrentQuestion, side: Side): number {
  if (q.firstSide !== null && q.firstSide !== side && q.countdownEnd !== null) {
    return Math.min(q.deadline, q.countdownEnd);
  }
  return q.deadline;
}

/** Round end: the visible end of the question plus grace. */
export function roundEndAt(q: CurrentQuestion): number {
  return (q.countdownEnd ?? q.deadline) + TIMING.graceMs;
}

interface OpaqueMaps {
  options: Map<string, string>;
  targets: Map<string, string>;
}

/** Real id -> this side's opaque id, separately for options and match targets. */
export function opaqueMaps(q: CurrentQuestion, side: Side): OpaqueMaps {
  const idMap = q.idMap[side];
  const options = new Map<string, string>();
  for (const opaque of q.order[side]) {
    const real = idMap[opaque];
    if (real !== undefined) options.set(real, opaque);
  }
  const targets = new Map<string, string>();
  for (const opaque of q.targetOrder?.[side] ?? []) {
    const real = idMap[opaque];
    if (real !== undefined) targets.set(real, opaque);
  }
  return { options, targets };
}

/** An answer or key in real ids, translated into this side's opaque ids. */
export function answerToOpaque(answer: AnswerKey, q: CurrentQuestion, side: Side): AnswerKey {
  const maps = opaqueMaps(q, side);
  const opt = (id: string) => maps.options.get(id) ?? id;
  switch (answer.kind) {
    case "bool":
      return { kind: "bool", value: answer.value };
    case "options":
      return { kind: "options", ids: answer.ids.map(opt) };
    case "order":
      return { kind: "order", ids: answer.ids.map(opt) };
    case "match": {
      const map: Record<string, string> = {};
      for (const [item, target] of Object.entries(answer.map)) map[opt(item)] = maps.targets.get(target) ?? target;
      return { kind: "match", map };
    }
  }
}

// ---------------------------------------------------------------------------
// Pieces of messages
// ---------------------------------------------------------------------------

function shownRating(state: MatchState, p: PlayerState): ShownRating {
  if (p.kind === "bot") return { value: Math.round(p.botRating), provisional: false };
  if (state.mode === "bot") {
    return { value: Math.round(p.botRating), provisional: p.botRatingN < ELO.botProvisionalAnswers };
  }
  const r = p.rankedBefore;
  if (!r) return { value: GLICKO.startRating, provisional: true };
  return { value: Math.round(r.r), provisional: r.rd >= GLICKO.provisionalRd };
}

export function playerView(state: MatchState, p: PlayerState): PlayerView {
  return {
    kind: p.kind,
    userId: p.userId,
    name: p.name,
    avatarUrl: p.avatarUrl,
    botLevel: p.bot ? p.bot.level : null,
    hp: p.hp,
    loadout: p.loadout.slice(),
    used: p.used.slice(),
    phoenixUsed: p.phoenixUsed,
    connected: p.connected,
    ready: p.ready,
    rating: shownRating(state, p),
  };
}

/** Unused blind power-ups this player could arm now. */
export function armableFor(state: MatchState, p: PlayerState): BlindPowerupId[] {
  return (POWERUPS.blind as readonly BlindPowerupId[]).filter((id) => canUsePowerup(p, id, state.settings.powerups));
}

export function questionView(state: MatchState, side: Side): QuestionView | null {
  const q = state.q;
  if (!q) return null;
  const question = q.question;
  const idMap = q.idMap[side];
  const textOf = new Map(question.options.map((o) => [o.id, o.text]));
  const targetText = new Map((question.targets ?? []).map((t) => [t.id, t.text]));
  return {
    round: state.round,
    type: question.type,
    prompt: question.prompt,
    statement: question.statement,
    codeLang: question.codeLang,
    options: q.order[side].map((id) => ({ id, text: textOf.get(idMap[id] ?? "") ?? "" })),
    targets: q.targetOrder ? q.targetOrder[side].map((id) => ({ id, text: targetText.get(idMap[id] ?? "") ?? "" })) : null,
    timerMs: q.timerMs,
    shownAt: q.shownAt,
    deadline: q.deadline,
    multiplier: multiplier(state.round),
  };
}

/** Banner items as this side sees them; derived from the round's armed choices. */
export function bannerItems(state: MatchState, side: Side): BannerItem[] {
  const [p0, p1] = state.players;
  if (!p1) return [];
  return resolveArming([p0, p1]).banner.map((b) => ({
    who: b.side === side ? "you" : "opponent",
    powerup: b.powerup,
    outcome: b.outcome,
  }));
}

function pickWho(side: Side, flags: [boolean, boolean], preferred: Side | null): "you" | "opponent" | null {
  let s: Side | null = null;
  if (preferred !== null && flags[preferred]) s = preferred;
  else if (flags[side]) s = side;
  else if (flags[other(side)]) s = other(side);
  if (s === null) return null;
  return s === side ? "you" : "opponent";
}

/** The reveal of a finished round for one side. Needs the round's question still in state.q. */
export function revealPayload(state: MatchState, side: Side, rec: RoundRecord, phaseEndsAt: number): RevealPayload {
  const q = state.q;
  if (!q) throw new Error("reveal without a question");
  const me = rec.sides[side];
  const opp = rec.sides[other(side)];
  const attacker: Side | null = rec.sides[0].damageTaken > 0 ? 1 : rec.sides[1].damageTaken > 0 ? 0 : null;
  const defender: Side | null = attacker === null ? null : other(attacker);
  const player = state.players[side];
  return {
    round: rec.round,
    questionId: rec.questionId,
    key: answerToOpaque(q.question.key, q, side),
    yourAnswer: me.answer ? answerToOpaque(me.answer, q, side) : null,
    opponentAnswer: opp.answer ? answerToOpaque(opp.answer, q, side) : null,
    yourCorrect: me.correct,
    opponentCorrect: opp.correct,
    yourMs: me.ms,
    opponentMs: opp.ms,
    yourScore: me.score,
    opponentScore: opp.score,
    multiplier: rec.multiplier,
    damageToYou: me.damageTaken,
    damageToOpponent: opp.damageTaken,
    capped: rec.capped,
    zeus: pickWho(side, [rec.sides[0].effective === "zeus", rec.sides[1].effective === "zeus"], attacker),
    aegis: pickWho(side, [rec.sides[0].effective === "aegis", rec.sides[1].effective === "aegis"], defender),
    phoenix: pickWho(side, [rec.sides[0].phoenix, rec.sides[1].phoenix], null),
    hp: { you: me.hpAfter, opponent: opp.hpAfter },
    whyShort: q.question.whyShort,
    savedToMissed: player?.kind === "human" && !me.correct,
    phaseEndsAt,
  };
}

/** The last finished round's reveal, while its question is still the current one. */
function lastReveal(state: MatchState, side: Side, now: number): RevealPayload | null {
  const rec = state.rounds[state.rounds.length - 1];
  const q = state.q;
  if (!rec || !q || rec.shownAt !== q.shownAt || rec.questionId !== q.question.id) return null;
  const endsAt = state.phase === "reveal" && state.phaseEndsAt !== null ? state.phaseEndsAt : now;
  return revealPayload(state, side, rec, endsAt);
}

export function lobbyMessage(state: MatchState, now: number): LobbyMessage {
  return {
    type: "lobby",
    serverNow: now,
    code: state.joinCode,
    players: state.players
      .filter((p): p is PlayerState => p !== null)
      .map((p) => ({ name: p.name, avatarUrl: p.avatarUrl, ready: p.ready })),
    rated: state.rated,
    settings: { powerups: state.settings.powerups, lectures: state.settings.lectures?.slice() ?? null },
  };
}

export function introMessage(state: MatchState, side: Side, now: number): IntroMessage {
  const me = state.players[side];
  const opp = state.players[other(side)];
  if (!me || !opp) throw new Error("intro without two players");
  return {
    type: "intro",
    serverNow: now,
    phaseEndsAt: state.phaseEndsAt ?? now,
    you: playerView(state, me),
    opponent: playerView(state, opp),
    mode: state.mode,
    rated: state.rated,
  };
}

function forfeitAtOf(state: MatchState, p: PlayerState | null): number | null {
  if (!p || p.kind !== "human" || p.connected || p.disconnectedSince === null || !isInPlay(state)) return null;
  return p.disconnectedSince + forfeitDelay(state);
}

/** When this side's opponent forfeits if still away; null while connected or outside play. */
export function opponentForfeitAt(state: MatchState, side: Side): number | null {
  return forfeitAtOf(state, state.players[other(side)]);
}

// ---------------------------------------------------------------------------
// Snapshot and match end
// ---------------------------------------------------------------------------

/** Full snapshot for one side, sent on every connect. Never contains the key before the reveal. */
export function view(state: MatchState, side: Side, now: number): SnapshotMessage {
  const me = state.players[side];
  if (!me) throw new Error(`no player on side ${side}`);
  const opp = state.players[other(side)];
  const q = state.q;
  const questionPhase = state.phase === "question";
  const showQuestion = questionPhase || state.phase === "reveal";
  const ended = state.phase === "finished" || state.phase === "cancelled";
  const hasRound = state.round > 0 && IN_PLAY_PHASES.includes(state.phase);

  return {
    type: "snapshot",
    serverNow: now,
    matchId: state.matchId,
    courseId: state.courseId,
    mode: state.mode,
    rated: state.rated,
    settings: { powerups: state.settings.powerups, lectures: state.settings.lectures?.slice() ?? null },
    phase: state.phase,
    phaseEndsAt: state.phaseEndsAt,
    round: state.round,
    suddenDeath: state.suddenDeath,
    multiplier: multiplier(Math.max(1, state.round)),
    you: playerView(state, me),
    opponent: opp ? playerView(state, opp) : null,
    joinCode: state.joinCode,
    armable: state.phase === "arming" ? armableFor(state, me) : [],
    armed: hasRound ? me.r.armed : null,
    banner: state.phase === "banner" ? bannerItems(state, side) : null,
    question: showQuestion ? questionView(state, side) : null,
    hidden: showQuestion && q ? me.r.hidden.map((id) => opaqueMaps(q, side).options.get(id) ?? id) : [],
    quickUsed: showQuestion ? me.r.quick : null,
    yourAnswer: showQuestion && q && me.r.answer ? answerToOpaque(me.r.answer, q, side) : null,
    opponentAnswered: showQuestion && opp !== null && opp.r.answer !== null,
    countdownEnd: questionPhase && q ? q.countdownEnd : null,
    yourDeadline: questionPhase && q ? ownDeadline(q, side) : null,
    lastReveal: lastReveal(state, side, now),
    result: ended ? matchEndPayload(state, side) : null,
    rematch:
      state.phase === "finished" && (state.mode === "private" || state.mode === "bot")
        ? {
            you: state.rematch[side],
            opponent: state.rematch[other(side)],
            until: state.rematchUntil,
            matchId: state.rematchMatchId,
          }
        : null,
    opponentForfeitAt: opponentForfeitAt(state, side),
    noShowAt: state.phase === "lobby" ? state.noShowAt : null,
  };
}

function matchEndPayload(state: MatchState, side: Side): MatchEndPayload {
  const me = state.players[side];
  const opp = state.players[other(side)];
  const res = state.result;
  let result: MatchEndPayload["result"];
  if (state.phase === "cancelled" || !res) result = "cancelled";
  else if (res.reason === "void") result = "void";
  else if (res.winner === "draw") result = "draw";
  else if (res.winner === side) result = "win";
  else result = "loss";

  const mine = state.rounds.map((r) => r.sides[side]);
  const correctMs = mine.filter((s) => s.correct && s.ms !== null).map((s) => s.ms as number);
  const summary = state.endSummaries?.[side] ?? null;
  const missedFallback = me?.kind === "human" ? mine.filter((s) => !s.correct).length : 0;

  return {
    result,
    reason: res?.reason ?? "cancelled",
    hp: { you: me?.hp ?? 0, opponent: opp?.hp ?? 0 },
    rounds: state.rounds.length,
    ranked: summary?.ranked ?? null,
    bot: summary?.bot ?? null,
    pairCapped: summary?.pairCapped ?? false,
    summary: {
      correct: mine.filter((s) => s.correct).length,
      answered: mine.filter((s) => s.answer !== null).length,
      fastestMs: correctMs.length > 0 ? Math.min(...correctMs) : null,
      biggestHit: state.rounds.reduce((max, r) => Math.max(max, r.sides[other(side)].damageTaken), 0),
      powerupsUsed: me ? me.used.slice() : [],
    },
    missedCount: summary ? summary.missedCount : missedFallback,
    rematchUntil: state.phase === "finished" ? state.rematchUntil : null,
  };
}

/** match_end for one side, from state.result and state.endSummaries (ratings null until finalized or for cancelled matches). */
export function matchEnd(state: MatchState, side: Side, now: number): MatchEndMessage {
  return { type: "match_end", serverNow: now, ...matchEndPayload(state, side) };
}
