// One per course, env.MATCHMAKER.getByName(matchmakerName(courseId)): the
// ranked queue. Being queued is having an open socket here; leaving is
// closing it. Each socket's attachment holds the player's queue entry, so the
// queue survives hibernation without any storage of its own.
//
// Pairing runs on every join and on an alarm every MATCHMAKER.tickMs while two
// or more players wait. A lone searcher gets one more queue_status at
// MATCHMAKER.nobodySearchingHintSec, so the queue screen can say nobody else
// is searching even if no other event arrives.

import { DurableObject } from "cloudflare:workers";
import { GLICKO, MATCHMAKER } from "../../shared/game/config";
import type { MatchSettings } from "../../shared/game/types";
import {
  CLOSE_CODES,
  PING,
  PONG,
  type MatchedMessage,
  type QueueErrorMessage,
  type QueueServerMessage,
  type QueueStatusMessage,
} from "../../shared/protocol";
import type { Env } from "../env";
import { createMatch } from "../match-factory";
import { HEADERS, MatchFactoryError, type MatchmakerRpc, type QueueSocketAttachment } from "./contracts";
import { isTestEnv } from "../middleware/test-mode";

const KEY_COURSE = "courseId";
const SEC = 1000;

/** Ranked always plays the whole course with power-ups (design.md). */
const RANKED_SETTINGS: MatchSettings = { powerups: true, lectures: null };

// ---------------------------------------------------------------------------
// Pairing rules (pure)
// ---------------------------------------------------------------------------

/**
 * Allowed rating gap for one player after waiting since joinedAt:
 * start + widenBy * floor(waitedSec / widenEverySec), where start is
 * provisionalStartWindow for a provisional player (RD >= GLICKO.provisionalRd)
 * and baseWindow otherwise. Infinity from unlimitedAfterSec on.
 */
export function allowedGap(entry: Pick<QueueSocketAttachment, "rd" | "joinedAt">, now: number): number {
  const waitedSec = Math.max(0, now - entry.joinedAt) / SEC;
  if (waitedSec >= MATCHMAKER.unlimitedAfterSec) return Number.POSITIVE_INFINITY;
  const start = entry.rd >= GLICKO.provisionalRd ? MATCHMAKER.provisionalStartWindow : MATCHMAKER.baseWindow;
  return start + MATCHMAKER.widenBy * Math.floor(waitedSec / MATCHMAKER.widenEverySec);
}

function isRepeat(a: QueueSocketAttachment, b: QueueSocketAttachment): boolean {
  return a.lastOpponent === b.userId || b.lastOpponent === a.userId;
}

/**
 * Pairs whose gap both players' windows allow, closest first (ties: whoever
 * waited longest). A pairing with a player's last opponent is only made when
 * no other allowed pairing is left for them.
 */
export function pairPlayers(entries: readonly QueueSocketAttachment[], now: number): [QueueSocketAttachment, QueueSocketAttachment][] {
  const candidates: { a: QueueSocketAttachment; b: QueueSocketAttachment; gap: number; since: number }[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]!;
      const b = entries[j]!;
      if (a.userId === b.userId) continue;
      const gap = Math.abs(a.rating - b.rating);
      if (gap > allowedGap(a, now) || gap > allowedGap(b, now)) continue;
      candidates.push({ a, b, gap, since: Math.min(a.joinedAt, b.joinedAt) });
    }
  }
  candidates.sort((x, y) => x.gap - y.gap || x.since - y.since);

  const taken = new Set<string>();
  const pairs: [QueueSocketAttachment, QueueSocketAttachment][] = [];
  for (const allowRepeat of [false, true]) {
    for (const c of candidates) {
      if (taken.has(c.a.userId) || taken.has(c.b.userId)) continue;
      if (!allowRepeat && isRepeat(c.a, c.b)) continue;
      taken.add(c.a.userId);
      taken.add(c.b.userId);
      pairs.push([c.a, c.b]);
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// The Durable Object
// ---------------------------------------------------------------------------

function parseNumber(raw: string | null, fallback: number): number {
  if (raw === null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function send(ws: WebSocket, msg: QueueServerMessage): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // Closed under us; the close event updates the queue.
  }
}

function close(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    // Already closed.
  }
}

export class Matchmaker extends DurableObject<Env> implements MatchmakerRpc {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  /** Runs inputs one at a time: pairing awaits D1 and the MatchRoom. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Open queue sockets, optionally ignoring one that is closing. */
  private openSockets(except?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws !== except && ws.readyState === WebSocket.OPEN);
  }

  private entry(ws: WebSocket): QueueSocketAttachment {
    return ws.deserializeAttachment() as QueueSocketAttachment;
  }

  /** Players currently queued in this course. */
  async searching(): Promise<number> {
    return this.openSockets().length;
  }

  /** Accepts the queue WebSocket forwarded by the Worker with HEADERS.userId, rating, rd and last opponent. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const userId = request.headers.get(HEADERS.userId);
    const course = new URL(request.url).searchParams.get("course");
    const { 0: client, 1: server } = new WebSocketPair();
    const refuse = (code: number, reason: string, error?: QueueErrorMessage) => {
      server.accept();
      if (error) send(server, error);
      close(server, code, reason);
      return new Response(null, { status: 101, webSocket: client });
    };
    if (!userId) return refuse(CLOSE_CODES.notAuthorised, "not signed in");

    return this.serial(async () => {
      const stored = await this.ctx.storage.get<string>(KEY_COURSE);
      if (!course || (stored !== undefined && stored !== course)) {
        return refuse(CLOSE_CODES.normal, "bad course", { type: "error", serverNow: Date.now(), code: "bad_course", matchId: null });
      }
      if (stored === undefined) await this.ctx.storage.put(KEY_COURSE, course);

      const now = Date.now();
      let joinedAt = now;
      for (const old of this.ctx.getWebSockets(userId)) {
        // A newer socket replaces the older one but keeps its place in the queue.
        if (old.readyState === WebSocket.OPEN) joinedAt = Math.min(joinedAt, this.entry(old).joinedAt);
        close(old, CLOSE_CODES.replaced, "searching on another device");
      }
      const attachment: QueueSocketAttachment = {
        userId,
        rating: parseNumber(request.headers.get(HEADERS.rating), GLICKO.startRating),
        rd: parseNumber(request.headers.get(HEADERS.rd), GLICKO.startRd),
        joinedAt,
        lastOpponent: request.headers.get(HEADERS.lastOpponent) || null,
      };
      this.ctx.acceptWebSocket(server, [userId]);
      server.serializeAttachment(attachment);

      await this.pair();
      this.broadcastStatus();
      await this.schedule();
      return new Response(null, { status: 101, webSocket: client });
    });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Clients send nothing but "ping", which the runtime answers.
    void ws; void message;
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    void code; void reason; void wasClean;
    await this.left(ws);
  }

  override async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    void error;
    await this.left(ws);
  }

  private async left(ws: WebSocket): Promise<void> {
    await this.serial(async () => {
      this.broadcastStatus(ws);
      await this.schedule(ws);
    });
  }

  override async alarm(): Promise<void> {
    await this.serial(async () => {
      await this.pair();
      this.broadcastStatus();
      await this.schedule();
    });
  }

  private broadcastStatus(except?: WebSocket): void {
    const sockets = this.openSockets(except);
    const now = Date.now();
    for (const ws of sockets) {
      const entry = this.entry(ws);
      const gap = allowedGap(entry, now);
      const status: QueueStatusMessage = {
        type: "queue_status",
        serverNow: now,
        searching: sockets.length,
        waitedMs: Math.max(0, now - entry.joinedAt),
        window: Number.isFinite(gap) ? gap : null,
      };
      send(ws, status);
    }
  }

  /** Every MATCHMAKER.tickMs while two or more wait; otherwise once at a lone searcher's hint time. */
  private async schedule(except?: WebSocket): Promise<void> {
    const sockets = this.openSockets(except);
    const now = Date.now();
    let at: number | null = null;
    if (sockets.length >= 2) {
      at = now + MATCHMAKER.tickMs;
    } else {
      for (const ws of sockets) {
        const hintAt = this.entry(ws).joinedAt + MATCHMAKER.nobodySearchingHintSec * SEC;
        if (hintAt > now) at = at === null ? hintAt : Math.min(at, hintAt);
      }
    }
    if (at === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(at);
  }

  private async pair(): Promise<void> {
    const courseId = await this.ctx.storage.get<string>(KEY_COURSE);
    if (!courseId) return;
    const entries = this.openSockets().map((ws) => this.entry(ws));
    for (const [x, y] of pairPlayers(entries, Date.now())) {
      // The longer waiter plays side a.
      const players = x.joinedAt <= y.joinedAt ? [x, y] : [y, x];
      const userIds = players.map((p) => p.userId);
      try {
        const { matchId } = await createMatch(this.env, {
          courseId,
          mode: "ranked",
          rated: true,
          settings: RANKED_SETTINGS,
          humans: userIds,
          testMode: isTestEnv(this.env),
        });
        const matched: MatchedMessage = { type: "matched", serverNow: Date.now(), matchId };
        for (const id of userIds) {
          for (const ws of this.ctx.getWebSockets(id)) {
            send(ws, matched);
            close(ws, CLOSE_CODES.normal, "matched");
          }
        }
      } catch (err) {
        await this.pairingFailed(err, userIds);
      }
    }
  }

  /**
   * already_in_match: the player in that match leaves the queue with its id;
   * the other keeps searching. Anything else: both leave with an error, since
   * retrying (no questions in the course, a bug) would fail the same way.
   */
  private async pairingFailed(err: unknown, userIds: string[]): Promise<void> {
    const now = Date.now();
    if (err instanceof MatchFactoryError && err.code === "already_in_match" && err.matchId) {
      const row = await this.env.DB.prepare("SELECT player_a, player_b FROM matches WHERE id = ?")
        .bind(err.matchId)
        .first<{ player_a: string; player_b: string | null }>();
      const busy = userIds.filter((id) => id === row?.player_a || id === row?.player_b);
      for (const id of busy) {
        for (const ws of this.ctx.getWebSockets(id)) {
          send(ws, { type: "error", serverNow: now, code: "already_in_match", matchId: err.matchId });
          close(ws, CLOSE_CODES.normal, "already in a match");
        }
      }
      if (busy.length > 0) return;
    }
    console.error("Matchmaker: createMatch failed", userIds, err);
    for (const id of userIds) {
      for (const ws of this.ctx.getWebSockets(id)) {
        send(ws, { type: "error", serverNow: now, code: "internal", matchId: null });
        close(ws, CLOSE_CODES.normal, "could not start the match");
      }
    }
  }
}
