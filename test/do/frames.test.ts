// Per-socket frame bounds in the MatchRoom and the Matchmaker.
import { env } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NET } from "@shared/game/config";
import { CLOSE_CODES } from "@shared/protocol";
import { matchmakerName } from "../../src/worker/do/contracts";
import { createMatch } from "../../src/worker/match-factory";
import { installFakes, removeFakes } from "./fake-engine";
import { openSocket, readState, roomStub, seedCourse, seedUser, uid } from "./helpers";

beforeAll(installFakes);
afterAll(removeFakes);

async function rankedMatch() {
  const { courseId } = await seedCourse();
  const a = await seedUser();
  const b = await seedUser();
  const { matchId } = await createMatch(env, { courseId, mode: "ranked", rated: true, settings: { powerups: true, lectures: null }, humans: [a, b] });
  return { a, b, stub: roomStub(matchId) };
}

describe("MatchRoom frame bounds", () => {
  it("closes a socket that floods frames, and reports the disconnect", async () => {
    const { a, b, stub } = await rankedMatch();
    const ca = await openSocket(stub, a);
    const cb = await openSocket(stub, b);
    await cb.waitFor("intro");
    for (let i = 0; i < NET.clientFrameBurst + 5; i++) ca.send({ type: "ready" });
    expect((await ca.waitClosed()).code).toBe(CLOSE_CODES.tooMany);
    const errors = ca.of("error").length;
    expect(errors).toBeLessThanOrEqual(NET.clientFrameBurst);
    await cb.waitFor("opponent_connection");
    expect((await readState(stub))?.players[0].connected).toBe(false);
    cb.close();
  });

  it("closes a socket that sends an oversized frame, without handling it", async () => {
    const { a, b, stub } = await rankedMatch();
    const ca = await openSocket(stub, a);
    const cb = await openSocket(stub, b);
    await cb.waitFor("intro");
    ca.send(JSON.stringify({ type: "surrender", pad: "x".repeat(NET.maxClientFrameBytes) }));
    expect((await ca.waitClosed()).code).toBe(CLOSE_CODES.tooBig);
    expect((await readState(stub))?.phase).not.toBe("finished");
    cb.close();
  });
});

describe("Matchmaker frame bounds", () => {
  it("closes a queue socket that sends an oversized frame", async () => {
    const { courseId } = await seedCourse();
    const stub = env.MATCHMAKER.getByName(matchmakerName(`${courseId}-${uid("f")}`));
    const c = await openSocket(stub, await seedUser(), {}, `http://do/ws?course=${courseId}`);
    await c.waitFor("queue_status");
    c.send("x".repeat(NET.maxClientFrameBytes + 1));
    expect((await c.waitClosed()).code).toBe(CLOSE_CODES.tooBig);
  });
});
