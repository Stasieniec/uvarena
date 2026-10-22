// Matchmaker: the pairing rules (pure) and the queue over real sockets.
import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MATCHMAKER } from "@shared/game/config";
import { CLOSE_CODES } from "@shared/protocol";
import { HEADERS, matchmakerName, type QueueSocketAttachment } from "../../src/worker/do/contracts";
import { allowedGap, pairPlayers } from "../../src/worker/do/matchmaker";
import { createMatch } from "../../src/worker/match-factory";
import { installFakes, removeFakes } from "./fake-engine";
import { matchRow, openSocket, roomStub, seedCourse, seedUser, until } from "./helpers";

beforeAll(installFakes);
afterAll(removeFakes);

const NOW = 1_000_000_000;

function entry(userId: string, rating: number, waitedSec = 0, extra: Partial<QueueSocketAttachment> = {}): QueueSocketAttachment {
  return { userId, rating, rd: 60, joinedAt: NOW - waitedSec * 1000, lastOpponent: null, ...extra };
}

describe("pairing rules", () => {
  it("widens the window with the wait and opens it fully at 45 s", () => {
    expect(allowedGap(entry("a", 1500, 0), NOW)).toBe(100);
    expect(allowedGap(entry("a", 1500, 4.9), NOW)).toBe(100);
    expect(allowedGap(entry("a", 1500, 5), NOW)).toBe(150);
    expect(allowedGap(entry("a", 1500, 44), NOW)).toBe(100 + 50 * 8);
    expect(allowedGap(entry("a", 1500, 45), NOW)).toBe(Number.POSITIVE_INFINITY);
    expect(allowedGap(entry("a", 1500, 0, { rd: 110 }), NOW)).toBe(MATCHMAKER.provisionalStartWindow);
    expect(allowedGap(entry("a", 1500, 10, { rd: 300 }), NOW)).toBe(MATCHMAKER.provisionalStartWindow + 100);
  });

  it("needs both windows to allow the gap", () => {
    const fresh = entry("a", 1500, 0);
    const waited = entry("b", 1700, 30);
    expect(pairPlayers([fresh, waited], NOW)).toEqual([]);
    expect(pairPlayers([entry("a", 1500, 20), waited], NOW)).toHaveLength(1);
    expect(pairPlayers([entry("a", 1500, 0, { rd: 200 }), entry("b", 1800, 0, { rd: 200 })], NOW)).toHaveLength(1);
  });

  it("pairs the closest players first", () => {
    const pairs = pairPlayers([entry("a", 1500), entry("b", 1580), entry("c", 1520), entry("d", 1590)], NOW);
    const ids = pairs.map(([x, y]) => [x.userId, y.userId].sort().join("+")).sort();
    expect(ids).toEqual(["a+c", "b+d"]);
  });

  it("avoids the last opponent while another candidate fits", () => {
    const a = entry("a", 1500, 0, { lastOpponent: "b" });
    const b = entry("b", 1500, 0, { lastOpponent: "a" });
    const c = entry("c", 1550, 0);
    const pairs = pairPlayers([a, b, c], NOW);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.map((p) => p.userId).sort()).not.toEqual(["a", "b"]);
    // Alone together, they play again.
    expect(pairPlayers([a, b], NOW)).toHaveLength(1);
  });

  it("never pairs a user with themselves", () => {
    expect(pairPlayers([entry("a", 1500), entry("a", 1500)], NOW)).toEqual([]);
  });
});

async function queueSocket(courseId: string, userId: string, rating = 1500, rd = 60, lastOpponent?: string) {
  const headers: Record<string, string> = { [HEADERS.rating]: String(rating), [HEADERS.rd]: String(rd) };
  if (lastOpponent) headers[HEADERS.lastOpponent] = lastOpponent;
  return openSocket(env.MATCHMAKER.getByName(matchmakerName(courseId)), userId, headers, `http://do/api/queue/ws?course=${courseId}`);
}

describe("Matchmaker queue", () => {
  it("pairs two close players, creates the ranked match and closes both sockets", async () => {
    const { courseId } = await seedCourse();
    const a = await seedUser();
    const b = await seedUser();
    const stub = env.MATCHMAKER.getByName(matchmakerName(courseId));

    const ca = await queueSocket(courseId, a, 1500);
    const status = await ca.waitFor("queue_status");
    expect(status).toMatchObject({ searching: 1, window: 100 });
    expect(await stub.searching()).toBe(1);

    const cb = await queueSocket(courseId, b, 1550);
    const ma = await ca.waitFor("matched");
    const mb = await cb.waitFor("matched");
    expect(ma.matchId).toBe(mb.matchId);
    expect((await ca.waitClosed()).code).toBe(CLOSE_CODES.normal);
    expect((await cb.waitClosed()).code).toBe(CLOSE_CODES.normal);
    const row = await matchRow(ma.matchId as string);
    expect(row).toMatchObject({ mode: "ranked", rated: 1, status: "active", course_id: courseId, player_a: a, player_b: b });
    await until(() => true, "");
    expect(await stub.searching()).toBe(0);
    await roomStub(ma.matchId as string).cancel("cancelled");
  });

  it("waits while the gap is too wide, then widens on the alarm", async () => {
    const { courseId } = await seedCourse();
    const a = await seedUser();
    const b = await seedUser();
    const stub = env.MATCHMAKER.getByName(matchmakerName(courseId));
    const ca = await queueSocket(courseId, a, 1500);
    const cb = await queueSocket(courseId, b, 1800);
    await ca.waitFor("queue_status", 2);
    expect(ca.last("queue_status")?.searching).toBe(2);
    expect(ca.of("matched")).toHaveLength(0);
    const alarm = await runInDurableObject(stub, (_i, s) => s.storage.getAlarm());
    expect(alarm).not.toBeNull();

    // 25 s of waiting: windows of 350 on both sides cover the 300 gap.
    await runInDurableObject(stub, (_i, s) => {
      for (const ws of s.getWebSockets()) {
        const att = ws.deserializeAttachment() as QueueSocketAttachment;
        ws.serializeAttachment({ ...att, joinedAt: att.joinedAt - 25_000 });
      }
    });
    await runDurableObjectAlarm(stub);
    const m = await ca.waitFor("matched");
    await cb.waitFor("matched");
    await roomStub(m.matchId as string).cancel("cancelled");
  });

  it("tells a lone searcher at 20 s that nobody else is searching", async () => {
    const { courseId } = await seedCourse();
    const a = await seedUser();
    const stub = env.MATCHMAKER.getByName(matchmakerName(courseId));
    const ca = await queueSocket(courseId, a);
    await ca.waitFor("queue_status");
    const joinedAt = await runInDurableObject(stub, (_i, s) => (s.getWebSockets()[0]!.deserializeAttachment() as QueueSocketAttachment).joinedAt);
    const alarm = await runInDurableObject(stub, (_i, s) => s.storage.getAlarm());
    expect(alarm).toBe(joinedAt + MATCHMAKER.nobodySearchingHintSec * 1000);

    await runInDurableObject(stub, (_i, s) => {
      const ws = s.getWebSockets()[0]!;
      const att = ws.deserializeAttachment() as QueueSocketAttachment;
      ws.serializeAttachment({ ...att, joinedAt: att.joinedAt - 21_000 });
    });
    await runDurableObjectAlarm(stub);
    const hint = await ca.waitFor("queue_status", 2);
    expect(hint.searching).toBe(1);
    expect(hint.waitedMs as number).toBeGreaterThanOrEqual(MATCHMAKER.nobodySearchingHintSec * 1000);
    expect(await runInDurableObject(stub, (_i, s) => s.storage.getAlarm())).toBeNull();
    ca.close();
  });

  it("updates the count when someone leaves, and a second device replaces the first", async () => {
    const { courseId } = await seedCourse();
    const a = await seedUser();
    const b = await seedUser();
    const stub = env.MATCHMAKER.getByName(matchmakerName(courseId));
    const ca = await queueSocket(courseId, a, 1000);
    const cb = await queueSocket(courseId, b, 2000);
    await ca.waitFor("queue_status", 2);
    cb.close();
    await until(() => ca.last("queue_status")?.searching === 1, "count back to 1");

    const ca2 = await queueSocket(courseId, a, 1000);
    expect((await ca.waitClosed()).code).toBe(CLOSE_CODES.replaced);
    await ca2.waitFor("queue_status");
    expect(await stub.searching()).toBe(1);
    ca2.close();
  });

  it("sends already_in_match to the busy player and keeps the other searching", async () => {
    const { courseId } = await seedCourse();
    const busy = await seedUser();
    const free = await seedUser();
    const running = await createMatch(env, { courseId, mode: "bot", rated: false, settings: { powerups: true, lectures: null }, humans: [busy], bot: { level: 1 } });

    const cf = await queueSocket(courseId, free);
    const cbusy = await queueSocket(courseId, busy);
    const err = await cbusy.waitFor("error");
    expect(err).toMatchObject({ code: "already_in_match", matchId: running.matchId });
    expect((await cbusy.waitClosed()).code).toBe(CLOSE_CODES.normal);
    await until(() => cf.last("queue_status")?.searching === 1, "free player still queued");
    expect(cf.closed).toBeNull();
    cf.close();
    await roomStub(running.matchId).cancel("cancelled");
  });

  it("hands a socket that reconnects right after its pairing the same match", async () => {
    const { courseId } = await seedCourse();
    const a = await seedUser();
    const b = await seedUser();
    const ca = await queueSocket(courseId, a);
    const cb = await queueSocket(courseId, b);
    const { matchId } = await ca.waitFor("matched");
    await cb.waitFor("matched");

    // The client had already replaced the socket that got `matched`.
    const again = await queueSocket(courseId, a);
    expect(await again.waitFor("matched")).toMatchObject({ matchId });
    expect((await again.waitClosed()).code).toBe(CLOSE_CODES.normal);

    // Once the match is over, the queue works normally again.
    await roomStub(matchId as string).cancel("cancelled");
    const later = await queueSocket(courseId, a);
    await later.waitFor("queue_status");
    expect(later.of("matched")).toHaveLength(0);
    later.close();
  });

  it("cancels a match a player cannot be told about, and keeps the other first in line", async () => {
    const { courseId } = await seedCourse();
    const gone = await seedUser();
    const waiting = await seedUser();
    const third = await seedUser();
    const stub = env.MATCHMAKER.getByName(matchmakerName(courseId));
    const cg = await queueSocket(courseId, gone, 1500);
    await cg.waitFor("queue_status");
    // Its client is gone, but the close has not reached the queue yet.
    await runInDurableObject(stub, (instance) => {
      const real = instance.deliverMatched.bind(instance);
      instance.deliverMatched = (userId, msg) => (userId === gone ? false : real(userId, msg));
    });
    const cw = await queueSocket(courseId, waiting, 1500);
    await cw.waitFor("queue_status");
    await new Promise((r) => setTimeout(r, 100));
    expect(cw.of("matched")).toHaveLength(0);
    expect(cw.closed).toBeNull();
    const row = await env.DB.prepare("SELECT id, status FROM matches WHERE player_a = ? OR player_b = ?").bind(waiting, waiting).first<{ id: string; status: string }>();
    expect(row?.status).toBe("cancelled");

    cg.close();
    await until(() => cw.last("queue_status")?.searching === 1, "only the waiting player left");
    const ct = await queueSocket(courseId, third, 1500);
    const m = await cw.waitFor("matched");
    expect((await ct.waitFor("matched")).matchId).toBe(m.matchId);
    // The waiting player kept their place: side a is the longer waiter.
    const created = await matchRow(m.matchId as string);
    expect(created).toMatchObject({ player_a: waiting, player_b: third, status: "active" });
    await roomStub(m.matchId as string).cancel("cancelled");
  });

  it("refuses a socket for another course and one without a user", async () => {
    const { courseId } = await seedCourse();
    const a = await seedUser();
    const first = await queueSocket(courseId, a);
    await first.waitFor("queue_status");
    const stub = env.MATCHMAKER.getByName(matchmakerName(courseId));
    const wrong = await openSocket(stub, a, {}, "http://do/api/queue/ws?course=other");
    expect((await wrong.waitFor("error")).code).toBe("bad_course");
    const anonymous = await openSocket(stub, null, {}, `http://do/api/queue/ws?course=${courseId}`);
    expect((await anonymous.waitClosed()).code).toBe(CLOSE_CODES.notAuthorised);
    first.close();
  });
});
