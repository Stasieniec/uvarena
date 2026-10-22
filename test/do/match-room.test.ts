// MatchRoom shell against the scripted fake engine (test/do/fake-engine.ts):
// sockets, takeover, alarms, effects, D1 writes, finalization idempotency,
// rematch and cleanup. The duel itself is covered in duel.test.ts with the
// real engine.
import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MATCH } from "@shared/game/config";
import { CLOSE_CODES } from "@shared/protocol";
import { createMatch } from "../../src/worker/match-factory";
import { ROOM_TEST_ENGINE_KEY } from "../../src/worker/do/match-room";
import { fakeEngine, installFakes, removeFakes } from "./fake-engine";
import { fastForward, matchRow, openSocket, patchState, readAlarm, readState, roomStub, seedCourse, seedUser, until } from "./helpers";

const SETTINGS = { powerups: true, lectures: null };

beforeAll(installFakes);
afterAll(removeFakes);

async function ranked() {
  const { courseId } = await seedCourse();
  const a = await seedUser();
  const b = await seedUser();
  const { matchId } = await createMatch(env, { courseId, mode: "ranked", rated: true, settings: SETTINGS, humans: [a, b] });
  return { courseId, a, b, matchId, stub: roomStub(matchId) };
}

describe("MatchRoom sockets", () => {
  it("sends a snapshot on connect and starts once both are in", async () => {
    const { a, b, stub } = await ranked();
    const ca = await openSocket(stub, a);
    const snap = await ca.waitFor("snapshot");
    expect(snap.phase).toBe("lobby");
    expect((snap.you as { userId: string }).userId).toBe(a);

    const cb = await openSocket(stub, b);
    await cb.waitFor("snapshot");
    await ca.waitFor("intro");
    await cb.waitFor("intro");
    expect((await readState(stub))?.phase).toBe("intro");
    ca.close();
    cb.close();
  });

  it("refuses non-players with 4003 and unknown matches with 4004", async () => {
    const { stub } = await ranked();
    const stranger = await openSocket(stub, "someone-else");
    expect((await stranger.waitClosed()).code).toBe(CLOSE_CODES.notAuthorised);

    const anonymous = await openSocket(stub, null);
    expect((await anonymous.waitClosed()).code).toBe(CLOSE_CODES.notAuthorised);

    const missing = await openSocket(roomStub(`missing-${crypto.randomUUID()}`), "x");
    expect((await missing.waitClosed()).code).toBe(CLOSE_CODES.notFound);
  });

  it("refuses a non-upgrade request", async () => {
    const res = await roomStub(`plain-${crypto.randomUUID()}`).fetch("http://do/ws");
    expect(res.status).toBe(426);
  });

  it("moves a player to a second device without a disconnect", async () => {
    const { a, b, stub } = await ranked();
    const ca = await openSocket(stub, a);
    const cb = await openSocket(stub, b);
    await cb.waitFor("intro");

    const ca2 = await openSocket(stub, a);
    await ca2.waitFor("snapshot");
    const closed = await ca.waitClosed();
    expect(closed.code).toBe(CLOSE_CODES.replaced);
    // Give a stray close event time to arrive, then check nobody saw a disconnect.
    await new Promise((r) => setTimeout(r, 100));
    expect(cb.of("opponent_connection").filter((m) => m.connected === false)).toHaveLength(0);
    expect((await readState(stub))?.players[0].connected).toBe(true);
    const tagged = await runInDurableObject(stub, (_i, state) => state.getWebSockets(a).filter((w) => w.readyState === WebSocket.OPEN).length);
    expect(tagged).toBe(1);
    ca2.close();
    cb.close();
  });

  it("reports a disconnect to the opponent and a reconnect gets a snapshot", async () => {
    const { a, b, stub } = await ranked();
    const ca = await openSocket(stub, a);
    const cb = await openSocket(stub, b);
    await cb.waitFor("intro");

    ca.close();
    // B connected second, so its first opponent_connection is the disconnect.
    const gone = await cb.waitFor("opponent_connection", 1);
    expect(gone.connected).toBe(false);
    expect(typeof gone.forfeitAt).toBe("number");

    const back = await openSocket(stub, a);
    const snap = await back.waitFor("snapshot");
    expect(snap.phase).not.toBe("lobby");
    const returned = await cb.waitFor("opponent_connection", 2);
    expect(returned.connected).toBe(true);
    back.close();
    cb.close();
  });

  it("answers bad frames with bad_message", async () => {
    const { a, stub } = await ranked();
    const ca = await openSocket(stub, a);
    await ca.waitFor("snapshot");
    ca.send("not json");
    const err = await ca.waitFor("error");
    expect(err.code).toBe("bad_message");
    ca.send({ type: "answer", round: 1, answer: { kind: "options", ids: ["bad id!"] } });
    expect((await ca.waitFor("error", 2)).code).toBe("bad_message");
    ca.close();
  });
});

describe("MatchRoom alarms", () => {
  it("keeps the alarm on the engine's next deadline", async () => {
    const { a, b, stub } = await ranked();
    const state = await readState(stub);
    expect(await readAlarm(stub)).toBe(fakeEngine.nextDeadline(state!));

    const ca = await openSocket(stub, a);
    const cb = await openSocket(stub, b);
    await cb.waitFor("intro");
    const started = await readState(stub);
    expect(started?.phase).toBe("intro");
    expect(await readAlarm(stub)).toBe(started?.phaseEndsAt);

    // Ticks are idempotent: a second alarm with nothing due changes nothing.
    await fastForward(stub);
    const afterTick = await readState(stub);
    expect(afterTick?.round).toBe(1);
    await runInDurableObject(stub, async (_i, s) => s.storage.setAlarm(Date.now()));
    await runDurableObjectAlarm(stub);
    expect((await readState(stub))?.round).toBe(1);
    ca.close();
    cb.close();
  });

  it("cancels a no-show, closes the D1 row and sends match_end", async () => {
    const { a, matchId, stub } = await ranked();
    const ca = await openSocket(stub, a);
    await ca.waitFor("snapshot");
    expect((await readState(stub))?.noShowAt).not.toBeNull();

    await fastForward(stub);
    const end = await ca.waitFor("match_end");
    expect(end.result).toBe("cancelled");
    expect(end.reason).toBe("no_show");
    expect(end.ranked).toBeNull();
    const row = await matchRow(matchId);
    expect(row?.status).toBe("cancelled");
    expect(row?.end_reason).toBe("no_show");
    expect(await readAlarm(stub)).toBe((await readState(stub))?.cleanupAt);
    ca.close();
  });

  it("deletes its storage at cleanup and closes sockets", async () => {
    const { a, stub } = await ranked();
    const ca = await openSocket(stub, a);
    await ca.waitFor("snapshot");
    await fastForward(stub); // no-show
    await ca.waitFor("match_end");
    await fastForward(stub); // cleanup
    expect(await readState(stub)).toBeNull();
    expect(await readAlarm(stub)).toBeNull();
    expect((await ca.waitClosed()).code).toBe(CLOSE_CODES.normal);
    expect(await stub.summary()).toEqual({ phase: "cancelled", players: [] });
  });
});

describe("MatchRoom finalization", () => {
  it("finalizes a surrender once, even when the alarm runs twice", async () => {
    const { a, b, matchId, courseId, stub } = await ranked();
    const ca = await openSocket(stub, a);
    const cb = await openSocket(stub, b);
    await cb.waitFor("intro");
    expect((await matchRow(matchId))?.started_at).not.toBeNull();

    ca.send({ type: "surrender" });
    const endA = await ca.waitFor("match_end");
    const endB = await cb.waitFor("match_end");
    expect(endA.result).toBe("loss");
    expect(endB.result).toBe("win");
    expect(endA.ranked).not.toBeNull();
    expect((endB.ranked as { after: number }).after).toBeGreaterThan((endB.ranked as { before: number }).before);

    const s = await readState(stub);
    expect(s?.finalized).toBe(true);
    expect(s?.endSummaries).not.toBeNull();

    // A retried alarm and a duplicate finalize effect write nothing twice.
    await runInDurableObject(stub, async (_i, st) => {
      await st.storage.put("effects", [{ kind: "finalize", attempts: 0 }]);
      await st.storage.put("state", { ...(await st.storage.get("state"))!, finalized: false });
      await st.storage.setAlarm(Date.now());
    });
    await runDurableObjectAlarm(stub);
    await runInDurableObject(stub, async (_i, st) => st.storage.setAlarm(Date.now()));
    await runDurableObjectAlarm(stub);

    const fin = await env.DB.prepare("SELECT count(*) AS n FROM match_finalizations WHERE match_id = ?").bind(matchId).first<{ n: number }>();
    expect(fin?.n).toBe(1);
    const played = await env.DB.prepare("SELECT user_id, played, won, lost, surrendered FROM ratings WHERE course_id = ? AND kind = 'ranked'")
      .bind(courseId)
      .all<{ user_id: string; played: number; won: number; lost: number; surrendered: number }>();
    const byUser = Object.fromEntries(played.results.map((r) => [r.user_id, r]));
    expect(byUser[a]).toMatchObject({ played: 1, lost: 1, surrendered: 1 });
    expect(byUser[b]).toMatchObject({ played: 1, won: 1 });
    const row = await matchRow(matchId);
    expect(row).toMatchObject({ status: "finished", winner: "b", end_reason: "surrender" });
    ca.close();
    cb.close();
  });

  it("retries a failed finalization on the alarm and sends match_end after it lands", async () => {
    const { a, b, matchId, stub } = await ranked();
    let failures = 1;
    const flaky = {
      ...fakeEngine,
      planFinalization: (...args: Parameters<typeof fakeEngine.planFinalization>) => {
        if (failures-- > 0) throw new Error("D1 hiccup");
        return fakeEngine.planFinalization(...args);
      },
    };
    (globalThis as Record<string, unknown>)[ROOM_TEST_ENGINE_KEY] = flaky;
    try {
      const ca = await openSocket(stub, a);
      const cb = await openSocket(stub, b);
      await cb.waitFor("intro");
      cb.send({ type: "surrender" });
      await until(() => failures <= 0, "first attempt");
      await new Promise((r) => setTimeout(r, 50));
      expect(ca.of("match_end")).toHaveLength(0);
      const pending = await runInDurableObject(stub, async (_i, st) => st.storage.get<unknown[]>("effects"));
      expect(pending).toHaveLength(1);
      const alarm = await readAlarm(stub);
      expect(alarm).not.toBeNull();
      expect(alarm!).toBeLessThan((await readState(stub))!.cleanupAt!);

      await runDurableObjectAlarm(stub);
      expect((await ca.waitFor("match_end")).result).toBe("win");
      expect((await matchRow(matchId))?.status).toBe("finished");
      ca.close();
      cb.close();
    } finally {
      installFakes();
    }
  });

  it("abandons after the forfeit time and voids when both are gone", async () => {
    const one = await ranked();
    const ca = await openSocket(one.stub, one.a);
    const cb = await openSocket(one.stub, one.b);
    await cb.waitFor("intro");
    cb.close();
    await ca.waitFor("opponent_connection", 2);
    expect(ca.last("opponent_connection")?.connected).toBe(false);
    await patchState(one.stub, (s) => {
      s.players[1]!.disconnectedSince = Date.now() - MATCH.forfeitMs - 1;
      s.phaseEndsAt = Date.now() + 60000;
    });
    await runDurableObjectAlarm(one.stub);
    const end = await ca.waitFor("match_end");
    expect(end).toMatchObject({ result: "win", reason: "abandon" });
    ca.close();

    const two = await ranked();
    const da = await openSocket(two.stub, two.a);
    const db = await openSocket(two.stub, two.b);
    await db.waitFor("intro");
    da.close();
    db.close();
    await new Promise((r) => setTimeout(r, 100));
    expect((await readState(two.stub))?.players.every((p) => p?.connected === false)).toBe(true);
    await patchState(two.stub, (s) => {
      for (const p of s.players) p!.disconnectedSince = Date.now() - MATCH.forfeitMs - 1;
      s.phaseEndsAt = Date.now() + 60000;
    });
    await runDurableObjectAlarm(two.stub);
    const s = await readState(two.stub);
    expect(s?.result?.reason).toBe("void");
    expect(s?.finalized).toBe(true);
    expect((await matchRow(two.matchId))?.status).toBe("void");
  });
});

describe("MatchRoom private lobby", () => {
  it("joins by code, readies, starts and rematches", async () => {
    const { courseId } = await seedCourse();
    const host = await seedUser();
    const guest = await seedUser();
    const { matchId, code } = await createMatch(env, { courseId, mode: "private", rated: true, settings: SETTINGS, humans: [host] });
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const stub = roomStub(matchId);
    expect((await matchRow(matchId))?.status).toBe("lobby");

    const ch = await openSocket(stub, host);
    const lobbySnap = await ch.waitFor("snapshot");
    expect(lobbySnap.joinCode).toBe(code);
    expect(lobbySnap.opponent).toBeNull();

    const { joinLobby } = await import("../../src/worker/match-factory");
    expect(await joinLobby(env, code!.toLowerCase(), guest)).toEqual({ matchId });
    expect((await matchRow(matchId))?.player_b).toBe(guest);
    expect((await readState(stub))?.questions.length).toBe(MATCH.questionsPerMatch);
    await ch.waitFor("lobby");

    const cg = await openSocket(stub, guest);
    await cg.waitFor("snapshot");
    ch.send({ type: "ready" });
    cg.send({ type: "ready" });
    await ch.waitFor("intro");
    expect((await matchRow(matchId))?.status).toBe("active");

    cg.send({ type: "surrender" });
    await ch.waitFor("match_end");
    await cg.waitFor("match_end");
    ch.send({ type: "rematch" });
    const offered = await cg.waitFor("rematch");
    expect(offered).toMatchObject({ state: "offered", by: "opponent" });
    cg.send({ type: "rematch" });
    const accepted = await ch.waitFor("rematch");
    const acceptedG = await cg.waitFor("rematch", 2);
    expect(accepted.state).toBe("accepted");
    expect(accepted.by).toBe("opponent");
    expect(acceptedG.by).toBe("you");
    const newId = accepted.matchId as string;
    expect(newId).toBe(acceptedG.matchId);
    const newRow = await matchRow(newId);
    expect(newRow).toMatchObject({ mode: "private", player_a: host, player_b: guest, status: "active", join_code: null });
    expect((await readState(stub))?.rematchMatchId).toBe(newId);
    ch.close();
    cg.close();
    await roomStub(newId).cancel("cancelled");
  });

  it("expires an unjoined lobby", async () => {
    const { courseId } = await seedCourse();
    const host = await seedUser();
    const { matchId } = await createMatch(env, { courseId, mode: "private", rated: false, settings: SETTINGS, humans: [host] });
    const stub = roomStub(matchId);
    expect(await readAlarm(stub)).toBe((await readState(stub))?.lobbyExpiresAt);
    await fastForward(stub);
    expect((await readState(stub))?.result?.reason).toBe("expired");
    expect(await matchRow(matchId)).toMatchObject({ status: "cancelled", end_reason: "expired" });
    expect(await stub.join({ userId: "x", name: "x", avatarUrl: null, loadout: [], botRating: null, botRatingN: 0, ranked: null }, [])).toBe(
      "expired",
    );
  });

  it("reports full and keeps init idempotent", async () => {
    const { courseId } = await seedCourse();
    const host = await seedUser();
    const { matchId } = await createMatch(env, { courseId, mode: "private", rated: false, settings: SETTINGS, humans: [host] });
    const stub = roomStub(matchId);
    const before = await readState(stub);
    await stub.init({ ...({} as Parameters<typeof stub.init>[0]), matchId });
    expect(await readState(stub)).toEqual(before);

    const p = (userId: string) => ({ userId, name: userId, avatarUrl: null, loadout: [], botRating: null, botRatingN: 0, ranked: null });
    expect(await stub.join(p("guest-1"), before!.questions)).toBe("ok");
    expect(await stub.join(p("guest-1"), before!.questions)).toBe("ok");
    expect(await stub.join(p("guest-2"), before!.questions)).toBe("full");
    expect(await stub.summary()).toEqual({ phase: "lobby", players: [host, "guest-1"] });
    await stub.cancel("cancelled");
  });
});

describe("MatchRoom bot match", () => {
  it("drops messages to the bot side and plays with one socket", async () => {
    const { courseId } = await seedCourse();
    const me = await seedUser();
    const { matchId } = await createMatch(env, { courseId, mode: "bot", rated: false, settings: SETTINGS, humans: [me], bot: { level: 1 } });
    const stub = roomStub(matchId);
    const row = await matchRow(matchId);
    expect(row).toMatchObject({ status: "active", bot_level: 1, bot_rating: 1050, player_b: null, rated: 0 });
    const c = await openSocket(stub, me);
    await c.waitFor("intro");
    const s = await readState(stub);
    expect(s?.players[1]?.kind).toBe("bot");
    c.send({ type: "surrender" });
    expect((await c.waitFor("match_end")).result).toBe("loss");
    // Bots accept rematches at once.
    c.send({ type: "rematch" });
    const accepted = await c.waitFor("rematch");
    expect(accepted).toMatchObject({ state: "accepted", by: "you" });
    expect(await matchRow(accepted.matchId as string)).toMatchObject({ mode: "bot", bot_level: 1, player_a: me });
    c.close();
    await roomStub(accepted.matchId as string).cancel("cancelled");
  });
});
