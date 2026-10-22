// The match and queue socket routes: upgrade and Origin checks, final close
// codes for refused sockets, membership, and forwarding to the MatchRoom with
// a user id the client cannot spoof.
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { call, insertMatch, signUp } from "./helpers";

const UPGRADE = { Upgrade: "websocket" };

/** Opens a socket from an upgrade response and resolves with the first frame and close event. */
async function openSocket(res: Response): Promise<{ ws: WebSocket; frames: string[]; closed: Promise<{ code: number; reason: string }> }> {
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  const frames: string[] = [];
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    ws.addEventListener("close", (e) => resolve({ code: e.code, reason: e.reason }));
  });
  ws.addEventListener("message", (e) => {
    frames.push(String(e.data));
  });
  ws.accept();
  return { ws, frames, closed };
}

describe("GET /matches/:id/ws", () => {
  it("needs an upgrade and an allowed Origin", async () => {
    const s = await signUp("wsplain");
    expect((await call("/api/matches/match_wstest01/ws", { cookie: s, origin: "http://localhost" })).status).toBe(426);
    expect((await call("/api/matches/match_wstest01/ws", { cookie: s, headers: UPGRADE })).status).toBe(403);
    expect((await call("/api/matches/match_wstest01/ws", { cookie: s, headers: UPGRADE, origin: "https://evil.example" })).status).toBe(403);
  });

  it("closes with 4003 when signed out or not a player, 4004 for an unknown match", async () => {
    const a = await signUp("wsowner");
    const stranger = await signUp("wsstranger");
    await insertMatch({ id: "match_wstest02", player_a: a.userId, status: "active", ended_at: null, winner: null });
    const open = (cookie?: string, id = "match_wstest02") => call(`/api/matches/${id}/ws`, { cookie, headers: UPGRADE, origin: "http://localhost:4173" });

    const signedOut = await openSocket(await open());
    expect((await signedOut.closed).code).toBe(4003);
    const notPlayer = await openSocket(await open(stranger.cookie));
    expect((await notPlayer.closed).code).toBe(4003);
    const unknown = await openSocket(await open(a.cookie, "match_nothere1"));
    expect((await unknown.closed).code).toBe(4004);
  });

  it("forwards a player to the MatchRoom with the authenticated user id, ignoring a spoofed one", async () => {
    const a = await signUp("wsplayer");
    const b = await signUp("wsvictim");
    await insertMatch({ id: "match_wstest03", player_a: a.userId, player_b: b.userId, status: "active", ended_at: null, winner: null });
    const res = await call("/api/matches/match_wstest03/ws", {
      cookie: a,
      headers: { ...UPGRADE, "x-user-id": b.userId },
      origin: "http://localhost:5173",
    });
    const { ws } = await openSocket(res);
    const stub = env.MATCH_ROOM.getByName("match_wstest03");
    const tagged = await runInDurableObject(stub, (_instance, state) => ({
      a: state.getWebSockets(a.userId).length,
      b: state.getWebSockets(b.userId).length,
    }));
    expect(tagged).toEqual({ a: 1, b: 0 });
    ws.close(1000, "done");
  });
});

describe("GET /queue/ws", () => {
  it("refuses a player with a running match, with its id", async () => {
    const a = await signUp("queuebusy");
    await insertMatch({ id: "match_qbusy001", player_a: a.userId, status: "active", ended_at: null, winner: null });
    const res = await call("/api/queue/ws?course=agai", { cookie: a, headers: UPGRADE, origin: "http://localhost" });
    const { frames, closed } = await openSocket(res);
    expect((await closed).code).toBe(1000);
    expect(JSON.parse(frames[0]!)).toMatchObject({ type: "error", code: "already_in_match", matchId: "match_qbusy001" });
  });

  it("refuses an unknown course and a signed-out user", async () => {
    const a = await signUp("queuebad");
    const bad = await openSocket(await call("/api/queue/ws?course=zzz", { cookie: a, headers: UPGRADE, origin: "http://localhost" }));
    expect((await bad.closed).code).toBe(4004);
    expect(JSON.parse(bad.frames[0]!)).toMatchObject({ type: "error", code: "bad_course" });
    const out = await openSocket(await call("/api/queue/ws?course=agai", { headers: UPGRADE, origin: "http://localhost" }));
    expect((await out.closed).code).toBe(4003);
  });
});
