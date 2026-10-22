// Reconnecting match socket: backoff, final close codes, "Play here", wake-ups
// and the silent-socket watchdog, against a fake WebSocket and fake timers.
import { describe, expect, it } from "vitest";
import { NET } from "@shared/game/config";
import { CLOSE_CODES, PING } from "@shared/protocol";
import { MatchSocket, backoffMs, type SocketDeps, type SocketLike } from "../../../src/client/match/socket";
import type { ConnectionStatus } from "../../../src/client/match/state";

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  closedWith: number | null = null;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code ?? 1000;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(data: string) {
    this.onmessage?.({ data });
  }
  drop(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function harness() {
  let now = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;
  const sockets: FakeSocket[] = [];
  let wake: (() => void) | null = null;
  const statuses: ConnectionStatus[] = [];
  const messages: string[] = [];
  const deps: SocketDeps = {
    create: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimeout: (id) => {
      timers = timers.filter((t) => t.id !== id);
    },
    random: () => 1,
    now: () => now,
    onWake: (fn) => {
      wake = fn;
      return () => {
        wake = null;
      };
    },
  };
  const sock = new MatchSocket("ws://x/api/matches/m1/ws", { onMessage: (m) => messages.push(m.type), onStatus: (s) => statuses.push(s) }, deps);
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift();
      now = t.at;
      t.fn();
    }
    now = end;
  };
  return { sock, sockets, statuses, messages, advance, wake: () => wake?.(), last: () => sockets[sockets.length - 1]! };
}

describe("MatchSocket", () => {
  it("backs off 0.5 s doubling to 5 s", () => {
    expect([0, 1, 2, 3, 4, 5].map((n) => backoffMs(n, () => 1))).toEqual([500, 1000, 2000, 4000, 5000, 5000]);
    expect(backoffMs(0, () => 0)).toBe(250);
    expect(NET.reconnectMaxMs).toBe(5000);
  });

  it("parses frames, ignores junk and reconnects after an unexpected close", () => {
    const h = harness();
    h.sock.start();
    expect(h.statuses).toEqual(["connecting"]);
    h.last().open();
    h.last().receive(JSON.stringify({ type: "opponent_powerup", serverNow: 5, round: 1, powerup: "hermes" }));
    h.last().receive("pong");
    h.last().receive("{not json");
    expect(h.messages).toEqual(["opponent_powerup"]);
    expect(h.sock.send({ type: "surrender" })).toBe(true);
    expect(h.last().sent).toEqual([JSON.stringify({ type: "surrender" })]);

    h.last().drop(1006);
    expect(h.statuses.at(-1)).toBe("reconnecting");
    expect(h.sock.send({ type: "surrender" })).toBe(false);
    expect(h.sockets).toHaveLength(1);
    h.advance(500);
    expect(h.sockets).toHaveLength(2);
    h.last().drop(1006);
    h.advance(999);
    expect(h.sockets).toHaveLength(2);
    h.advance(1);
    expect(h.sockets).toHaveLength(3);
    h.last().open();
    expect(h.statuses.at(-1)).toBe("open");
  });

  it("stops on 4001 until Play here", () => {
    const h = harness();
    h.sock.start();
    h.last().open();
    h.last().drop(CLOSE_CODES.replaced);
    expect(h.statuses.at(-1)).toBe("replaced");
    h.advance(60000);
    h.wake();
    expect(h.sockets).toHaveLength(1);
    h.sock.reconnectNow();
    expect(h.sockets).toHaveLength(2);
    h.last().open();
    expect(h.statuses.at(-1)).toBe("open");
  });

  it("treats 4003 and 4004 as final", () => {
    for (const [code, status] of [
      [CLOSE_CODES.notAuthorised, "not_authorised"],
      [CLOSE_CODES.notFound, "not_found"],
      [CLOSE_CODES.normal, "closed"],
    ] as const) {
      const h = harness();
      h.sock.start();
      h.last().drop(code);
      h.advance(30000);
      expect(h.statuses.at(-1)).toBe(status);
      expect(h.sockets).toHaveLength(1);
    }
  });

  it("reconnects at once when the page wakes up", () => {
    const h = harness();
    h.sock.start();
    h.last().open();
    h.last().drop(1006);
    h.wake();
    expect(h.sockets).toHaveLength(2);
  });

  it("pings, and drops a socket that stays silent", () => {
    const h = harness();
    h.sock.start();
    h.last().open();
    h.advance(NET.pingIntervalMs);
    expect(h.last().sent).toEqual([PING]);
    h.last().receive("pong");
    h.advance(NET.pingIntervalMs);
    expect(h.last().sent).toEqual([PING, PING]);
    // No answer to the second ping: the socket is closed and replaced.
    h.advance(NET.pingIntervalMs);
    expect(h.sockets[0]!.closedWith).toBe(4000);
    h.advance(NET.reconnectInitialMs);
    expect(h.sockets).toHaveLength(2);
  });

  it("stop closes the socket and never reconnects", () => {
    const h = harness();
    h.sock.start();
    h.last().open();
    h.sock.stop();
    expect(h.sockets[0]!.closedWith).toBe(1000);
    h.advance(60000);
    h.wake();
    expect(h.sockets).toHaveLength(1);
  });
});
