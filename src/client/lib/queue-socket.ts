// The ranked queue WebSocket (/api/queue/ws?course=). Sends "ping" every
// NET.pingIntervalMs. Reconnects with backoff on any close that is not final;
// stops after `matched`, an `error`, a final close code, or close().
import { NET } from "@shared/game/config";
import { CLOSE_CODES, FINAL_CLOSE_CODES, PING, PONG, parseQueueServerMessage, type QueueServerMessage } from "@shared/protocol";
import { endpoints } from "@shared/api-schemas";

export interface QueueSocketHandlers {
  onMessage(msg: QueueServerMessage): void;
  /** The socket closed and will not reconnect (matched, error, or left). */
  onClose(code: number): void;
  /** Connection state, for a "Reconnecting" hint. Optional. */
  onConnectionChange?(connected: boolean): void;
}

export interface QueueSocket {
  /** Leaves the queue. */
  close(): void;
}

/** Reconnect delay for the n-th consecutive failure (0-based), with jitter in [0.5, 1) of the step. */
export function backoffMs(attempt: number, random: number = Math.random()): number {
  const step = Math.min(NET.reconnectMaxMs, NET.reconnectInitialMs * 2 ** attempt);
  return Math.round(step * (0.5 + 0.5 * random));
}

/** ws:// or wss:// URL of the queue socket for this origin. */
export function queueSocketUrl(courseId: string, origin: string): string {
  const u = new URL(endpoints.queueSocket.path, origin);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.searchParams.set("course", courseId);
  return u.toString();
}

interface LocationLike {
  origin: string;
}

interface DocumentLike {
  visibilityState: string;
  addEventListener(type: "visibilitychange", fn: () => void): void;
  removeEventListener(type: "visibilitychange", fn: () => void): void;
}

export function openQueueSocket(courseId: string, handlers: QueueSocketHandlers): QueueSocket {
  const g = globalThis as { location?: LocationLike; document?: DocumentLike };
  const url = queueSocketUrl(courseId, g.location?.origin ?? "http://localhost");
  let ws: WebSocket | null = null;
  let done = false;
  let attempt = 0;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const stopTimers = () => {
    if (pingTimer !== undefined) clearInterval(pingTimer);
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    pingTimer = undefined;
    retryTimer = undefined;
  };

  const finish = (code: number) => {
    if (done) return;
    done = true;
    stopTimers();
    g.document?.removeEventListener("visibilitychange", onVisible);
    if (ws && ws.readyState <= 1) ws.close(CLOSE_CODES.normal);
    handlers.onClose(code);
  };

  const connect = () => {
    if (done) return;
    retryTimer = undefined;
    const socket = new WebSocket(url);
    ws = socket;
    socket.onopen = () => {
      if (ws !== socket) return;
      attempt = 0;
      handlers.onConnectionChange?.(true);
      pingTimer = setInterval(() => {
        if (socket.readyState === 1) socket.send(PING);
      }, NET.pingIntervalMs);
    };
    socket.onmessage = (ev: { data: unknown }) => {
      if (ws !== socket || done || typeof ev.data !== "string" || ev.data === PONG) return;
      const msg = parseQueueServerMessage(ev.data);
      if (!msg) return;
      handlers.onMessage(msg);
      if (msg.type === "matched" || msg.type === "error") finish(CLOSE_CODES.normal);
    };
    socket.onclose = (ev: { code: number }) => {
      if (ws !== socket || done) return;
      if (pingTimer !== undefined) clearInterval(pingTimer);
      pingTimer = undefined;
      handlers.onConnectionChange?.(false);
      if (FINAL_CLOSE_CODES.includes(ev.code)) {
        finish(ev.code);
        return;
      }
      retryTimer = setTimeout(connect, backoffMs(attempt));
      attempt += 1;
    };
  };

  function onVisible() {
    if (done || g.document?.visibilityState !== "visible") return;
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer);
      connect();
    }
  }

  g.document?.addEventListener("visibilitychange", onVisible);
  connect();

  return {
    close() {
      finish(CLOSE_CODES.normal);
    },
  };
}
