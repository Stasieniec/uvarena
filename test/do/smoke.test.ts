// Smoke test (workerd, no isolation): a WebSocket to a MatchRoom with a match
// opens, is tagged with the user id, and gets "pong" for "ping" from the
// runtime's auto-response.
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PING, PONG } from "@shared/protocol";
import { createMatch } from "../../src/worker/match-factory";
import { installFakes, removeFakes } from "./fake-engine";
import { openSocket, roomStub, seedCourse, seedUser, until } from "./helpers";

beforeAll(installFakes);
afterAll(removeFakes);

describe("durable object scaffold", () => {
  it("accepts a WebSocket and auto-answers ping", async () => {
    const { courseId } = await seedCourse();
    const userId = await seedUser();
    const { matchId } = await createMatch(env, {
      courseId,
      mode: "bot",
      rated: false,
      settings: { powerups: true, lectures: null },
      humans: [userId],
      bot: { level: 1 },
    });
    const stub = roomStub(matchId);
    const client = await openSocket(stub, userId);

    let pong = false;
    client.ws.addEventListener("message", (e) => {
      if (String(e.data) === PONG) pong = true;
    });
    client.ws.send(PING);
    await until(() => pong, "pong");

    const tagged = await runInDurableObject(stub, (_instance, state) => state.getWebSockets(userId).length);
    expect(tagged).toBe(1);
    client.close();
    await stub.cancel("cancelled");
  });

  it("refuses a non-upgrade request", async () => {
    const stub = env.MATCH_ROOM.getByName(`smoke-${crypto.randomUUID()}`);
    const res = await stub.fetch("http://do/ws");
    expect(res.status).toBe(426);
  });
});
