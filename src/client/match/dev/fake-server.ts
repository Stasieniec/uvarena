// A small scripted stand-in for the MatchRoom, for the /dev/match preview and
// the match screen tests. It follows the duel rules in build-plan.md (phases,
// countdown, Hermes, Oracle, arming resolution, score, multiplier, cap, Zeus,
// Aegis, Phoenix) closely enough to drive every screen, and emits exactly the
// protocol messages the real server sends, per side. It is not the engine:
// dev builds only. Once the engine merges, the preview can run it instead.

import { MATCH, POWERUPS, SCORING, TIMER_MS_BY_TYPE, TIMING } from "@shared/game/config";
import type {
  AnswerKey,
  BannerOutcome,
  BlindPowerupId,
  MatchMode,
  OptionText,
  Phase,
  PowerupId,
  QuickPowerupId,
  RatingChange,
  Side,
} from "@shared/game/types";
import type {
  BannerItem,
  ClientMessage,
  MatchEndPayload,
  PlayerView,
  QuestionView,
  RevealPayload,
  ServerMessage,
  ShownRating,
  SnapshotMessage,
} from "@shared/protocol";

// ---------------------------------------------------------------------------
// Scenario format
// ---------------------------------------------------------------------------

export interface ScenarioQuestion {
  type: "single" | "multi" | "truefalse" | "cloze";
  prompt: string | null;
  statement: string | null;
  codeLang: string | null;
  /** Stable ids. [] for truefalse. */
  options: OptionText[];
  key: AnswerKey;
  whyShort: string;
  /** Overrides the type timer. */
  timerMs?: number;
}

/** What one side does in a round when the script plays it. Times are ms after the phase starts. */
export interface SideScript {
  arm?: BlindPowerupId;
  armAtMs?: number;
  quick?: QuickPowerupId;
  quickAtMs?: number;
  /** Stable ids. Omitted: the side lets the timer run out. */
  answer?: AnswerKey;
  answerAtMs?: number;
}

export interface ScenarioRound {
  question: ScenarioQuestion;
  sides: [SideScript, SideScript];
}

export interface ScenarioPlayer {
  userId: string | null;
  kind: "human" | "bot";
  name: string;
  avatarUrl: string | null;
  botLevel: number | null;
  loadout: PowerupId[];
  rating: ShownRating | null;
  /** Shown on the end screen. */
  ratingChange: RatingChange | null;
}

export interface Scenario {
  id: string;
  title: string;
  matchId: string;
  courseId: string;
  mode: MatchMode;
  rated: boolean;
  players: [ScenarioPlayer, ScenarioPlayer];
  rounds: ScenarioRound[];
  /** A side drops `afterShownMs` into round `round`'s question and is back at the arming of `backAtRound`. */
  disconnects?: { side: Side; round: number; afterShownMs: number; backAtRound: number }[];
  /** A scripted surrender. */
  surrender?: { side: Side; round: number; afterShownMs: number };
  /** Private lobby before the intro: side 1 joins and readies up; side 0 taps Ready. */
  lobby?: { code: string; joinAtMs: number; readyAtMs: [number, number] };
}

export type ServerEvent = { kind: "msg"; to: Side; msg: ServerMessage } | { kind: "auto"; side: Side; msg: ClientMessage };

export interface FakeServerOptions {
  /** Sides whose script the server plays itself. */
  scripted: [boolean, boolean];
  /** Sides whose script is handed out as "auto" events, so the caller can tap like a player would. */
  autoplay: [boolean, boolean];
}

// ---------------------------------------------------------------------------
// Rules (mirrors build-plan.md "Score, multiplier, damage")
// ---------------------------------------------------------------------------

export function multiplier(round: number): number {
  if (round <= SCORING.multiplierFlatRounds) return 1;
  return 1 + SCORING.multiplierStepPerRound * (Math.min(round, SCORING.multiplierCapRound) - SCORING.multiplierFlatRounds);
}

export function score(correct: boolean, ms: number, timerMs: number): number {
  if (!correct) return 0;
  const t = Math.min(Math.max(ms, 0), timerMs);
  return Math.round(SCORING.maxScore * (1 - t / (2 * timerMs)));
}

export function answersEqual(a: AnswerKey | null, key: AnswerKey): boolean {
  if (!a || a.kind !== key.kind) return false;
  if (a.kind === "bool" && key.kind === "bool") return a.value === key.value;
  if (a.kind === "options" && key.kind === "options") {
    if (a.ids.length !== key.ids.length) return false;
    const set = new Set(key.ids);
    return a.ids.every((id) => set.has(id));
  }
  return false;
}

const other = (s: Side): Side => (s === 0 ? 1 : 0);

function opaqueId(side: Side, round: number, id: string): string {
  let h = 2166136261 ^ (side + 1);
  for (const c of `${round}:${id}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(36).padStart(6, "x").slice(0, 6);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

interface SideState {
  hp: number;
  used: PowerupId[];
  phoenixUsed: boolean;
  connected: boolean;
  armed: BlindPowerupId | null;
  effective: BlindPowerupId | null;
  nemesisAgainst: boolean;
  quick: QuickPowerupId | null;
  answer: AnswerKey | null;
  answeredAt: number | null;
  hidden: string[];
  rematch: boolean;
  ready: boolean;
}

interface RoundLog {
  correct: [boolean, boolean];
  answered: [boolean, boolean];
  ms: [number | null, number | null];
  damageTaken: [number, number];
}

interface Timer {
  at: number;
  seq: number;
  run: () => void;
}

export class FakeMatchServer {
  phase: Phase = "intro";
  phaseStartedAt: number;
  phaseEndsAt: number | null = null;
  round = 0;

  private now: number;
  private timers: Timer[] = [];
  private seq = 0;
  private events: ServerEvent[] = [];
  private sides: [SideState, SideState];
  private shownAt = 0;
  private timerMs = 0;
  private deadline = 0;
  private countdownEnd: number | null = null;
  private firstSide: Side | null = null;
  private roundEndTimer: Timer | null = null;
  private lastReveal: [RevealPayload, RevealPayload] | null = null;
  private banner: [BannerItem[], BannerItem[]] | null = null;
  private log: RoundLog[] = [];
  private result: [MatchEndPayload, MatchEndPayload] | null = null;
  private rematchUntil: number | null = null;
  private rematchMatchId: string | null = null;
  private forfeitAt: [number | null, number | null] = [null, null];

  constructor(
    readonly scenario: Scenario,
    private readonly opts: FakeServerOptions,
    start: number,
  ) {
    this.now = start;
    this.phaseStartedAt = start;
    const side = (i: Side): SideState => ({
      hp: MATCH.startHp,
      used: [],
      phoenixUsed: false,
      connected: true,
      armed: null,
      effective: null,
      nemesisAgainst: false,
      quick: null,
      answer: null,
      answeredAt: null,
      hidden: [],
      rematch: scenario.players[i].kind === "bot",
      ready: !scenario.lobby,
    });
    this.sides = [side(0), side(1)];
  }

  // ----- driving -----------------------------------------------------------

  private joined = true;

  /** Starts the match: the lobby if the scenario has one, else the intro. */
  start(): ServerEvent[] {
    const lobby = this.scenario.lobby;
    if (!lobby) {
      this.startIntro();
      return this.drain();
    }
    this.joined = false;
    this.setPhase("lobby", null);
    this.emitLobby();
    this.at(this.now + lobby.joinAtMs, () => {
      this.joined = true;
      this.emitLobby();
    });
    for (const s of [0, 1] as const) {
      this.script(s, this.now + lobby.readyAtMs[s], () => ({ type: "ready" }), () => this.applyReady(s));
    }
    return this.drain();
  }

  private emitLobby(): void {
    const players = (this.joined ? ([0, 1] as const) : ([0] as const)).map((s) => ({
      name: this.scenario.players[s].name,
      avatarUrl: this.scenario.players[s].avatarUrl,
      ready: this.sides[s].ready,
    }));
    const msg = (s: Side): ServerMessage => ({
      type: "lobby",
      serverNow: this.now,
      code: this.scenario.lobby?.code ?? null,
      players: s === 0 ? players : [...players].reverse(),
      rated: this.scenario.rated,
      settings: { powerups: true, lectures: null },
    });
    this.emit(0, msg(0));
    if (this.joined) this.emit(1, msg(1));
  }

  private applyReady(side: Side): void {
    if (this.phase !== "lobby") return;
    if (side === 1 && !this.joined) return;
    this.sides[side].ready = true;
    this.emitLobby();
    if (this.joined && this.sides[0].ready && this.sides[1].ready) this.startIntro();
  }

  private startIntro(): void {
    this.setPhase("intro", this.now + TIMING.introMs);
    for (const s of [0, 1] as const) {
      this.emit(s, {
        type: "intro",
        serverNow: this.now,
        phaseEndsAt: this.phaseEndsAt!,
        you: this.playerView(s),
        opponent: this.playerView(other(s)),
        mode: this.scenario.mode,
        rated: this.scenario.rated,
      });
    }
    this.at(this.phaseEndsAt!, () => this.startArming());
  }

  nextAt(): number | null {
    return this.timers.length ? this.timers[0]!.at : null;
  }

  /** Runs every timer due at or before `now`. */
  advance(now: number): ServerEvent[] {
    while (this.timers.length && this.timers[0]!.at <= now) {
      const t = this.timers.shift()!;
      this.now = Math.max(this.now, t.at);
      t.run();
    }
    this.now = Math.max(this.now, now);
    return this.drain();
  }

  /** A (re)connect: the side gets a snapshot. */
  connect(side: Side, now: number): ServerEvent[] {
    this.now = Math.max(this.now, now);
    this.emit(side, this.snapshot(side));
    return this.drain();
  }

  handle(side: Side, msg: ClientMessage, now: number): ServerEvent[] {
    this.now = Math.max(this.now, now);
    switch (msg.type) {
      case "ready":
        this.applyReady(side);
        break;
      case "arm":
        this.applyArm(side, msg.round, msg.powerup);
        break;
      case "use":
        this.applyUse(side, msg.round, msg.powerup);
        break;
      case "answer":
        this.applyAnswer(side, msg.round, this.toReal(side, msg.answer));
        break;
      case "surrender":
        if (["intro", "arming", "banner", "question", "reveal"].includes(this.phase)) this.finish("surrender", other(side));
        else this.error(side, "wrong_phase", "Nothing to surrender.");
        break;
      case "rematch":
        this.applyRematch(side);
        break;
    }
    return this.drain();
  }

  // ----- internals ---------------------------------------------------------

  private drain(): ServerEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private at(at: number, run: () => void): Timer {
    const t: Timer = { at, seq: this.seq++, run };
    this.timers.push(t);
    this.timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
    return t;
  }

  private cancel(t: Timer | null): void {
    if (t) this.timers = this.timers.filter((x) => x !== t);
  }

  private emit(to: Side, msg: ServerMessage): void {
    this.events.push({ kind: "msg", to, msg });
  }

  private error(to: Side, code: "wrong_phase" | "round_closed" | "already_answered" | "powerup_unavailable", message: string) {
    this.emit(to, { type: "error", serverNow: this.now, code, message });
  }

  private setPhase(phase: Phase, endsAt: number | null): void {
    this.phase = phase;
    this.phaseStartedAt = this.now;
    this.phaseEndsAt = endsAt;
  }

  private get current(): ScenarioRound | null {
    return this.scenario.rounds[this.round - 1] ?? null;
  }

  /** Schedules a scripted action for a side: applied directly, or handed out for autoplay. */
  private script(side: Side, at: number, auto: () => ClientMessage, direct: () => void): void {
    if (this.opts.autoplay[side]) {
      this.at(at, () => {
        if (this.sides[side].connected) this.events.push({ kind: "auto", side, msg: auto() });
      });
    } else if (this.opts.scripted[side]) {
      this.at(at, () => {
        if (this.sides[side].connected) direct();
      });
    }
  }

  private playerView(s: Side): PlayerView {
    const p = this.scenario.players[s];
    const st = this.sides[s];
    return {
      kind: p.kind,
      userId: p.userId,
      name: p.name,
      avatarUrl: p.avatarUrl,
      botLevel: p.botLevel,
      hp: st.hp,
      loadout: p.loadout,
      used: st.used,
      phoenixUsed: st.phoenixUsed,
      connected: st.connected,
      ready: st.ready,
      rating: p.rating,
    };
  }

  private armable(s: Side): BlindPowerupId[] {
    const st = this.sides[s];
    return this.scenario.players[s].loadout.filter(
      (p): p is BlindPowerupId => POWERUPS.blind.includes(p) && !st.used.includes(p),
    );
  }

  private startArming(): void {
    if (this.round >= this.scenario.rounds.length) {
      const [a, b] = this.sides;
      this.finish("rounds", a.hp === b.hp ? "draw" : a.hp > b.hp ? 0 : 1);
      return;
    }
    this.round += 1;
    for (const st of this.sides) {
      st.armed = null;
      st.effective = null;
      st.nemesisAgainst = false;
      st.quick = null;
      st.answer = null;
      st.answeredAt = null;
      st.hidden = [];
    }
    this.lastReveal = null;
    this.banner = null;
    this.countdownEnd = null;
    this.firstSide = null;
    for (const d of this.scenario.disconnects ?? []) {
      if (d.backAtRound === this.round && !this.sides[d.side].connected) this.setConnected(d.side, true);
    }
    this.setPhase("arming", this.now + TIMING.armingMs);
    for (const s of [0, 1] as const) {
      this.emit(s, {
        type: "arming",
        serverNow: this.now,
        round: this.round,
        multiplier: multiplier(this.round),
        phaseEndsAt: this.phaseEndsAt!,
        armable: this.armable(s),
      });
      const sc = this.current!.sides[s];
      if (sc.arm) {
        const arm = sc.arm;
        const round = this.round;
        this.script(
          s,
          this.now + (sc.armAtMs ?? 1200),
          () => ({ type: "arm", round, powerup: arm }),
          () => this.applyArm(s, round, arm),
        );
      }
    }
    this.at(this.phaseEndsAt!, () => this.endArming());
  }

  private applyArm(side: Side, round: number, powerup: BlindPowerupId | null): void {
    if (this.phase !== "arming" || round !== this.round) return this.error(side, "wrong_phase", "Arming is over.");
    if (powerup && !this.armable(side).includes(powerup)) return this.error(side, "powerup_unavailable", "Not available.");
    this.sides[side].armed = powerup;
    this.emit(side, { type: "armed_ack", serverNow: this.now, round, powerup });
  }

  private endArming(): void {
    const a: [BlindPowerupId | null, BlindPowerupId | null] = [this.sides[0].armed, this.sides[1].armed];
    const items: { side: Side; powerup: BlindPowerupId; outcome: BannerOutcome }[] = [];
    for (const i of [0, 1] as const) {
      const o = other(i);
      const st = this.sides[i];
      st.effective = a[o] === "nemesis" ? null : a[i];
      st.nemesisAgainst = a[o] === "nemesis" && a[i] !== "nemesis";
      const mine = a[i];
      if (!mine) continue;
      st.used.push(mine);
      let outcome: BannerOutcome;
      if (mine === "nemesis") {
        if (a[o] === "nemesis") outcome = "cancelled";
        else if (a[o]) outcome = "nemesis_hit";
        else {
          const opp = this.sides[o];
          const phoenix = this.scenario.players[o].loadout.includes("phoenix") && !opp.phoenixUsed;
          outcome = phoenix ? "nemesis_watch" : "nemesis_wasted";
        }
      } else outcome = a[o] === "nemesis" ? "cancelled" : "active";
      items.push({ side: i, powerup: mine, outcome });
    }
    if (items.length === 0) return this.startQuestion();
    this.setPhase("banner", this.now + TIMING.bannerMs);
    const per = (s: Side): BannerItem[] =>
      items.map((it) => ({ who: it.side === s ? "you" : "opponent", powerup: it.powerup, outcome: it.outcome }));
    this.banner = [per(0), per(1)];
    for (const s of [0, 1] as const) {
      this.emit(s, { type: "banner", serverNow: this.now, round: this.round, phaseEndsAt: this.phaseEndsAt!, items: per(s) });
    }
    this.at(this.phaseEndsAt!, () => this.startQuestion());
  }

  private order(side: Side): OptionText[] {
    const opts = this.current!.question.options;
    if (opts.length === 0) return [];
    const r = this.round % opts.length;
    const rotated = [...opts.slice(r), ...opts.slice(0, r)];
    return side === 0 ? rotated : rotated.reverse();
  }

  private questionView(side: Side): QuestionView {
    const q = this.current!.question;
    return {
      round: this.round,
      type: q.type,
      prompt: q.prompt,
      statement: q.statement,
      codeLang: q.codeLang,
      options: this.order(side).map((o) => ({ id: opaqueId(side, this.round, o.id), text: o.text })),
      targets: null,
      timerMs: this.timerMs,
      shownAt: this.shownAt,
      deadline: this.deadline,
      multiplier: multiplier(this.round),
    };
  }

  private toOpaque(side: Side, a: AnswerKey): AnswerKey {
    if (a.kind !== "options") return a;
    return { kind: "options", ids: a.ids.map((id) => opaqueId(side, this.round, id)) };
  }

  private toReal(side: Side, a: AnswerKey): AnswerKey {
    if (a.kind !== "options") return a;
    const map = new Map(this.current?.question.options.map((o) => [opaqueId(side, this.round, o.id), o.id]) ?? []);
    return { kind: "options", ids: a.ids.map((id) => map.get(id) ?? id) };
  }

  private startQuestion(): void {
    const q = this.current!.question;
    this.shownAt = this.now;
    this.timerMs = q.timerMs ?? TIMER_MS_BY_TYPE[q.type];
    this.deadline = this.now + this.timerMs;
    this.setPhase("question", null);
    for (const s of [0, 1] as const) {
      // QuestionView.type (the question type) is overridden by the message type, as in the engine.
      this.emit(s, { ...this.questionView(s), type: "question", serverNow: this.now });
    }
    const round = this.round;
    for (const s of [0, 1] as const) {
      const sc = this.current!.sides[s];
      if (sc.quick) {
        const p = sc.quick;
        this.script(s, this.shownAt + (sc.quickAtMs ?? 1500), () => ({ type: "use", round, powerup: p }), () => this.applyUse(s, round, p));
      }
      if (sc.answer) {
        const real = sc.answer;
        this.script(
          s,
          this.shownAt + (sc.answerAtMs ?? 5000),
          () => ({ type: "answer", round, answer: this.toOpaque(s, real) }),
          () => this.applyAnswer(s, round, real),
        );
      }
    }
    for (const d of this.scenario.disconnects ?? []) {
      if (d.round === round) this.at(this.shownAt + d.afterShownMs, () => this.setConnected(d.side, false));
    }
    const sur = this.scenario.surrender;
    if (sur && sur.round === round) {
      this.at(this.shownAt + sur.afterShownMs, () => {
        if (this.phase === "question" && this.round === round) {
          if (this.opts.autoplay[sur.side]) this.events.push({ kind: "auto", side: sur.side, msg: { type: "surrender" } });
          else if (this.opts.scripted[sur.side]) this.finish("surrender", other(sur.side));
        }
      });
    }
    this.roundEndTimer = this.at(this.deadline + TIMING.graceMs, () => this.reveal());
  }

  private setConnected(side: Side, connected: boolean): void {
    const st = this.sides[side];
    if (st.connected === connected) return;
    st.connected = connected;
    this.forfeitAt[side] = connected ? null : this.now + MATCH.forfeitMs;
    this.emit(other(side), {
      type: "opponent_connection",
      serverNow: this.now,
      connected,
      forfeitAt: this.forfeitAt[side],
    });
  }

  private applyUse(side: Side, round: number, powerup: QuickPowerupId): void {
    const st = this.sides[side];
    const q = this.current?.question;
    if (this.phase !== "question" || round !== this.round || !q) return this.error(side, "wrong_phase", "Not now.");
    const ok =
      this.scenario.players[side].loadout.includes(powerup) &&
      !st.used.includes(powerup) &&
      !st.armed &&
      !st.quick &&
      !st.answer &&
      (powerup !== "oracle" || POWERUPS.oracle.eligibleTypes.includes(q.type));
    if (!ok) return this.error(side, "powerup_unavailable", "Not available.");
    st.quick = powerup;
    st.used.push(powerup);
    if (powerup === "oracle" && q.key.kind === "options") {
      const keyIds = new Set(q.key.ids);
      const wrong = q.options.filter((o) => !keyIds.has(o.id)).map((o) => o.id);
      const hideCount = q.type === "multi" ? POWERUPS.oracle.multiWrongHidden : Math.max(0, wrong.length - POWERUPS.oracle.singleWrongKept);
      st.hidden = wrong.slice(0, hideCount);
    }
    this.emit(side, {
      type: "powerup_result",
      serverNow: this.now,
      round,
      powerup,
      hidden: st.hidden.map((id) => opaqueId(side, round, id)),
    });
    this.emit(other(side), { type: "opponent_powerup", serverNow: this.now, round, powerup });
  }

  private applyAnswer(side: Side, round: number, answer: AnswerKey): void {
    const st = this.sides[side];
    if (this.phase !== "question" || round !== this.round) return this.error(side, "round_closed", "The round is over.");
    if (st.answer) return this.error(side, "already_answered", "Already answered.");
    const own = this.firstSide === null ? this.deadline : Math.min(this.deadline, this.countdownEnd ?? this.deadline);
    if (this.now > own + TIMING.graceMs) return this.error(side, "round_closed", "Too late.");
    st.answer = answer;
    st.answeredAt = this.now;
    const o = other(side);
    if (this.firstSide === null) {
      this.firstSide = side;
      const cd = st.quick === "hermes" ? TIMING.hermesCountdownMs : TIMING.countdownMs;
      this.countdownEnd = Math.min(this.deadline, this.now + cd);
      this.emit(side, { type: "answer_ack", serverNow: this.now, round, countdownEnd: this.countdownEnd });
      this.emit(o, { type: "opponent_answered", serverNow: this.now, round, countdownEnd: this.countdownEnd });
      this.cancel(this.roundEndTimer);
      this.roundEndTimer = this.at(this.countdownEnd + TIMING.graceMs, () => this.reveal());
    } else {
      this.emit(side, { type: "answer_ack", serverNow: this.now, round, countdownEnd: null });
    }
    if (this.sides[o].answer) {
      this.cancel(this.roundEndTimer);
      this.roundEndTimer = null;
      this.reveal();
    }
  }

  private reveal(): void {
    if (this.phase !== "question") return;
    const q = this.current!.question;
    const mult = multiplier(this.round);
    const correct = [answersEqual(this.sides[0].answer, q.key), answersEqual(this.sides[1].answer, q.key)] as [boolean, boolean];
    const ms = this.sides.map((st) => (st.answeredAt === null ? null : Math.min(this.timerMs, st.answeredAt - this.shownAt))) as [
      number | null,
      number | null,
    ];
    const scores = [0, 1].map((i) => score(correct[i]!, ms[i] ?? this.timerMs, this.timerMs)) as [number, number];
    const damage: [number, number] = [0, 0];
    let capped = false;
    let zeus: Side | null = null;
    let aegis: Side | null = null;
    let phoenix: Side | null = null;
    for (const i of [0, 1] as const) if (this.sides[i].effective === "zeus") zeus = i;
    for (const i of [0, 1] as const) if (this.sides[i].effective === "aegis") aegis = i;
    if (scores[0] !== scores[1]) {
      const att: Side = scores[0] > scores[1] ? 0 : 1;
      const def = other(att);
      const raw = (scores[att] - scores[def]) * mult;
      const z = this.sides[att].effective === "zeus";
      const cap = z ? SCORING.zeusRoundCap : SCORING.roundCap;
      let dmg = Math.min(raw * (z ? SCORING.zeusFactor : 1), cap);
      capped = raw * (z ? SCORING.zeusFactor : 1) >= cap;
      if (this.sides[def].effective === "aegis") dmg = dmg * SCORING.aegisFactor;
      dmg = Math.round(dmg);
      const d = this.sides[def];
      let hp = d.hp - dmg;
      const hasPhoenix = this.scenario.players[def].loadout.includes("phoenix");
      if (hp <= 0 && hasPhoenix && !d.phoenixUsed && !d.nemesisAgainst) {
        hp = SCORING.phoenixHp;
        d.phoenixUsed = true;
        d.used.push("phoenix");
        phoenix = def;
      }
      // The hit as dealt; HP shows what is left (1 after a Phoenix save).
      damage[def] = dmg;
      d.hp = Math.max(0, hp);
    }
    this.log.push({
      correct,
      answered: [this.sides[0].answer !== null, this.sides[1].answer !== null],
      ms,
      damageTaken: damage,
    });
    this.setPhase("reveal", this.now + TIMING.revealMs);
    const who = (x: Side | null, s: Side) => (x === null ? null : x === s ? ("you" as const) : ("opponent" as const));
    const payload = (s: Side): RevealPayload => {
      const o = other(s);
      return {
        round: this.round,
        key: this.toOpaque(s, q.key),
        yourAnswer: this.sides[s].answer ? this.toOpaque(s, this.sides[s].answer!) : null,
        opponentAnswer: this.sides[o].answer ? this.toOpaque(s, this.sides[o].answer!) : null,
        yourCorrect: correct[s],
        opponentCorrect: correct[o],
        yourMs: ms[s],
        opponentMs: ms[o],
        yourScore: scores[s],
        opponentScore: scores[o],
        multiplier: mult,
        damageToYou: damage[s],
        damageToOpponent: damage[o],
        capped,
        zeus: who(zeus, s),
        aegis: who(aegis, s),
        phoenix: who(phoenix, s),
        hp: { you: this.sides[s].hp, opponent: this.sides[o].hp },
        whyShort: q.whyShort,
        savedToMissed: this.scenario.players[s].kind === "human" && !correct[s],
        phaseEndsAt: this.phaseEndsAt!,
      };
    };
    this.lastReveal = [payload(0), payload(1)];
    for (const s of [0, 1] as const) this.emit(s, { type: "reveal", serverNow: this.now, ...this.lastReveal[s] });
    this.at(this.phaseEndsAt!, () => this.afterReveal());
  }

  private afterReveal(): void {
    const [a, b] = this.sides;
    if (a.hp <= 0 || b.hp <= 0) return this.finish("hp", a.hp <= 0 ? 1 : 0);
    this.startArming();
  }

  private finish(reason: "hp" | "rounds" | "surrender", winner: Side | "draw"): void {
    this.timers = [];
    this.setPhase("finished", null);
    this.rematchUntil = this.scenario.mode === "ranked" ? null : this.now + MATCH.rematchMs;
    const payload = (s: Side): MatchEndPayload => {
      const p = this.scenario.players[s];
      const mine = this.log.map((r) => ({ correct: r.correct[s], answered: r.answered[s], ms: r.ms[s], dealt: r.damageTaken[other(s)] }));
      const fastest = mine.filter((r) => r.correct && r.ms !== null).map((r) => r.ms!);
      return {
        result: winner === "draw" ? "draw" : winner === s ? "win" : "loss",
        reason,
        hp: { you: this.sides[s].hp, opponent: this.sides[other(s)].hp },
        rounds: this.round,
        ranked: this.scenario.mode !== "bot" && this.scenario.rated ? p.ratingChange : null,
        bot: this.scenario.mode === "bot" ? p.ratingChange : null,
        pairCapped: false,
        summary: {
          correct: mine.filter((r) => r.correct).length,
          answered: mine.filter((r) => r.answered).length,
          fastestMs: fastest.length ? Math.min(...fastest) : null,
          biggestHit: Math.max(0, ...mine.map((r) => r.dealt)),
          powerupsUsed: [...this.sides[s].used],
        },
        missedCount: p.kind === "human" ? mine.filter((r) => !r.correct).length : 0,
        rematchUntil: this.rematchUntil,
      };
    };
    this.result = [payload(0), payload(1)];
    for (const s of [0, 1] as const) this.emit(s, { type: "match_end", serverNow: this.now, ...this.result[s] });
  }

  private applyRematch(side: Side): void {
    if (this.phase !== "finished" || this.rematchUntil === null || this.now > this.rematchUntil) {
      return this.error(side, "wrong_phase", "No rematch here.");
    }
    this.sides[side].rematch = true;
    const o = other(side);
    if (this.sides[o].rematch) {
      this.rematchMatchId = `${this.scenario.matchId}-again`;
      for (const s of [0, 1] as const) {
        this.emit(s, { type: "rematch", serverNow: this.now, state: "accepted", by: s === side ? "you" : "opponent", matchId: this.rematchMatchId });
      }
      return;
    }
    this.emit(side, { type: "rematch", serverNow: this.now, state: "offered", by: "you", matchId: null });
    this.emit(o, { type: "rematch", serverNow: this.now, state: "offered", by: "opponent", matchId: null });
    if (this.opts.scripted[o]) this.at(this.now + 1500, () => this.applyRematch(o));
  }

  snapshot(side: Side): SnapshotMessage {
    const o = other(side);
    const st = this.sides[side];
    const inQuestion = this.phase === "question";
    const answeredFirst = this.firstSide;
    const yourDeadline = inQuestion
      ? answeredFirst !== null && answeredFirst !== side
        ? Math.min(this.deadline, this.countdownEnd ?? this.deadline)
        : this.deadline
      : null;
    return {
      type: "snapshot",
      serverNow: this.now,
      matchId: this.scenario.matchId,
      courseId: this.scenario.courseId,
      mode: this.scenario.mode,
      rated: this.scenario.rated,
      settings: { powerups: true, lectures: null },
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      round: this.round,
      suddenDeath: 0,
      multiplier: multiplier(Math.max(1, this.round)),
      you: this.playerView(side),
      opponent: this.joined ? this.playerView(o) : null,
      joinCode: this.scenario.lobby?.code ?? null,
      armable: this.phase === "arming" ? this.armable(side) : [],
      armed: this.phase === "arming" ? st.armed : null,
      banner: this.phase === "banner" && this.banner ? this.banner[side] : null,
      question: inQuestion || this.phase === "reveal" ? this.questionView(side) : null,
      hidden: inQuestion || this.phase === "reveal" ? st.hidden.map((id) => opaqueId(side, this.round, id)) : [],
      quickUsed: inQuestion ? st.quick : null,
      yourAnswer: inQuestion && st.answer ? this.toOpaque(side, st.answer) : null,
      opponentAnswered: inQuestion && this.sides[o].answer !== null,
      countdownEnd: inQuestion ? this.countdownEnd : null,
      yourDeadline,
      lastReveal: this.lastReveal ? this.lastReveal[side] : null,
      result: this.result ? this.result[side] : null,
      rematch:
        this.phase === "finished"
          ? { you: st.rematch, opponent: this.sides[o].rematch, until: this.rematchUntil, matchId: this.rematchMatchId }
          : null,
      opponentForfeitAt: this.forfeitAt[o],
    };
  }
}
