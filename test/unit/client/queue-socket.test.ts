// Queue socket: messages, ping, reconnect with backoff, final closes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NET } from "@shared/game/config";
import { CLOSE_CODES, PING } from "@shared/protocol";
import { backoffMs, openQueueSocket, queueSocketUrl } from "../../../src/client/lib/queue-socket";

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  closedWith: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code: number) {
    this.closedWith = code;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  message(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  drop(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

beforeEach(() => {
  FakeSocket.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("location", { origin: "https://game.example.com" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("queueSocketUrl", () => {
  it("uses wss on https and ws on http", () => {
    expect(queueSocketUrl("agai", "https://game.example.com")).toBe("wss://game.example.com/api/queue/ws?course=agai");
    expect(queueSocketUrl("eprm", "http://localhost:5173")).toBe("ws://localhost:5173/api/queue/ws?course=eprm");
  });
});

describe("backoffMs", () => {
  it("doubles from the initial delay up to the cap, with jitter in [0.5, 1)", () => {
    expect(backoffMs(0, 1)).toBe(NET.reconnectInitialMs);
    expect(backoffMs(0, 0)).toBe(NET.reconnectInitialMs / 2);
    expect(backoffMs(1, 1)).toBe(NET.reconnectInitialMs * 2);
    expect(backoffMs(20, 1)).toBe(NET.reconnectMaxMs);
  });
});

describe("openQueueSocket", () => {
  it("passes status messages through and pings", () => {
    const onMessage = vi.fn();
    const onClose = vi.fn();
    openQueueSocket("agai", { onMessage, onClose });
    const ws = FakeSocket.instances[0]!;
    expect(ws.url).toBe("wss://game.example.com/api/queue/ws?course=agai");
    ws.open();
    ws.message({ type: "queue_status", serverNow: 1, searching: 2, waitedMs: 3000, window: 150 });
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "queue_status", searching: 2 }));
    vi.advanceTimersByTime(NET.pingIntervalMs);
    expect(ws.sent).toEqual([PING]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores pong and garbage frames", () => {
    const onMessage = vi.fn();
    openQueueSocket("agai", { onMessage, onClose: vi.fn() });
    const ws = FakeSocket.instances[0]!;
    ws.open();
    ws.onmessage?.({ data: "pong" });
    ws.onmessage?.({ data: "{not json" });
    ws.message({ type: "nonsense", serverNow: 1 });
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("stops after matched and closes the socket", () => {
    const onClose = vi.fn();
    openQueueSocket("agai", { onMessage: vi.fn(), onClose });
    const ws = FakeSocket.instances[0]!;
    ws.open();
    ws.message({ type: "matched", serverNow: 1, matchId: "m_abcdefgh" });
    expect(onClose).toHaveBeenCalledWith(CLOSE_CODES.normal);
    expect(ws.closedWith).toBe(CLOSE_CODES.normal);
    ws.drop(1006);
    vi.advanceTimersByTime(NET.reconnectMaxMs * 2);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stops after a queue error", () => {
    const onMessage = vi.fn();
    const onClose = vi.fn();
    openQueueSocket("agai", { onMessage, onClose });
    const ws = FakeSocket.instances[0]!;
    ws.open();
    ws.message({ type: "error", serverNow: 1, code: "already_in_match", matchId: "m_running1" });
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ code: "already_in_match", matchId: "m_running1" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reconnects after an unexpected close", () => {
    const onClose = vi.fn();
    const onConnectionChange = vi.fn();
    openQueueSocket("agai", { onMessage: vi.fn(), onClose, onConnectionChange });
    FakeSocket.instances[0]!.open();
    FakeSocket.instances[0]!.drop(1006);
    expect(onConnectionChange).toHaveBeenLastCalledWith(false);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(NET.reconnectInitialMs);
    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1]!.open();
    expect(onConnectionChange).toHaveBeenLastCalledWith(true);
  });

  it("does not reconnect after a final close code", () => {
    const onClose = vi.fn();
    openQueueSocket("agai", { onMessage: vi.fn(), onClose });
    FakeSocket.instances[0]!.open();
    FakeSocket.instances[0]!.drop(CLOSE_CODES.notAuthorised);
    expect(onClose).toHaveBeenCalledWith(CLOSE_CODES.notAuthorised);
    vi.advanceTimersByTime(NET.reconnectMaxMs * 2);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("close() leaves the queue and cancels a pending reconnect", () => {
    const onClose = vi.fn();
    const s = openQueueSocket("agai", { onMessage: vi.fn(), onClose });
    FakeSocket.instances[0]!.open();
    FakeSocket.instances[0]!.drop(1006);
    s.close();
    vi.advanceTimersByTime(NET.reconnectMaxMs * 2);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    s.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
