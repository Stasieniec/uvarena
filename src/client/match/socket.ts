// Reconnecting match WebSocket. Parses every frame with the protocol schemas,
// sends the "ping" heartbeat, backs off 0.5 s doubling to 5 s with jitter on
// unexpected closes, reconnects at once when the page becomes visible again,
// and stops for good on the final close codes (1000, 4001, 4003, 4004).
//
// Written against small structural types instead of DOM globals so the logic
// can be tested in Node with a fake socket.

import { NET } from "@shared/game/config";
import {
  CLOSE_CODES,
  FINAL_CLOSE_CODES,
  PING,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from "@shared/protocol";
import type { ConnectionStatus } from "./state";

/** The parts of a browser WebSocket this module uses. */
export interface SocketLike {
  readonly readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

const OPEN = 1;

export interface SocketDeps {
  create(url: string): SocketLike;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  random(): number;
  now(): number;
  /** Calls fn when the page becomes visible or the network comes back; returns an unsubscribe. */
  onWake(fn: () => void): () => void;
}

export interface MatchSocketListener {
  onMessage(msg: ServerMessage, receivedAt: number): void;
  onStatus(status: ConnectionStatus): void;
}

/** Close code the client uses when it gives up on a silent socket. */
export const STALE_CLOSE_CODE = 4000;

/** Backoff before reconnect attempt n (0-based): 0.5 s doubling to 5 s, with jitter in [50%, 100%]. */
export function backoffMs(attempt: number, random: () => number): number {
  const base = Math.min(NET.reconnectMaxMs, NET.reconnectInitialMs * 2 ** Math.min(attempt, 16));
  return Math.round(base * (0.5 + random() * 0.5));
}

export function statusForClose(code: number): ConnectionStatus | null {
  switch (code) {
    case CLOSE_CODES.replaced:
      return "replaced";
    case CLOSE_CODES.notAuthorised:
      return "not_authorised";
    case CLOSE_CODES.notFound:
      return "not_found";
    case CLOSE_CODES.normal:
      return "closed";
    default:
      return FINAL_CLOSE_CODES.includes(code) ? "closed" : null;
  }
}

export class MatchSocket {
  private ws: SocketLike | null = null;
  private attempt = 0;
  private retryTimer: unknown = null;
  private pingTimer: unknown = null;
  private lastFrameAt = 0;
  private stopped = false;
  /** Set after a final close; only reconnectNow() clears it. */
  private final = false;
  private unsubscribeWake: (() => void) | null = null;
  private status: ConnectionStatus = "idle";

  constructor(
    private readonly url: string,
    private readonly listener: MatchSocketListener,
    private readonly deps: SocketDeps,
  ) {}

  start(): void {
    this.stopped = false;
    this.unsubscribeWake = this.deps.onWake(() => this.onWake());
    this.open();
  }

  /** Sends a message if the socket is open. Returns whether it went out. */
  send(msg: ClientMessage): boolean {
    if (!this.ws || this.ws.readyState !== OPEN) return false;
    try {
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  /** Connects again right away, also after a final close (the "Play here" button). */
  reconnectNow(): void {
    if (this.stopped) return;
    this.final = false;
    this.attempt = 0;
    this.clearRetry();
    if (this.ws && this.ws.readyState === OPEN) return;
    this.dropSocket();
    this.open();
  }

  stop(): void {
    this.stopped = true;
    this.clearRetry();
    this.clearPing();
    this.unsubscribeWake?.();
    this.unsubscribeWake = null;
    this.dropSocket(CLOSE_CODES.normal);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  private setStatus(s: ConnectionStatus): void {
    if (s === this.status) return;
    this.status = s;
    this.listener.onStatus(s);
  }

  private open(): void {
    if (this.stopped || this.final) return;
    this.setStatus(this.attempt === 0 && this.status === "idle" ? "connecting" : "reconnecting");
    let ws: SocketLike;
    try {
      ws = this.deps.create(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempt = 0;
      this.lastFrameAt = this.deps.now();
      this.setStatus("open");
      this.schedulePing();
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      const receivedAt = this.deps.now();
      this.lastFrameAt = receivedAt;
      if (typeof ev.data !== "string") return;
      const msg = parseServerMessage(ev.data);
      if (msg) this.listener.onMessage(msg, receivedAt);
    };
    ws.onerror = () => {
      // A close event always follows; reconnecting happens there.
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearPing();
      if (this.stopped) return;
      const final = statusForClose(ev.code);
      if (final) {
        this.final = true;
        this.setStatus(final);
        return;
      }
      this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    if (this.stopped || this.final) return;
    this.setStatus("reconnecting");
    this.clearRetry();
    const delay = backoffMs(this.attempt, this.deps.random);
    this.attempt += 1;
    this.retryTimer = this.deps.setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delay);
  }

  private onWake(): void {
    if (this.stopped || this.final) return;
    if (this.ws && this.ws.readyState === OPEN) {
      // A phone waking up can hold a dead socket that still says OPEN.
      if (this.deps.now() - this.lastFrameAt > NET.pingIntervalMs) this.sendPing();
      return;
    }
    if (this.ws) return; // still connecting
    this.attempt = 0;
    this.clearRetry();
    this.open();
  }

  private schedulePing(): void {
    this.clearPing();
    this.pingTimer = this.deps.setTimeout(() => {
      this.pingTimer = null;
      this.sendPing();
    }, NET.pingIntervalMs);
  }

  /** Sends "ping"; if no frame at all arrives within a ping interval, the socket is treated as dead. */
  private sendPing(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== OPEN) return;
    const sentAt = this.deps.now();
    try {
      ws.send(PING);
    } catch {
      // close follows
    }
    this.clearPing();
    this.pingTimer = this.deps.setTimeout(() => {
      this.pingTimer = null;
      if (this.ws !== ws) return;
      if (this.lastFrameAt >= sentAt) {
        this.sendPing();
        return;
      }
      // Silent socket: drop it and reconnect.
      this.dropSocket(STALE_CLOSE_CODE);
      this.scheduleRetry();
    }, NET.pingIntervalMs);
  }

  private dropSocket(code: number = STALE_CLOSE_CODE): void {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close(code);
    } catch {
      // already closed
    }
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) this.deps.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private clearPing(): void {
    if (this.pingTimer !== null) this.deps.clearTimeout(this.pingTimer);
    this.pingTimer = null;
  }
}
