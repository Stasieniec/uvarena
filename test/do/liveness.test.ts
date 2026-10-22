// One running match per player, rows that outlive their room, and
// finalization retries that must not overwrite newer ratings.
import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planFinalization } from "@shared/game/finalize";
import type { FinalizationPlan, MatchState } from "@shared/game/types";
import { MatchFactoryError } from "../../src/worker/do/contracts";
import { EFFECT_MAX_ATTEMPTS, ROOM_TEST_ENGINE_KEY } from "../../src/worker/do/match-room";
import { createMatch, joinLobby } from "../../src/worker/match-factory";
import { liveMatchId } from "../../src/worker/match-liveness";
import { fakeEngine, installFakes } from "./fake-engine";
import { matchRow, openSocket, readState, roomStub, seedCourse, seedUser, until } from "./helpers";

const SETTINGS = { powerups: true, lectures: null };

beforeAll(installFakes);
afterAll(installFakes);

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  return p.then(
    () => null,
    (e: unknown) => (e instanceof MatchFactoryError ? e.code : String(e)),
  );
}

/** A ranked match where `a` surrenders while every finalize attempt fails. */
async function surrenderWithFailingFinalize() {
  const { courseId } = await seedCourse();
  const a = await seedUser();
  const b = await seedUser();
  const { matchId } = await createMatch(env, { courseId, mode: "ranked", rated: true, settings: SETTINGS, humans: [a, b] });
  const stub = roomStub(matchId);
  const failing = {
    ...fakeEngine,
    planFinalization: () => {
      throw new Error("D1 down");
    },
  };
  (globalThis as Record<string, unknown>)[ROOM_TEST_ENGINE_KEY] = failing;
  const ca = await openSocket(stub, a);
  const cb = await openSocket(stub, b);
  await cb.waitFor("intro");
  ca.send({ type: "surrender" });
  await until(() => false, "the finalize attempt", 100).catch(() => undefined);
  return { courseId, a, b, matchId, stub, ca, cb };
}

describe("one running match per player", () => {
  it("concurrent creations never put one user in two matches", async () => {
    const { courseId } = await seedCourse();
    const a = await seedUser();
    const results = await Promise.allSettled([
      createMatch(env, { courseId, mode: "bot", rated: false, settings: SETTINGS, humans: [a], bot: { level: "echo" } }),
      createMatch(env, { courseId, mode: "bot", rated: false, settings: SETTINGS, humans: [a], bot: { level: 1 } }),
      createMatch(env, { courseId, mode: "bot", rated: false, settings: SETTINGS, humans: [a], bot: { level: "echo" } }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    for (const r of results) {
      if (r.status === "rejected") expect((r.reason as MatchFactoryError).code).toBe("already_in_match");
    }
    const active = await env.DB.prepare("SELECT count(*) AS n FROM matches WHERE player_a = ? AND status = 'active'").bind(a).first<{ n: number }>();
    expect(active?.n).toBe(1);
    await roomStub((ok[0] as PromiseFulfilledResult<{ matchId: string }>).value.matchId).cancel("cancelled");
  });

  it("a started private match whose D1 row still says lobby is not cancelled under its players", async () => {
    const { courseId } = await seedCourse();
    const host = await seedUser();
    const guest = await seedUser();
    const { matchId, code } = await createMatch(env, { courseId, mode: "private", rated: false, settings: SETTINGS, humans: [host] });
    await joinLobby(env, code!, guest);
    const stub = roomStub(matchId);
    const ch = await openSocket(stub, host);
    const cg = await openSocket(stub, guest);
    ch.send({ type: "ready" });
    cg.send({ type: "ready" });
    await cg.waitFor("intro");
    // The `started` write was lost.
    await env.DB.prepare("UPDATE matches SET status = 'lobby' WHERE id = ?").bind(matchId).run();

    expect(await codeOf(createMatch(env, { courseId, mode: "bot", rated: false, settings: SETTINGS, humans: [guest], bot: { level: "echo" } }))).toBe(
      "already_in_match",
    );
    expect((await matchRow(matchId))?.status).toBe("lobby");
    expect((await readState(stub))?.phase).not.toBe("cancelled");
    ch.close();
    cg.close();
  });
});

describe("finalization and busy players", () => {
  it("a player waits for the last match's result, and a room that gave up frees them with a void row", async () => {
    const { courseId, a, matchId, stub, ca, cb } = await surrenderWithFailingFinalize();
    try {
      expect((await readState(stub))?.phase).toBe("finished");
      // The result is not in D1 yet: no new match on stale ratings.
      expect(await codeOf(createMatch(env, { courseId, mode: "bot", rated: false, settings: SETTINGS, humans: [a], bot: { level: "echo" } }))).toBe(
        "already_in_match",
      );
      expect(await liveMatchId(env, a)).toBe(matchId);

      // The last attempt fails too: the room gives up and closes the row.
      await runInDurableObject(stub, async (_i, st) => st.storage.put("effects", [{ kind: "finalize", attempts: EFFECT_MAX_ATTEMPTS - 1 }]));
      expect(await runDurableObjectAlarm(stub)).toBe(true);
      expect(await matchRow(matchId)).toMatchObject({ status: "void", end_reason: "void", rating_a_after: null });
      expect(await liveMatchId(env, a)).toBeNull();

      const next = await createMatch(env, { courseId, mode: "bot", rated: false, settings: SETTINGS, humans: [a], bot: { level: "echo" } });
      await roomStub(next.matchId).cancel("cancelled");
    } finally {
      installFakes();
      ca.close();
      cb.close();
    }
  });

  it("a row the room could not close is closed by the next busy check", async () => {
    const { courseId, a, matchId, stub, ca, cb } = await surrenderWithFailingFinalize();
    try {
      // Gave up, and the room's own close failed: D1 still says active.
      await runInDurableObject(stub, async (_i, st) => st.storage.put("effects", []));
      expect((await matchRow(matchId))?.status).toBe("active");
      expect(await liveMatchId(env, a)).toBeNull();
      expect((await matchRow(matchId))?.status).toBe("void");
      const next = await createMatch(env, { courseId, mode: "bot", rated: false, settings: SETTINGS, humans: [a], bot: { level: "echo" } });
      await roomStub(next.matchId).cancel("cancelled");
    } finally {
      installFakes();
      ca.close();
      cb.close();
    }
  });

  it("a retried finalization plans again from the current rows, so a newer match's rating survives", async () => {
    const { courseId, a, b, matchId, stub, ca, cb } = await surrenderWithFailingFinalize();
    try {
      // The plan computed before the failure, from the rows as they were then.
      const state = (await readState(stub)) as MatchState;
      const ctx = { now: Date.now(), ratings: { [a]: { ranked: null, bot: null, casual: null }, [b]: { ranked: null, bot: null, casual: null } }, playerCourse: { [a]: null, [b]: null }, recentAnswers: { [a]: [], [b]: [] }, pairCount: 0 };
      const stale: FinalizationPlan = planFinalization(state, ctx);
      await runInDurableObject(stub, async (_i, st) => st.storage.put("plan", stale));

      // Meanwhile a newer match wrote b's ranked row.
      await env.DB.prepare(
        `INSERT INTO ratings (user_id, course_id, kind, rating, rd, vol, n, played, won, lost, updated_at)
         VALUES (?, ?, 'ranked', 1700, 120, 0.06, 0, 7, 5, 2, ?)`,
      )
        .bind(b, courseId, Date.now())
        .run();

      installFakes();
      expect(await runDurableObjectAlarm(stub)).toBe(true);
      expect((await matchRow(matchId))?.status).toBe("finished");
      const row = await env.DB.prepare("SELECT rating, played, won FROM ratings WHERE user_id = ? AND course_id = ? AND kind = 'ranked'")
        .bind(b, courseId)
        .first<{ rating: number; played: number; won: number }>();
      // b won from 1700 with 7 played before: the newer match's values are the base.
      expect(row?.played).toBe(8);
      expect(row?.won).toBe(6);
      expect(row!.rating).toBeGreaterThan(1700);
      expect((await readState(stub))?.endSummaries?.[1].ranked?.before).toBe(1700);
    } finally {
      installFakes();
      ca.close();
      cb.close();
    }
  });
});
