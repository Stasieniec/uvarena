// One per match, env.MATCH_ROOM.getByName(matchId): the shell around the pure
// engine. Every input (RPC, WebSocket frame, socket close, alarm) becomes an
// engine event; the room persists the new state, sends the engine's messages,
// performs its effects (D1 writes, finalization, rematch) and sets the one
// alarm to the engine's next deadline.
//
// Inputs run one at a time (`serial`): an effect awaits D1, and without the
// queue another frame could step a state that is about to change under it.
// State and the queue of unfinished effects are stored together, so an effect
// that fails (D1 down) is retried by the alarm and never applied twice:
// finalization is guarded by match_finalizations, and the plan it wrote is
// kept in storage until it is confirmed.

import { DurableObject } from "cloudflare:workers";
import { initState, matchEnd, nextDeadline, sideOf, step, view } from "../../shared/game/engine";
import { NET } from "../../shared/game/config";
import { isCancelledReason, planFinalization } from "../../shared/game/finalize";
import type {
  CancelReason,
  EndReason,
  EngineEvent,
  FinalizationPlan,
  MatchInit,
  MatchState,
  Outbound,
  PlayerInit,
  QuestionFull,
  Side,
  StepResult,
} from "../../shared/game/types";
import {
  CLOSE_CODES,
  PING,
  PONG,
  parseClientMessage,
  type ClientMessage,
  type ErrorMessage,
  type MatchErrorCode,
  type RematchMessage,
  type ServerMessage,
} from "../../shared/protocol";
import type { Env } from "../env";
import { createMatch } from "../match-factory";
import { HEADERS, MatchFactoryError, type JoinResult, type MatchRoomRpc, type MatchRoomSummary, type MatchSocketAttachment } from "./contracts";
import { humanIds, loadFinalizationContext, writeFinalization } from "./finalize-writer";
import { isTestEnv } from "../middleware/test-mode";

// ---------------------------------------------------------------------------
// Engine seam. The shell tests (test/do/match-room.test.ts) drive the room
// with a scripted engine to reach paths the real one makes slow or rare
// (failing effects, retries). Only a test can set
// globalThis[ROOM_TEST_ENGINE_KEY], and it is read only when TEST_MODE is "1"
// and APP_URL is a localhost URL, so a deployed Worker always runs the real
// engine.
// ---------------------------------------------------------------------------

export interface RoomEngine {
  initState: typeof initState;
  step: typeof step;
  nextDeadline: typeof nextDeadline;
  sideOf: typeof sideOf;
  view: typeof view;
  matchEnd: typeof matchEnd;
  planFinalization: typeof planFinalization;
}

export const ROOM_TEST_ENGINE_KEY = "__matchRoomTestEngine";

const realEngine: RoomEngine = { initState, step, nextDeadline, sideOf, view, matchEnd, planFinalization };

// ---------------------------------------------------------------------------
// Storage and timing
// ---------------------------------------------------------------------------

const KEY_STATE = "state";
const KEY_EFFECTS = "effects";
/** The finalization plan between computing it and confirming it in state. */
const KEY_PLAN = "plan";

/** First retry of a failed effect; doubles per attempt up to EFFECT_RETRY_MAX_MS. Infrastructure, not game rules. */
const EFFECT_RETRY_MS = 2000;
const EFFECT_RETRY_MAX_MS = 60000;
/** After this many failures an effect is dropped (logged), so cleanup can still run. */
const EFFECT_MAX_ATTEMPTS = 15;
/**
 * A socket whose client has pinged before but not for this long is treated as
 * gone (a locked phone often leaves a half-open connection behind). Clients
 * that never ping are never judged by this.
 */
const STALE_SOCKET_MS = NET.pingIntervalMs * 2.5;
/** Standard "going away" close code: not final, so the client reconnects if it is still there. */
const CLOSE_GOING_AWAY = 1001;

type PendingEffect =
  | { kind: "started"; attempts: number }
  | { kind: "finalize"; attempts: number }
  | { kind: "cancelled"; reason: EndReason; attempts: number }
  /** by: the side whose event triggered it, for the `rematch` message's `by`. */
  | { kind: "rematch"; by: Side | null; attempts: number };

const IN_PLAY_PHASES = new Set(["intro", "arming", "banner", "question", "reveal"]);

function truncateReason(reason: string): string {
  const bytes = new TextEncoder().encode(reason);
  if (bytes.length <= NET.closeReasonMaxBytes) return reason;
  return new TextDecoder().decode(bytes.slice(0, NET.closeReasonMaxBytes)).replace(/�$/, "");
}

function safeClose(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, truncateReason(reason));
  } catch {
    // Already closed.
  }
}

function safeSend(ws: WebSocket, msg: ServerMessage): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // The socket closed under us; its close event handles the rest.
  }
}

function errorMessage(code: MatchErrorCode, message: string): ErrorMessage {
  return { type: "error", serverNow: Date.now(), code, message };
}

function toEngineEvent(msg: ClientMessage, side: Side): EngineEvent {
  switch (msg.type) {
    case "ready":
      return { type: "ready", side };
    case "arm":
      return { type: "arm", side, round: msg.round, powerup: msg.powerup };
    case "use":
      return { type: "use", side, round: msg.round, powerup: msg.powerup };
    case "answer":
      return { type: "answer", side, round: msg.round, answer: msg.answer };
    case "surrender":
      return { type: "surrender", side };
    case "rematch":
      return { type: "rematch", side };
  }
}

function retryDelay(attempts: number): number {
  return Math.min(EFFECT_RETRY_MAX_MS, EFFECT_RETRY_MS * 2 ** Math.max(0, attempts - 1));
}

export class MatchRoom extends DurableObject<Env> implements MatchRoomRpc {
  private queue: Promise<unknown> = Promise.resolve();
  /** When the first pending effect may be retried; in memory only (a restart retries at once). */
  private retryAt: number | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  private get engine(): RoomEngine {
    if (isTestEnv(this.env)) {
      const override = (globalThis as Record<string, unknown>)[ROOM_TEST_ENGINE_KEY];
      if (override) return override as RoomEngine;
    }
    return realEngine;
  }

  /** Runs inputs one at a time, in arrival order. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  // -------------------------------------------------------------------------
  // Storage
  // -------------------------------------------------------------------------

  private async loadState(): Promise<MatchState | null> {
    return (await this.ctx.storage.get<MatchState>(KEY_STATE)) ?? null;
  }

  private async loadEffects(): Promise<PendingEffect[]> {
    return (await this.ctx.storage.get<PendingEffect[]>(KEY_EFFECTS)) ?? [];
  }

  // -------------------------------------------------------------------------
  // The step pipeline
  // -------------------------------------------------------------------------

  /** Persists a step result, sends its messages, runs effects and sets the alarm. */
  private async commit(result: StepResult, by: Side | null): Promise<void> {
    const pending = await this.loadEffects();
    const added: PendingEffect[] = result.effects.map((e) => {
      switch (e.kind) {
        case "rematch":
          return { kind: "rematch", by, attempts: 0 };
        case "cancelled":
          return { kind: "cancelled", reason: e.reason, attempts: 0 };
        default:
          return { kind: e.kind, attempts: 0 };
      }
    });
    await this.ctx.storage.put({ [KEY_STATE]: result.state, [KEY_EFFECTS]: [...pending, ...added] });
    this.send(result.state, result.out);
    if (added.length > 0) this.retryAt = null;
    await this.runEffects();
    await this.schedule();
  }

  /** Sends engine messages to the human sides' sockets. Bot sides have none. */
  private send(state: MatchState, out: Outbound[]): void {
    for (const { to, msg } of out) {
      const player = state.players[to];
      if (!player || player.kind !== "human" || !player.userId) continue;
      for (const ws of this.ctx.getWebSockets(player.userId)) safeSend(ws, msg);
    }
  }

  private sendToHumans(state: MatchState, build: (side: Side) => ServerMessage): void {
    const out: Outbound[] = [];
    state.players.forEach((p, i) => {
      if (p && p.kind === "human") out.push({ to: i as Side, msg: build(i as Side) });
    });
    this.send(state, out);
  }

  /** Runs pending effects in order; stops at the first failure and leaves it for the alarm. */
  private async runEffects(): Promise<void> {
    if (this.retryAt !== null && Date.now() < this.retryAt) return;
    let effects = await this.loadEffects();
    while (effects.length > 0) {
      const state = await this.loadState();
      if (!state) {
        await this.ctx.storage.delete(KEY_EFFECTS);
        return;
      }
      const [effect, ...rest] = effects as [PendingEffect, ...PendingEffect[]];
      let next: MatchState;
      try {
        next = await this.applyEffect(state, effect);
      } catch (err) {
        const attempts = effect.attempts + 1;
        if (attempts >= EFFECT_MAX_ATTEMPTS) {
          console.error(`MatchRoom ${state.matchId}: giving up on ${effect.kind} after ${attempts} attempts`, err);
          next = this.afterGivingUp(state, effect);
        } else {
          console.error(`MatchRoom ${state.matchId}: ${effect.kind} failed (attempt ${attempts})`, err);
          await this.ctx.storage.put(KEY_EFFECTS, [{ ...effect, attempts }, ...rest]);
          this.retryAt = Date.now() + retryDelay(attempts);
          return;
        }
      }
      effects = rest;
      await this.ctx.storage.put({ [KEY_STATE]: next, [KEY_EFFECTS]: effects });
      this.retryAt = null;
    }
  }

  /** Players still get their end screen when the D1 side failed for good. */
  private afterGivingUp(state: MatchState, effect: PendingEffect): MatchState {
    if (effect.kind === "finalize") {
      const now = Date.now();
      this.sendToHumans(state, (side) => this.engine.matchEnd(state, side, now));
    }
    return state;
  }

  private async applyEffect(state: MatchState, effect: PendingEffect): Promise<MatchState> {
    switch (effect.kind) {
      case "started":
        await this.markStarted(state);
        return state;
      case "cancelled":
        return this.markCancelled(state, effect.reason);
      case "finalize":
        return this.finalize(state);
      case "rematch":
        return this.rematch(state, effect.by);
    }
  }

  private async markStarted(state: MatchState): Promise<void> {
    const p0 = state.players[0];
    const p1 = state.players[1];
    await this.env.DB.prepare(
      `UPDATE matches SET status = 'active', started_at = ?, loadout_a_json = ?, loadout_b_json = ?
       WHERE id = ? AND status IN ('lobby', 'active')`,
    )
      .bind(state.startedAt ?? Date.now(), JSON.stringify(p0.loadout), p1 ? JSON.stringify(p1.loadout) : null, state.matchId)
      .run();
  }

  private async markCancelled(state: MatchState, reason: EndReason): Promise<MatchState> {
    await this.env.DB.prepare(
      `UPDATE matches SET status = 'cancelled', end_reason = ?, ended_at = ?
       WHERE id = ? AND status IN ('lobby', 'active')`,
    )
      .bind(reason, state.result?.endedAt ?? Date.now(), state.matchId)
      .run();
    const now = Date.now();
    this.sendToHumans(state, (side) => this.engine.matchEnd(state, side, now));
    return state;
  }

  private async finalize(state: MatchState): Promise<MatchState> {
    if (state.finalized) return state;
    // Cancelled matches have no rows to plan; they only close the matches row.
    if (state.result && isCancelledReason(state.result.reason)) return this.markCancelled(state, state.result.reason);
    const now = Date.now();
    let plan = await this.ctx.storage.get<FinalizationPlan>(KEY_PLAN);
    if (!plan || plan.matchId !== state.matchId) {
      const ctx = await loadFinalizationContext(this.env.DB, state, now);
      plan = this.engine.planFinalization(state, ctx);
      // Kept until the state records the result: a retry after the batch
      // landed must reuse these summaries, not recompute from updated rows.
      await this.ctx.storage.put(KEY_PLAN, plan);
    }
    await writeFinalization(this.env.DB, plan);
    const next: MatchState = { ...state, finalized: true, endSummaries: plan.summaries };
    await this.ctx.storage.put(KEY_STATE, next);
    await this.ctx.storage.delete(KEY_PLAN);
    const sentAt = Date.now();
    this.sendToHumans(next, (side) => this.engine.matchEnd(next, side, sentAt));
    return next;
  }

  private async rematch(state: MatchState, by: Side | null): Promise<MatchState> {
    if (state.rematchMatchId) return state;
    const humans = humanIds(state);
    const bot = state.players[1]?.bot ?? null;
    let matchId: string;
    try {
      const created = await createMatch(this.env, {
        courseId: state.courseId,
        mode: state.mode,
        rated: state.rated,
        settings: state.settings,
        humans,
        bot: bot ? { level: bot.level === -1 ? "echo" : bot.level } : undefined,
        rematchOf: state.matchId,
        testMode: state.timeScale !== 1,
      });
      matchId = created.matchId;
    } catch (err) {
      if (err instanceof MatchFactoryError) {
        // Someone is in another match by now, or the bank changed: no rematch.
        console.warn(`MatchRoom ${state.matchId}: rematch refused: ${err.code}`);
        return state;
      }
      throw err;
    }
    const next: MatchState = { ...state, rematchMatchId: matchId };
    const now = Date.now();
    this.sendToHumans(
      next,
      (side): RematchMessage => ({
        type: "rematch",
        serverNow: now,
        state: "accepted",
        by: by === null || by === side ? "you" : "opponent",
        matchId,
      }),
    );
    return next;
  }

  /** One alarm for everything: the engine's next deadline, or an effect retry. */
  private async schedule(): Promise<void> {
    const state = await this.loadState();
    if (!state) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const times: number[] = [];
    const effects = await this.loadEffects();
    const next = this.engine.nextDeadline(state);
    // Cleanup waits for pending effects; their retry time drives the alarm until then.
    const cleanupBlocked = effects.length > 0 && state.cleanupAt !== null && next !== null && next >= state.cleanupAt;
    if (next !== null && !cleanupBlocked) times.push(next);
    if (effects.length > 0) times.push(this.retryAt ?? Date.now());
    if (times.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const at = Math.min(...times);
    const current = await this.ctx.storage.getAlarm();
    if (current !== at) await this.ctx.storage.setAlarm(at);
  }

  private async cleanup(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) safeClose(ws, CLOSE_CODES.normal, "match over");
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.retryAt = null;
  }

  // -------------------------------------------------------------------------
  // RPC
  // -------------------------------------------------------------------------

  /** Creates the match state. Idempotent on matchId: a second call is a no-op. */
  async init(init: MatchInit): Promise<void> {
    await this.serial(async () => {
      const existing = await this.loadState();
      if (existing) {
        if (existing.matchId !== init.matchId) console.error(`MatchRoom ${existing.matchId}: init for ${init.matchId} ignored`);
        return;
      }
      await this.commit(this.engine.initState(init, Date.now()), null);
    });
  }

  /** Private lobby: adds player b and the selected questions. */
  async join(player: PlayerInit, questions: QuestionFull[]): Promise<JoinResult> {
    return this.serial(async (): Promise<JoinResult> => {
      const state = await this.loadState();
      if (!state) return "not_lobby";
      const b = state.players[1];
      if (b) return b.userId === player.userId ? "ok" : "full";
      if (state.phase !== "lobby") return state.result?.reason === "expired" ? "expired" : "not_lobby";
      if (state.players[0].userId === player.userId) return "full";
      const now = Date.now();
      if (state.lobbyExpiresAt !== null && now >= state.lobbyExpiresAt) {
        await this.commit(this.engine.step(state, { type: "tick" }, now), null);
        return "expired";
      }
      const result = this.engine.step(state, { type: "join", player, questions }, now);
      await this.commit(result, null);
      return result.state.players[1]?.userId === player.userId ? "ok" : "not_lobby";
    });
  }

  /** Cancels a lobby or a match that has not started. No-op once finished. */
  async cancel(reason: CancelReason): Promise<void> {
    await this.serial(async () => {
      const state = await this.loadState();
      if (!state || state.phase === "finished" || state.phase === "cancelled") return;
      await this.commit(this.engine.step(state, { type: "cancel", reason }, Date.now()), null);
    });
  }

  /** Phase and human players. A room without state (never created, or cleaned up) reports cancelled. */
  async summary(): Promise<MatchRoomSummary> {
    return this.serial(async () => {
      const state = await this.loadState();
      if (!state) return { phase: "cancelled", players: [] };
      return { phase: state.phase, players: humanIds(state) };
    });
  }

  // -------------------------------------------------------------------------
  // WebSockets
  // -------------------------------------------------------------------------

  /**
   * Accepts the match socket the Worker forwards with HEADERS.userId (already
   * authenticated, Origin and membership checked). A second socket for the
   * same user replaces the first, which is closed with 4001.
   */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const userId = request.headers.get(HEADERS.userId);
    const { 0: client, 1: server } = new WebSocketPair();
    const refuse = (code: number, reason: string) => {
      server.accept();
      safeClose(server, code, reason);
      return new Response(null, { status: 101, webSocket: client });
    };
    if (!userId) return refuse(CLOSE_CODES.notAuthorised, "not signed in");

    return this.serial(async () => {
      const state = await this.loadState();
      if (!state) return refuse(CLOSE_CODES.notFound, "match not found");
      const side = this.engine.sideOf(state, userId);
      if (side === null) return refuse(CLOSE_CODES.notAuthorised, "not a player");

      for (const old of this.ctx.getWebSockets(userId)) safeClose(old, CLOSE_CODES.replaced, "playing on another device");
      this.ctx.acceptWebSocket(server, [userId]);
      const attachment: MatchSocketAttachment = { userId };
      server.serializeAttachment(attachment);

      const now = Date.now();
      const result = this.engine.step(state, { type: "connect", side }, now);
      // A connect the engine has nothing to say about (already connected on
      // another device, match over) is not an error for the client.
      // The snapshot goes first: the client rebuilds its screen from it, and
      // anything the connect itself caused (intro, the next arming) follows.
      // The engine adds its snapshot last, after those messages.
      const rest = result.out.filter((o) => !(o.to === side && (o.msg.type === "error" || o.msg.type === "snapshot")));
      const snapshot = result.out.find((o) => o.to === side && o.msg.type === "snapshot") ?? {
        to: side,
        msg: this.engine.view(result.state, side, now),
      };
      await this.commit({ ...result, out: [snapshot, ...rest] }, side);
      return new Response(null, { status: 101, webSocket: client });
    });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message === PING) return;
    const parsed = typeof message === "string" ? parseClientMessage(message) : null;
    await this.serial(async () => {
      const state = await this.loadState();
      if (!state) {
        safeClose(ws, CLOSE_CODES.notFound, "match not found");
        return;
      }
      const { userId } = ws.deserializeAttachment() as MatchSocketAttachment;
      const side = this.engine.sideOf(state, userId);
      if (side === null) {
        safeSend(ws, errorMessage("not_a_player", "Not a player in this match."));
        return;
      }
      if (!parsed) {
        safeSend(ws, errorMessage("bad_message", "Could not read that message."));
        return;
      }
      await this.commit(this.engine.step(state, toEngineEvent(parsed, side), Date.now()), side);
    });
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    void code; void reason; void wasClean;
    await this.socketGone(ws);
  }

  override async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    void error;
    await this.socketGone(ws);
  }

  /** A socket closed or failed: a disconnect, unless the user has another live socket. */
  private async socketGone(ws: WebSocket): Promise<void> {
    await this.serial(async () => {
      const attachment = ws.deserializeAttachment() as MatchSocketAttachment | null;
      if (!attachment) return;
      const { userId } = attachment;
      const others = this.ctx.getWebSockets(userId).filter((s) => s !== ws && s.readyState === WebSocket.OPEN);
      if (others.length > 0) return;
      const state = await this.loadState();
      if (!state) return;
      const side = this.engine.sideOf(state, userId);
      if (side === null) return;
      const player = state.players[side];
      if (!player?.connected) return;
      await this.commit(this.engine.step(state, { type: "disconnect", side }, Date.now()), null);
    });
  }

  /** Closes sockets whose client stopped pinging, and reports those players as disconnected. */
  private async dropStaleSockets(): Promise<void> {
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const lastPing = this.ctx.getWebSocketAutoResponseTimestamp(ws);
      if (lastPing === null || now - lastPing.getTime() <= STALE_SOCKET_MS) continue;
      safeClose(ws, CLOSE_GOING_AWAY, "connection timed out");
      const { userId } = ws.deserializeAttachment() as MatchSocketAttachment;
      const others = this.ctx.getWebSockets(userId).filter((s) => s !== ws && s.readyState === WebSocket.OPEN);
      if (others.length > 0) continue;
      const state = await this.loadState();
      const side = state ? this.engine.sideOf(state, userId) : null;
      if (!state || side === null || !state.players[side]?.connected) continue;
      await this.commit(this.engine.step(state, { type: "disconnect", side }, now), null);
    }
  }

  // -------------------------------------------------------------------------
  // Alarm
  // -------------------------------------------------------------------------

  /** Retries pending effects, cleans up when due, otherwise ticks the engine. Safe to run twice. */
  override async alarm(): Promise<void> {
    await this.serial(async () => {
      if (!(await this.loadState())) {
        await this.ctx.storage.deleteAlarm();
        return;
      }
      this.retryAt = null;
      await this.runEffects();

      const state = await this.loadState();
      if (!state) return;
      const now = Date.now();
      const pending = await this.loadEffects();
      if (state.cleanupAt !== null && now >= state.cleanupAt && pending.length === 0) {
        await this.cleanup();
        return;
      }
      if (IN_PLAY_PHASES.has(state.phase)) await this.dropStaleSockets();

      const current = await this.loadState();
      if (!current) return;
      await this.commit(this.engine.step(current, { type: "tick" }, Date.now()), null);
    });
  }
}
