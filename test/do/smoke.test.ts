// Scaffold smoke test (workerd, no isolation): a WebSocket to the MatchRoom
// stub opens, is tagged with the user id, and gets "pong" for "ping" from the
// runtime's auto-response.
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { HEADERS } from "../../src/worker/do/contracts";
import type { MatchRoom } from "../../src/worker/do/match-room";
import { PING, PONG } from "@shared/protocol";

function nextMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    ws.addEventListener("message", (e) => resolve(String(e.data)), { once: true });
    ws.addEventListener("close", () => reject(new Error("closed")), { once: true });
  });
}

describe("durable object scaffold", () => {
  it("accepts a WebSocket and auto-answers ping", async () => {
    const stub = env.MATCH_ROOM.getByName(`smoke-${crypto.randomUUID()}`);
    const res = await stub.fetch("http://do/ws", {
      headers: { Upgrade: "websocket", [HEADERS.userId]: "user-smoke" },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket;
    expect(ws).toBeTruthy();
    ws!.accept();

    const reply = nextMessage(ws!);
    ws!.send(PING);
    expect(await reply).toBe(PONG);

    const tagged = await runInDurableObject(stub, (_instance: MatchRoom, state) => state.getWebSockets("user-smoke").length);
    expect(tagged).toBe(1);

    ws!.close(1000, "done");
  });

  it("refuses a non-upgrade request", async () => {
    const stub = env.MATCH_ROOM.getByName(`smoke-${crypto.randomUUID()}`);
    const res = await stub.fetch("http://do/ws");
    expect(res.status).toBe(426);
  });
});
