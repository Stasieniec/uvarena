// The duel as a pure reducer. The MatchRoom feeds it events with the current
// time; it returns the next state, the messages to send (already personalised
// per side) and the side effects to run. It never reads the clock or
// Math.random: `now` and the seeded PRNG state come in.
//
// Deadlines (phase ends, round end, bot actions, forfeits, no-show, lobby
// expiry, rematch window) are processed in time order before and after every
// event, and by `tick`, so a late alarm never skips a transition.
import type { MatchErrorCode, ServerMessage } from "../protocol";
import { botArmChoice, isTestBot, planBot, planBotQuestion, randomAnswer } from "./bot";
import { BOT_MODEL, ELO, MATCH, POWERUPS, QUESTIONS, TIMING, scaleMs } from "./config";
import { canUsePowerup, isBlind, oracleHides, resolveArming } from "./powerups";
import { createRng } from "./rng";
import { computeDamage, isCorrect, multiplier, roundScore, timerMs } from "./scoring";
import type {
  AnswerKey,
  BlindPowerupId,
  BotInit,
  ClientAnswer,
  CurrentQuestion,
  Effect,
  EndReason,
  EngineEvent,
  MatchInit,
  MatchState,
  Outbound,
  PlayerInit,
  PlayerRoundState,
  PlayerState,
  PowerupId,
  QuickPowerupId,
  Rng,
  RoundRecord,
  RoundSideRecord,
  Side,
  StepResult,
} from "./types";
import { POWERUP_IDS } from "./types";
import {
  armableFor,
  bannerItems,
  introMessage,
  isInPlay,
  lobbyMessage,
  opaqueMaps,
  other,
  ownDeadline,
  forfeitDelay,
  questionView,
  revealPayload,
  roundEndAt,
  view,
} from "./view";

export { matchEnd, view } from "./view";

const SIDES: readonly Side[] = [0, 1];
const OPAQUE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** Safety net for the deadline loop; a real match needs a handful of iterations per call. */
const MAX_DEADLINE_STEPS = 1000;

interface Ctx {
  s: MatchState;
  out: Outbound[];
  effects: Effect[];
  rng: Rng;
  now: number;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

function emptyRound(): PlayerRoundState {
  return { armed: null, effective: null, nemesisAgainst: false, quick: null, answer: null, answeredAt: null, hidden: [] };
}

function cleanLoadout(loadout: readonly PowerupId[], powerupsOn: boolean): PowerupId[] {
  if (!powerupsOn) return [];
  const out: PowerupId[] = [];
  for (const p of loadout) {
    if (POWERUP_IDS.includes(p) && !out.includes(p)) out.push(p);
    if (out.length === POWERUPS.loadoutSize) break;
  }
  return out;
}

function humanPlayer(p: PlayerInit, powerupsOn: boolean, ready: boolean): PlayerState {
  return {
    kind: "human",
    userId: p.userId,
    name: p.name,
    avatarUrl: p.avatarUrl,
    hp: MATCH.startHp,
    loadout: cleanLoadout(p.loadout, powerupsOn),
    used: [],
    phoenixUsed: false,
    connected: false,
    everConnected: false,
    disconnectedSince: null,
    ready,
    botRating: p.botRating ?? ELO.startBotRating,
    botRatingN: p.botRatingN,
    rankedBefore: p.ranked ? { r: p.ranked.r, rd: p.ranked.rd, vol: p.ranked.vol } : null,
    bot: null,
    r: emptyRound(),
  };
}

/** A bot player with its match-long plan and loadout, drawn from the PRNG. */
export function botPlayer(init: BotInit, powerupsOn: boolean, rng: Rng): PlayerState {
  const { plan, loadout } = planBot(init, powerupsOn, rng);
  return {
    kind: "bot",
    userId: null,
    name: init.name,
    avatarUrl: null,
    hp: MATCH.startHp,
    loadout,
    used: [],
    phoenixUsed: false,
    connected: true,
    everConnected: true,
    disconnectedSince: null,
    ready: true,
    botRating: init.strength,
    botRatingN: 0,
    rankedBefore: null,
    bot: plan,
    r: emptyRound(),
  };
}

/** Creates the state for a new match (lobby, or straight to waiting for connections). */
export function initState(init: MatchInit, now: number): StepResult {
  const host = init.humans[0];
  if (!host) throw new Error("initState: a match needs at least one human");
  if (init.mode === "bot" && !init.bot) throw new Error("initState: bot match without a bot");
  if (init.mode === "ranked" && init.humans.length !== 2) throw new Error("initState: ranked needs two humans");
  if (init.humans.length > 2) throw new Error("initState: at most two humans");

  const rng = createRng(init.seed);
  const powerupsOn = init.settings.powerups;
  const lobbyAlone = init.mode === "private" && init.humans.length === 1;
  const second = init.humans[1];
  const players: [PlayerState, PlayerState | null] = [
    humanPlayer(host, powerupsOn, !lobbyAlone),
    second
      ? humanPlayer(second, powerupsOn, true)
      : init.mode === "bot" && init.bot
        ? botPlayer(init.bot, powerupsOn, rng)
        : null,
  ];

  const noShow = scaleMs(MATCH.noShowMs, init.timeScale);
  const state: MatchState = {
    v: 1,
    matchId: init.matchId,
    courseId: init.courseId,
    mode: init.mode,
    rated: init.rated,
    settings: { powerups: powerupsOn, lectures: init.settings.lectures ? init.settings.lectures.slice() : null },
    joinCode: init.joinCode,
    timeScale: init.timeScale,
    phase: "lobby",
    phaseEndsAt: null,
    round: 0,
    suddenDeath: 0,
    players,
    questions: init.questions.slice(),
    qIndex: 0,
    q: null,
    rounds: [],
    rng: rng.state(),
    createdAt: init.createdAt,
    startedAt: null,
    noShowAt: lobbyAlone ? null : init.createdAt + noShow,
    lobbyExpiresAt: lobbyAlone ? init.createdAt + MATCH.lobbyTtlMs : null,
    result: null,
    rematch: [false, false],
    rematchUntil: null,
    rematchMatchId: null,
    cleanupAt: null,
    finalized: false,
    endSummaries: null,
  };
  void now;
  return { state, out: [], effects: [] };
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** The side a user plays, or null for non-players. */
export function sideOf(state: MatchState, userId: string): Side | null {
  for (const side of SIDES) {
    const p = state.players[side];
    if (p && p.kind === "human" && p.userId === userId) return side;
  }
  return null;
}

type DeadlineKind =
  | "bot_hermes"
  | "bot_oracle"
  | "bot_answer"
  | "forfeit"
  | "void"
  | "round_end"
  | "phase_end"
  | "no_show"
  | "lobby_expiry"
  | "rematch_expiry";

interface Deadline {
  at: number;
  kind: DeadlineKind;
  side: Side | null;
}

/** Tie-break when two deadlines fall on the same millisecond. */
const DEADLINE_ORDER: readonly DeadlineKind[] = [
  "bot_hermes",
  "bot_oracle",
  "bot_answer",
  "forfeit",
  "void",
  "round_end",
  "phase_end",
  "no_show",
  "lobby_expiry",
  "rematch_expiry",
];

/** Every pending deadline that changes the state when processed. */
function deadlines(s: MatchState): Deadline[] {
  const list: Deadline[] = [];
  if (s.phase === "lobby") {
    if (s.noShowAt !== null) list.push({ at: s.noShowAt, kind: "no_show", side: null });
    if (s.lobbyExpiresAt !== null) list.push({ at: s.lobbyExpiresAt, kind: "lobby_expiry", side: null });
    return list;
  }
  if (s.phase === "finished") {
    if (s.rematchUntil !== null) list.push({ at: s.rematchUntil, kind: "rematch_expiry", side: null });
    return list;
  }
  if (!isInPlay(s)) return list;

  if (s.phase === "question" && s.q) {
    list.push({ at: roundEndAt(s.q), kind: "round_end", side: null });
    for (const side of SIDES) {
      const p = s.players[side];
      const plan = p?.bot?.q;
      if (!p || p.kind !== "bot" || !plan || p.r.answer !== null) continue;
      if (plan.hermesAt !== null) list.push({ at: plan.hermesAt, kind: "bot_hermes", side });
      if (plan.oracleAt !== null) list.push({ at: plan.oracleAt, kind: "bot_oracle", side });
      if (plan.answerAt !== null) list.push({ at: plan.answerAt, kind: "bot_answer", side });
    }
  } else if (s.phaseEndsAt !== null) {
    list.push({ at: s.phaseEndsAt, kind: "phase_end", side: null });
  }

  const away = SIDES.filter((side) => {
    const p = s.players[side];
    return p !== null && p.kind === "human" && !p.connected && p.disconnectedSince !== null;
  });
  const delay = forfeitDelay(s);
  const awaySince = (side: Side) => (s.players[side]?.disconnectedSince ?? 0) + delay;
  if (away.length === 1) {
    const side = away[0] as Side;
    list.push({ at: awaySince(side), kind: "forfeit", side });
  } else if (away.length === 2) {
    // Both away: nobody can be awarded the win; void once both are past the deadline.
    list.push({ at: Math.max(awaySince(0), awaySince(1)), kind: "void", side: null });
  }
  return list;
}

/**
 * Earliest pending deadline, or null when nothing is pending. The MatchRoom
 * sets its alarm to this.
 *
 * Invariant: a `tick` at this time processes it, and the next deadline is
 * strictly later (or null). The one exception is `cleanupAt` of a finished or
 * cancelled match, which the engine never clears: at that time the MatchRoom
 * deletes its storage (and the alarm) instead of ticking.
 */
export function nextDeadline(state: MatchState): number | null {
  let min: number | null = null;
  for (const d of deadlines(state)) if (min === null || d.at < min) min = d.at;
  if ((state.phase === "finished" || state.phase === "cancelled") && state.cleanupAt !== null) {
    if (min === null || state.cleanupAt < min) min = state.cleanupAt;
  }
  return min;
}

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

/**
 * Applies one event. Invalid events return the state unchanged plus one
 * `error` message to that side. `tick` processes every due deadline in time
 * order.
 */
export function step(state: MatchState, event: EngineEvent, now: number): StepResult {
  const ctx: Ctx = { s: cloneState(state), out: [], effects: [], rng: createRng(state.rng), now };
  if (event.type === "tick") {
    processDue(ctx, true);
  } else {
    processDue(ctx, false);
    const snapshotFor = handle(ctx, event);
    processDue(ctx, false);
    if (snapshotFor !== null) send(ctx, snapshotFor, view(ctx.s, snapshotFor, now));
  }
  ctx.s.rng = ctx.rng.state();
  const out = ctx.out.filter((o) => ctx.s.players[o.to]?.kind === "human");
  return { state: ctx.s, out, effects: ctx.effects };
}

/**
 * Deep copy of the state, except the question objects, which the engine never
 * mutates and which are by far the largest part of it; they are shared.
 */
function cloneState(state: MatchState): MatchState {
  const { questions, q, ...rest } = state;
  const copy = structuredClone({ ...rest, q: q ? { ...q, question: null } : null }) as Omit<MatchState, "questions" | "q"> & {
    q: (Omit<CurrentQuestion, "question"> & { question: CurrentQuestion["question"] | null }) | null;
  };
  return {
    ...copy,
    questions,
    q: copy.q && q ? { ...copy.q, question: q.question } : null,
  };
}

function send(ctx: Ctx, to: Side, msg: ServerMessage): void {
  ctx.out.push({ to, msg });
}

function sendBoth(ctx: Ctx, build: (side: Side) => ServerMessage): void {
  for (const side of SIDES) if (ctx.s.players[side]) send(ctx, side, build(side));
}

function fail(ctx: Ctx, side: Side, code: MatchErrorCode, message: string): null {
  send(ctx, side, { type: "error", serverNow: ctx.now, code, message });
  return null;
}

function processDue(ctx: Ctx, inclusive: boolean): void {
  for (let i = 0; i < MAX_DEADLINE_STEPS; i++) {
    tryStart(ctx);
    const due = deadlines(ctx.s).filter((d) => (inclusive ? d.at <= ctx.now : d.at < ctx.now));
    if (due.length === 0) return;
    due.sort((a, b) => a.at - b.at || DEADLINE_ORDER.indexOf(a.kind) - DEADLINE_ORDER.indexOf(b.kind));
    applyDeadline(ctx, due[0] as Deadline);
  }
  throw new Error("engine: deadline loop did not settle");
}

function applyDeadline(ctx: Ctx, d: Deadline): void {
  const s = ctx.s;
  switch (d.kind) {
    case "no_show": {
      const neverCame = s.players.some((p) => p !== null && p.kind === "human" && !p.everConnected);
      if (neverCame || s.mode !== "private") cancel(ctx, "no_show");
      else s.noShowAt = null; // Everyone showed up; a private lobby waits for Ready until it expires.
      return;
    }
    case "lobby_expiry":
      cancel(ctx, "expired");
      return;
    case "rematch_expiry":
      s.rematchUntil = null;
      return;
    case "forfeit":
      finish(ctx, other(d.side as Side), "abandon");
      return;
    case "void":
      finish(ctx, null, "void");
      return;
    case "phase_end":
      if (s.phase === "intro") startArming(ctx);
      else if (s.phase === "arming") endArming(ctx);
      else if (s.phase === "banner") startQuestion(ctx);
      else if (s.phase === "reveal") afterReveal(ctx);
      return;
    case "round_end":
      endRound(ctx);
      return;
    case "bot_hermes": {
      const p = s.players[d.side as Side] as PlayerState;
      const plan = p.bot?.q;
      if (plan) plan.hermesAt = null;
      if (canUsePowerup(p, "hermes", s.settings.powerups)) useQuick(ctx, d.side as Side, "hermes", []);
      return;
    }
    case "bot_oracle": {
      const side = d.side as Side;
      const p = s.players[side] as PlayerState;
      const plan = p.bot?.q;
      if (!plan || !s.q) return;
      plan.oracleAt = null;
      if (!canUsePowerup(p, "oracle", s.settings.powerups)) return;
      const hides = oracleHides(s.q.question, ctx.rng);
      if (hides.length === 0) return;
      useQuick(ctx, side, "oracle", hides);
      // It did not know: guess again among what is left.
      plan.answer = randomAnswer(s.q.question, ctx.rng, hides);
      return;
    }
    case "bot_answer": {
      const side = d.side as Side;
      const plan = s.players[side]?.bot?.q;
      if (!plan || plan.answerAt === null) return;
      submitAnswer(ctx, side, plan.answer, plan.answerAt);
      return;
    }
  }
}

/** Handles a non-tick event. Returns the side that should receive a snapshot afterwards, if any. */
function handle(ctx: Ctx, event: Exclude<EngineEvent, { type: "tick" }>): Side | null {
  const s = ctx.s;
  switch (event.type) {
    case "join":
      onJoin(ctx, event.player, event);
      return null;
    case "cancel":
      if (s.phase === "lobby") cancel(ctx, event.reason);
      return null;
    default:
      break;
  }

  const side = event.side;
  const p = s.players[side];
  if (event.type === "disconnect") {
    if (p && p.kind === "human") onDisconnect(ctx, side);
    return null;
  }
  if (!p || p.kind !== "human") return fail(ctx, side, "not_a_player", "Not a player in this match.");

  switch (event.type) {
    case "connect":
      onConnect(ctx, side);
      return side;
    case "ready":
      if (s.phase !== "lobby") return fail(ctx, side, "wrong_phase", "The match has already started.");
      p.ready = true;
      sendBoth(ctx, () => lobbyMessage(s, ctx.now));
      tryStart(ctx);
      return null;
    case "arm":
      return onArm(ctx, side, event.round, event.powerup);
    case "use":
      return onUse(ctx, side, event.round, event.powerup);
    case "answer":
      return onAnswer(ctx, side, event.round, event.answer);
    case "surrender":
      if (!isInPlay(s)) return fail(ctx, side, "wrong_phase", "Nothing to surrender.");
      // A knockout is decided at the reveal; the white flag cannot overrule it.
      if (s.phase === "reveal" && s.players.some((pl) => pl !== null && pl.hp <= 0)) {
        return fail(ctx, side, "wrong_phase", "The match is already decided.");
      }
      finish(ctx, other(side), "surrender");
      return null;
    case "rematch":
      return onRematch(ctx, side);
  }
}

// ---------------------------------------------------------------------------
// Lobby and connections
// ---------------------------------------------------------------------------

function onJoin(ctx: Ctx, player: PlayerInit, event: { questions: MatchState["questions"] }): void {
  const s = ctx.s;
  if (s.mode !== "private" || s.phase !== "lobby" || s.players[1] !== null) return;
  if (player.userId === s.players[0].userId) return;
  s.players[1] = humanPlayer(player, s.settings.powerups, false);
  if (event.questions.length > 0) {
    s.questions = event.questions.slice();
    s.qIndex = 0;
  }
  s.noShowAt = ctx.now + scaleMs(MATCH.noShowMs, s.timeScale);
  // A join near the 15-minute mark must not leave both players seconds to ready up.
  const readyUntil = ctx.now + MATCH.lobbyReadyMs;
  s.lobbyExpiresAt = s.lobbyExpiresAt === null ? readyUntil : Math.max(s.lobbyExpiresAt, readyUntil);
  sendBoth(ctx, () => lobbyMessage(s, ctx.now));
}

function onConnect(ctx: Ctx, side: Side): void {
  const s = ctx.s;
  const p = s.players[side] as PlayerState;
  p.connected = true;
  p.everConnected = true;
  p.disconnectedSince = null;
  const opp = s.players[other(side)];
  if (opp && opp.kind === "human") {
    send(ctx, other(side), { type: "opponent_connection", serverNow: ctx.now, connected: true, forfeitAt: null });
  }
  tryStart(ctx);
}

function onDisconnect(ctx: Ctx, side: Side): void {
  const s = ctx.s;
  const p = s.players[side] as PlayerState;
  if (!p.connected) return;
  p.connected = false;
  p.disconnectedSince = ctx.now;
  const opp = s.players[other(side)];
  if (opp && opp.kind === "human") {
    send(ctx, other(side), {
      type: "opponent_connection",
      serverNow: ctx.now,
      connected: false,
      forfeitAt: isInPlay(s) ? ctx.now + forfeitDelay(s) : null,
    });
  }
}

/** Lobby to intro once both players are present, every human is connected and ready, and questions exist. */
function tryStart(ctx: Ctx): void {
  const s = ctx.s;
  if (s.phase !== "lobby" || s.players[1] === null || s.questions.length === 0) return;
  for (const p of s.players) {
    if (p && p.kind === "human" && (!p.connected || !p.ready)) return;
  }
  s.phase = "intro";
  s.phaseEndsAt = ctx.now + scaleMs(TIMING.introMs, s.timeScale);
  s.startedAt = ctx.now;
  s.noShowAt = null;
  s.lobbyExpiresAt = null;
  ctx.effects.push({ kind: "started" });
  sendBoth(ctx, (side) => introMessage(s, side, ctx.now));
}

function cancel(ctx: Ctx, reason: EndReason): void {
  const s = ctx.s;
  s.phase = "cancelled";
  s.phaseEndsAt = null;
  s.noShowAt = null;
  s.lobbyExpiresAt = null;
  s.result = { winner: null, reason, endedAt: ctx.now };
  s.cleanupAt = ctx.now + MATCH.cleanupMs;
  ctx.effects.push({ kind: "cancelled", reason });
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

function bothPlayers(s: MatchState): [PlayerState, PlayerState] {
  const [p0, p1] = s.players;
  if (!p1) throw new Error("engine: round without two players");
  return [p0, p1];
}

function startArming(ctx: Ctx): void {
  const s = ctx.s;
  const players = bothPlayers(s);
  s.round += 1;
  s.phase = "arming";
  s.phaseEndsAt =
    ctx.now + scaleMs(s.settings.powerups ? TIMING.armingMs : TIMING.armingMsNoPowerups, s.timeScale);
  for (const p of players) {
    p.r = emptyRound();
    if (p.kind === "bot") {
      p.r.armed = botArmChoice(p, s.round, (id) => canUsePowerup(p, id, s.settings.powerups));
    }
  }
  sendBoth(ctx, (side) => ({
    type: "arming",
    serverNow: ctx.now,
    round: s.round,
    multiplier: multiplier(s.round),
    phaseEndsAt: s.phaseEndsAt as number,
    armable: armableFor(s, s.players[side] as PlayerState),
  }));
}

function endArming(ctx: Ctx): void {
  const s = ctx.s;
  const players = bothPlayers(s);
  const res = resolveArming(players);
  for (const side of SIDES) {
    const p = players[side];
    p.r.effective = res.effective[side];
    p.r.nemesisAgainst = res.nemesisAgainst[side];
    if (p.r.armed !== null && !p.used.includes(p.r.armed)) p.used.push(p.r.armed);
  }
  if (res.banner.length === 0) {
    startQuestion(ctx);
    return;
  }
  s.phase = "banner";
  s.phaseEndsAt = ctx.now + scaleMs(TIMING.bannerMs, s.timeScale);
  sendBoth(ctx, (side) => ({
    type: "banner",
    serverNow: ctx.now,
    round: s.round,
    phaseEndsAt: s.phaseEndsAt as number,
    items: bannerItems(s, side),
  }));
}

function opaqueIds(rng: Rng, count: number): string[] {
  const ids = new Set<string>();
  while (ids.size < count) {
    let id = "";
    for (let i = 0; i < QUESTIONS.opaqueIdLength; i++) id += OPAQUE_ALPHABET[rng.int(0, OPAQUE_ALPHABET.length - 1)];
    ids.add(id);
  }
  return [...ids];
}

function startQuestion(ctx: Ctx): void {
  const s = ctx.s;
  const players = bothPlayers(s);
  const question = s.questions[s.qIndex % s.questions.length];
  if (!question) throw new Error("engine: no questions");
  s.qIndex += 1;
  const timer = timerMs(question, s.timeScale);
  // Order items are authored in the correct order, so they are always shuffled.
  const shuffle = question.shuffle || question.type === "order";

  const idMap: [Record<string, string>, Record<string, string>] = [{}, {}];
  const order: [string[], string[]] = [[], []];
  const targetOrder: [string[], string[]] | null = question.targets ? [[], []] : null;
  for (const side of SIDES) {
    const optIds = opaqueIds(ctx.rng, question.options.length);
    question.options.forEach((o, i) => (idMap[side][optIds[i] as string] = o.id));
    order[side] = shuffle ? ctx.rng.shuffle(optIds) : optIds;
    if (question.targets && targetOrder) {
      let tIds = opaqueIds(ctx.rng, question.targets.length);
      while (tIds.some((id) => idMap[side][id] !== undefined)) tIds = opaqueIds(ctx.rng, question.targets.length);
      question.targets.forEach((t, i) => (idMap[side][tIds[i] as string] = t.id));
      targetOrder[side] = shuffle ? ctx.rng.shuffle(tIds) : tIds;
    }
  }

  const q: CurrentQuestion = {
    question,
    shownAt: ctx.now,
    timerMs: timer,
    deadline: ctx.now + timer,
    firstSide: null,
    countdownEnd: null,
    idMap,
    order,
    targetOrder,
  };
  s.q = q;
  s.phase = "question";
  s.phaseEndsAt = q.deadline;
  for (const p of players) {
    if (p.kind === "bot" && p.bot) p.bot.q = planBotQuestion(p.bot, question, s.round, q.shownAt, timer, ctx.rng);
  }
  sendBoth(ctx, (side) => {
    // QuestionMessage extends QuestionView, whose `type` (the question type)
    // is overridden by the message type "question". The protocol needs a
    // separate field for the question type (requested from the orchestrator);
    // the snapshot's `question.type` carries it meanwhile.
    const qv = questionView(s, side) as NonNullable<ReturnType<typeof questionView>>;
    return { ...qv, type: "question", questionType: qv.type, serverNow: ctx.now };
  });
}

/** Client answer (opaque ids) to real ids, checked against the question type; null if malformed. */
function toReal(q: CurrentQuestion, side: Side, answer: ClientAnswer): AnswerKey | null {
  const idMap = q.idMap[side];
  const optionIds = new Set(q.order[side]);
  const targetIds = new Set(q.targetOrder?.[side] ?? []);
  const opt = (id: string) => (optionIds.has(id) ? (idMap[id] ?? null) : null);
  const type = q.question.type;
  switch (type) {
    case "truefalse":
      return answer.kind === "bool" ? { kind: "bool", value: answer.value } : null;
    case "single":
    case "cloze":
    case "multi": {
      if (answer.kind !== "options") return null;
      const ids = [...new Set(answer.ids)];
      if (ids.length === 0 || (type !== "multi" && ids.length !== 1)) return null;
      const real = ids.map(opt);
      return real.every((r) => r !== null) ? { kind: "options", ids: real as string[] } : null;
    }
    case "order": {
      if (answer.kind !== "order") return null;
      if (answer.ids.length !== optionIds.size || new Set(answer.ids).size !== answer.ids.length) return null;
      const real = answer.ids.map(opt);
      return real.every((r) => r !== null) ? { kind: "order", ids: real as string[] } : null;
    }
    case "match": {
      if (answer.kind !== "match") return null;
      const entries = Object.entries(answer.map);
      if (entries.length === 0) return null;
      const map: Record<string, string> = {};
      for (const [item, target] of entries) {
        const realItem = opt(item);
        const realTarget = targetIds.has(target) ? idMap[target] : undefined;
        if (realItem === null || realTarget === undefined) return null;
        map[realItem] = realTarget;
      }
      return { kind: "match", map };
    }
  }
}

/** Shared checks for answer and use: question phase, this round, not answered, still in time. */
function checkQuestionAction(ctx: Ctx, side: Side, round: number): PlayerState | null {
  const s = ctx.s;
  const p = s.players[side] as PlayerState;
  if (s.phase !== "question" || !s.q) {
    if (round === s.round && s.phase === "reveal") return fail(ctx, side, "round_closed", "This round is over.");
    return fail(ctx, side, "wrong_phase", "No question is open.");
  }
  if (round !== s.round) return fail(ctx, side, "round_closed", "That round is over.");
  if (p.r.answer !== null) return fail(ctx, side, "already_answered", "You already answered.");
  if (ctx.now > ownDeadline(s.q, side) + TIMING.graceMs) return fail(ctx, side, "round_closed", "Time is up.");
  return p;
}

function onAnswer(ctx: Ctx, side: Side, round: number, answer: ClientAnswer): null {
  if (!checkQuestionAction(ctx, side, round)) return null;
  const real = toReal(ctx.s.q as CurrentQuestion, side, answer);
  if (!real) return fail(ctx, side, "bad_message", "That answer does not fit this question.");
  submitAnswer(ctx, side, real, ctx.now);
  return null;
}

function submitAnswer(ctx: Ctx, side: Side, answer: AnswerKey, at: number): void {
  const s = ctx.s;
  const q = s.q as CurrentQuestion;
  const p = s.players[side] as PlayerState;
  const opp = s.players[other(side)] as PlayerState;
  p.r.answer = answer;
  p.r.answeredAt = at;

  if (q.firstSide === null) {
    q.firstSide = side;
    const countdown = p.r.quick === "hermes" ? TIMING.hermesCountdownMs : TIMING.countdownMs;
    q.countdownEnd = Math.min(q.deadline, at + scaleMs(countdown, s.timeScale));
    s.phaseEndsAt = q.countdownEnd;
    send(ctx, side, { type: "answer_ack", serverNow: ctx.now, round: s.round, countdownEnd: q.countdownEnd });
    send(ctx, other(side), { type: "opponent_answered", serverNow: ctx.now, round: s.round, countdownEnd: q.countdownEnd });
    if (opp.kind === "bot") applyLateGuess(ctx, other(side), at);
  } else {
    send(ctx, side, { type: "answer_ack", serverNow: ctx.now, round: s.round, countdownEnd: null });
  }

  if (opp.r.answer !== null) endRound(ctx);
}

/**
 * The opponent of a bot answered first. If the bot planned to answer after the
 * countdown ends, it guesses at a random time before the end with probability
 * BOT_MODEL.lateGuessProbability, else it times out. Test bots keep their
 * answer and give it at the countdown end.
 */
function applyLateGuess(ctx: Ctx, botSide: Side, at: number): void {
  const s = ctx.s;
  const q = s.q as CurrentQuestion;
  const bot = s.players[botSide] as PlayerState;
  const plan = bot.bot?.q;
  if (!bot.bot || !plan || plan.lateGuessResolved || bot.r.answer !== null) return;
  plan.lateGuessResolved = true;
  const end = q.countdownEnd as number;
  if (plan.answerAt !== null && plan.answerAt <= end) return;

  if (isTestBot(bot.bot.level)) {
    if (plan.answerAt !== null) plan.answerAt = end;
  } else if (ctx.rng.next() < BOT_MODEL.lateGuessProbability) {
    plan.answerAt = at + Math.floor(ctx.rng.next() * Math.max(0, end - at));
    plan.answer = randomAnswer(q.question, ctx.rng, bot.r.hidden);
  } else {
    plan.answerAt = null;
  }
  if (plan.answerAt === null || (plan.oracleAt !== null && plan.oracleAt >= plan.answerAt)) plan.oracleAt = null;
  if (plan.answerAt === null || (plan.hermesAt !== null && plan.hermesAt >= plan.answerAt)) plan.hermesAt = null;
}

function onArm(ctx: Ctx, side: Side, round: number, powerup: BlindPowerupId | null): null {
  const s = ctx.s;
  const p = s.players[side] as PlayerState;
  if (s.phase !== "arming") return fail(ctx, side, "wrong_phase", "Power-ups are armed before the question.");
  if (round !== s.round) return fail(ctx, side, "round_closed", "That round is over.");
  if (powerup !== null && (!isBlind(powerup) || !canUsePowerup(p, powerup, s.settings.powerups))) {
    return fail(ctx, side, "powerup_unavailable", "That power-up is not available.");
  }
  p.r.armed = powerup;
  send(ctx, side, { type: "armed_ack", serverNow: ctx.now, round: s.round, powerup });
  return null;
}

function onUse(ctx: Ctx, side: Side, round: number, powerup: QuickPowerupId): null {
  const p = checkQuestionAction(ctx, side, round);
  if (!p) return null;
  const s = ctx.s;
  const q = s.q as CurrentQuestion;
  if (!canUsePowerup(p, powerup, s.settings.powerups)) {
    return fail(ctx, side, "powerup_unavailable", "That power-up is not available.");
  }
  let hides: string[] = [];
  if (powerup === "oracle") {
    hides = oracleHides(q.question, ctx.rng);
    if (hides.length === 0) return fail(ctx, side, "powerup_unavailable", "The Oracle has nothing to say about this one.");
  }
  useQuick(ctx, side, powerup, hides);
  return null;
}

function useQuick(ctx: Ctx, side: Side, powerup: QuickPowerupId, hides: string[]): void {
  const s = ctx.s;
  const q = s.q as CurrentQuestion;
  const p = s.players[side] as PlayerState;
  p.r.quick = powerup;
  p.r.hidden = hides.slice();
  if (!p.used.includes(powerup)) p.used.push(powerup);
  const opaque = opaqueMaps(q, side).options;
  send(ctx, side, {
    type: "powerup_result",
    serverNow: ctx.now,
    round: s.round,
    powerup,
    hidden: hides.map((id) => opaque.get(id) ?? id),
  });
  send(ctx, other(side), { type: "opponent_powerup", serverNow: ctx.now, round: s.round, powerup });
}

function endRound(ctx: Ctx): void {
  const s = ctx.s;
  const q = s.q as CurrentQuestion;
  const players = bothPlayers(s);
  const question = q.question;
  const mult = multiplier(s.round);

  const correct = players.map((p) => isCorrect(question.key, p.r.answer)) as [boolean, boolean];
  const scores = players.map((p, i) => roundScore(correct[i] as boolean, p.r.answeredAt, q.shownAt, q.timerMs)) as [
    number,
    number,
  ];
  const dmg = computeDamage({
    scores,
    multiplier: mult,
    effective: [players[0].r.effective, players[1].r.effective],
    hp: [players[0].hp, players[1].hp],
    phoenixReady: players.map((p) => p.loadout.includes("phoenix") && !p.phoenixUsed && !p.r.nemesisAgainst) as [
      boolean,
      boolean,
    ],
  });

  const sides = SIDES.map((side): RoundSideRecord => {
    const p = players[side];
    if (dmg.phoenix[side]) {
      p.phoenixUsed = true;
      if (!p.used.includes("phoenix")) p.used.push("phoenix");
    }
    p.hp = dmg.hpAfter[side];
    const answered = p.r.answeredAt !== null && p.r.answer !== null;
    const timedOut = !answered;
    return {
      answer: p.r.answer,
      answeredAt: p.r.answeredAt,
      ms: answered ? Math.min(q.timerMs, Math.max(0, (p.r.answeredAt as number) - q.shownAt)) : null,
      correct: correct[side] as boolean,
      timedOut,
      timedOutAfterCountdown: timedOut && q.firstSide !== null && q.firstSide !== side,
      helped: p.r.quick === "oracle",
      score: scores[side],
      damageTaken: dmg.damage[side],
      hpAfter: p.hp,
      armed: p.r.armed,
      effective: p.r.effective,
      nemesisAgainst: p.r.nemesisAgainst,
      quick: p.r.quick,
      phoenix: dmg.phoenix[side],
    };
  }) as [RoundSideRecord, RoundSideRecord];

  const rec: RoundRecord = {
    round: s.round,
    suddenDeath: s.round > MATCH.maxRounds,
    questionId: question.id,
    questionRev: question.rev,
    lectureId: question.lectureId,
    multiplier: mult,
    shownAt: q.shownAt,
    timerMs: q.timerMs,
    deadline: q.deadline,
    countdownEnd: q.countdownEnd,
    firstSide: q.firstSide,
    capped: dmg.capped,
    itemRating: question.rating,
    itemRatingN: question.ratingN,
    chance: question.chance,
    sides,
  };
  s.rounds.push(rec);
  s.suddenDeath = Math.max(0, s.round - MATCH.maxRounds);
  for (const p of players) if (p.bot) p.bot.q = null;

  s.phase = "reveal";
  s.phaseEndsAt = ctx.now + scaleMs(TIMING.revealMs, s.timeScale);
  sendBoth(ctx, (side) => ({ type: "reveal", serverNow: ctx.now, ...revealPayload(s, side, rec, s.phaseEndsAt as number) }));
}

function afterReveal(ctx: Ctx): void {
  const s = ctx.s;
  const [p0, p1] = bothPlayers(s);
  if (p0.hp <= 0) return finish(ctx, 1, "hp");
  if (p1.hp <= 0) return finish(ctx, 0, "hp");
  if (s.round >= MATCH.maxRounds) {
    if (p0.hp !== p1.hp) return finish(ctx, p0.hp > p1.hp ? 0 : 1, "rounds");
    if (s.round - MATCH.maxRounds >= MATCH.suddenDeathMax) return finish(ctx, "draw", "rounds");
  }
  startArming(ctx);
}

/** Ends the match. winner null means void. */
function finish(ctx: Ctx, winner: Side | "draw" | null, reason: EndReason): void {
  const s = ctx.s;
  s.phase = "finished";
  s.phaseEndsAt = null;
  s.result = { winner, reason, endedAt: ctx.now };
  s.cleanupAt = ctx.now + MATCH.cleanupMs;
  for (const p of s.players) if (p?.bot) p.bot.q = null;
  const offersRematch =
    (s.mode === "private" || s.mode === "bot") && (reason === "hp" || reason === "rounds" || reason === "surrender");
  if (offersRematch) {
    s.rematchUntil = ctx.now + MATCH.rematchMs;
    s.rematch = [s.players[0].kind === "bot", s.players[1]?.kind === "bot"];
  }
  ctx.effects.push({ kind: "finalize" });
}

function onRematch(ctx: Ctx, side: Side): null {
  const s = ctx.s;
  if (s.phase !== "finished" || s.rematchUntil === null || ctx.now > s.rematchUntil) {
    return fail(ctx, side, "wrong_phase", "No rematch is open.");
  }
  if (s.rematch[side]) return null;
  s.rematch[side] = true;
  if (s.rematch[0] && s.rematch[1]) {
    ctx.effects.push({ kind: "rematch" });
    return null;
  }
  sendBoth(ctx, (to) => ({
    type: "rematch",
    serverNow: ctx.now,
    state: "offered",
    by: to === side ? "you" : "opponent",
    matchId: null,
  }));
  return null;
}
