// Full duels through the MatchRoom with the REAL engine: two sockets, alarms
// fired with runDurableObjectAlarm, reconnects, abandon, bot matches, the
// answer-leak scan and the D1 rows finalization leaves behind.
//
import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { MatchState, Side } from "@shared/game/types";
import { createMatch } from "../../src/worker/match-factory";
import { removeFakes } from "./fake-engine";
import { CLOSE_CODES } from "@shared/protocol";
import { type Client, fastForward, matchRow, openSocket, readAlarm, readState, roomStub, seedCourse, seedUser } from "./helpers";

const SETTINGS = { powerups: true, lectures: null };
const MAX_STEPS = 400;

beforeAll(removeFakes);

type Frame = Record<string, unknown>;
/** Fields where the receiver's own ids legitimately appear before the reveal. */
const SKIP_FIELDS = new Set(["options", "targets", "yourAnswer", "hidden", "lastReveal", "result"]);
const SECRET_FIELDS = new Set(["key", "yourCorrect", "opponentCorrect", "correct"]);

/** Any key id, or a correctness field, anywhere in a frame outside the receiver's own fields. */
function leaks(value: unknown, keyIds: ReadonlySet<string>): string | null {
  if (typeof value === "string") return keyIds.has(value) ? `key id ${value}` : null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const hit = leaks(v, keyIds);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (SKIP_FIELDS.has(k)) continue;
      if (SECRET_FIELDS.has(k)) return `field ${k}`;
      const hit = leaks(v, keyIds);
      if (hit) return hit;
    }
  }
  return null;
}

/** The current question's key in one side's opaque ids, and one wrong opaque id. */
function keyFor(state: MatchState, side: Side): { right: string[]; wrong: string } {
  const q = state.q!;
  const key = q.question.key;
  if (key.kind !== "options") throw new Error("fixture questions are single choice");
  const map = q.idMap[side];
  const right = Object.keys(map).filter((opaque) => key.ids.includes(map[opaque]!));
  const wrong = Object.keys(map).find((opaque) => !key.ids.includes(map[opaque]!))!;
  return { right, wrong };
}

/**
 * Records, per side, the key ids of each round as soon as its question is on
 * screen, and checks every frame that arrived before that round's reveal.
 */
function leakChecker(clients: [Client, Client]) {
  const keys: [Map<number, Set<string>>, Map<number, Set<string>>] = [new Map(), new Map()];
  return {
    remember(state: MatchState) {
      if (!state.q) return;
      for (const side of [0, 1] as Side[]) keys[side].set(state.round, new Set(keyFor(state, side).right));
    },
    check() {
      for (const side of [0, 1] as Side[]) {
        let round = 0;
        let revealed = true;
        for (const frame of clients[side].frames as Frame[]) {
          if (frame.type === "question") {
            round = frame.round as number;
            revealed = false;
          }
          if (frame.type === "reveal") revealed = true;
          if (revealed || frame.type === "reveal") continue;
          const ids = keys[side].get(round);
          if (!ids) continue;
          const hit = leaks(frame, ids);
          expect(hit, `${frame.type} to side ${side} in round ${round}`).toBeNull();
        }
      }
    },
  };
}

/** Plays until match_end: side 0 answers right at once, side 1 answers wrong (or not at all). */
async function play(
  stub: ReturnType<typeof roomStub>,
  clients: (Client | null)[],
  opts: { sideOneAnswers: boolean; onState?: (s: MatchState) => void },
): Promise<void> {
  const watcher = clients.find((c) => c !== null)!;
  for (let i = 0; i < MAX_STEPS && watcher.of("match_end").length === 0; i++) {
    const state = await readState(stub);
    if (!state) throw new Error("state disappeared");
    if (state.phase === "finished" || state.phase === "cancelled") break;
    if (state.phase === "question" && state.q) {
      opts.onState?.(state);
      const [c0, c1] = clients;
      if (c0 && state.players[0].r.answer === null) {
        const acks = c0.of("answer_ack").length;
        c0.send({ type: "answer", round: state.round, answer: { kind: "options", ids: keyFor(state, 0).right } });
        await c0.waitFor("answer_ack", acks + 1);
      }
      if (c1 && opts.sideOneAnswers && state.players[1]?.r.answer === null) {
        const acks = c1.of("answer_ack").length;
        c1.send({ type: "answer", round: state.round, answer: { kind: "options", ids: [keyFor(state, 1).wrong] } });
        await c1.waitFor("answer_ack", acks + 1);
      }
    }
    await fastForward(stub);
  }
  await watcher.waitFor("match_end");
}

async function rankedMatch() {
  const { courseId } = await seedCourse();
  const a = await seedUser();
  const b = await seedUser();
  const { matchId } = await createMatch(env, { courseId, mode: "ranked", rated: true, settings: SETTINGS, humans: [a, b], testMode: true });
  return { courseId, a, b, matchId, stub: roomStub(matchId) };
}

describe("duel with the real engine", () => {
  it("plays a ranked match to 0 HP, leaks nothing and finalizes once", async () => {
    const { courseId, a, b, matchId, stub } = await rankedMatch();
    const ca = await openSocket(stub, a);
    const cb = await openSocket(stub, b);
    await ca.waitFor("intro");
    const checker = leakChecker([ca, cb]);
    await play(stub, [ca, cb], { sideOneAnswers: true, onState: (s) => checker.remember(s) });
    checker.check();

    const endA = await ca.waitFor("match_end");
    const endB = await cb.waitFor("match_end");
    expect(endA).toMatchObject({ result: "win", reason: "hp" });
    expect(endB).toMatchObject({ result: "loss", reason: "hp" });
    expect(endA.ranked).not.toBeNull();
    // Every reveal before the end carried the key in the receiver's ids.
    expect(ca.of("reveal").length).toBeGreaterThan(0);
    for (const r of ca.of("reveal")) expect(r.key).toBeTruthy();

    const state = (await readState(stub))!;
    expect(state.finalized).toBe(true);
    const rounds = state.rounds.length;

    // The alarm firing again changes nothing in D1.
    await runDurableObjectAlarm(stub);
    await fastForward(stub);
    const fin = await env.DB.prepare("SELECT count(*) AS n FROM match_finalizations WHERE match_id = ?").bind(matchId).first<{ n: number }>();
    expect(fin?.n).toBe(1);

    expect(await matchRow(matchId)).toMatchObject({ status: "finished", winner: "a", end_reason: "hp", hp_b: 0, rounds_played: rounds });
    const roundRows = await env.DB.prepare("SELECT count(*) AS n FROM match_rounds WHERE match_id = ?").bind(matchId).first<{ n: number }>();
    expect(roundRows?.n).toBe(rounds);
    const answerRows = await env.DB.prepare("SELECT user_id, correct FROM answers WHERE match_id = ?").bind(matchId).all<{ user_id: string; correct: number }>();
    expect(answerRows.results).toHaveLength(2 * rounds);
    expect(answerRows.results.filter((r) => r.user_id === a).every((r) => r.correct === 1)).toBe(true);
    const missed = await env.DB.prepare("SELECT count(*) AS n FROM missed_questions WHERE user_id = ? AND course_id = ?").bind(b, courseId).first<{ n: number }>();
    expect(missed?.n).toBe(rounds);
    expect(endB.missedCount).toBe(rounds);
    const ratingRows = await env.DB.prepare("SELECT user_id, rating, played, won, lost FROM ratings WHERE course_id = ? AND kind = 'ranked'")
      .bind(courseId)
      .all<{ user_id: string; rating: number; played: number; won: number; lost: number }>();
    const byUser = Object.fromEntries(ratingRows.results.map((r) => [r.user_id, r]));
    expect(byUser[a]).toMatchObject({ played: 1, won: 1 });
    expect(byUser[b]).toMatchObject({ played: 1, lost: 1 });
    expect(byUser[a]!.rating).toBeGreaterThan(byUser[b]!.rating);
    const pc = await env.DB.prepare("SELECT answers FROM player_course WHERE user_id = ? AND course_id = ?").bind(a, courseId).first<{ answers: number }>();
    expect(pc?.answers).toBe(rounds);
    ca.close();
    cb.close();
  });

  it("gives a reconnecting player a snapshot of the running question without the key", async () => {
    const { a, b, stub } = await rankedMatch();
    const ca = await openSocket(stub, a);
    let cb = await openSocket(stub, b);
    await ca.waitFor("intro");
    for (let i = 0; i < MAX_STEPS && (await readState(stub))?.phase !== "question"; i++) await fastForward(stub);
    const state = (await readState(stub))!;
    expect(state.phase).toBe("question");

    cb.close();
    await ca.waitFor("opponent_connection");
    cb = await openSocket(stub, b);
    const snap = await cb.waitFor("snapshot");
    expect(snap.phase).toBe("question");
    const question = snap.question as { round: number; options: { id: string }[] };
    expect(question.round).toBe(state.round);
    expect(question.options.map((o) => o.id).sort()).toEqual(Object.keys(state.q!.idMap[1]).sort());
    expect(leaks(snap, new Set(keyFor(state, 1).right))).toBeNull();
    expect(ca.last("opponent_connection")?.connected).toBe(true);
    ca.close();
    cb.close();
  });

  it("ends in an abandon when a player stays away past the forfeit time", async () => {
    const { a, b, matchId, stub } = await rankedMatch();
    const ca = await openSocket(stub, a);
    const cb = await openSocket(stub, b);
    await ca.waitFor("intro");
    cb.close();
    await ca.waitFor("opponent_connection");
    await play(stub, [ca, null], { sideOneAnswers: false });
    const end = await ca.waitFor("match_end");
    expect(end.result).toBe("win");
    // Side 0 answering right every round can win on HP before the forfeit; either ends the match.
    expect(["abandon", "hp"]).toContain(end.reason);
    expect((await matchRow(matchId))?.status).toBe("finished");
    ca.close();
  });

  it("cancels a ranked match nobody showed up for", async () => {
    const { a, matchId, stub } = await rankedMatch();
    const ca = await openSocket(stub, a);
    await ca.waitFor("snapshot");
    for (let i = 0; i < 10 && ca.of("match_end").length === 0; i++) await fastForward(stub);
    expect(await ca.waitFor("match_end")).toMatchObject({ result: "cancelled", reason: "no_show", ranked: null });
    expect(await matchRow(matchId)).toMatchObject({ status: "cancelled", end_reason: "no_show" });
    ca.close();
  });

  it("plays a bot match against Oracle Bot and moves the bot rating", async () => {
    const { courseId } = await seedCourse();
    const me = await seedUser();
    const { matchId } = await createMatch(env, {
      courseId,
      mode: "bot",
      rated: false,
      settings: SETTINGS,
      humans: [me],
      bot: { level: 9 },
      testMode: true,
    });
    const stub = roomStub(matchId);
    const c = await openSocket(stub, me);
    await c.waitFor("intro");
    // The human never answers; the bot answers right every round.
    for (let i = 0; i < MAX_STEPS && c.of("match_end").length === 0; i++) await fastForward(stub);
    const end = await c.waitFor("match_end");
    expect(end).toMatchObject({ result: "loss", reason: "hp", ranked: null });
    const bot = end.bot as { before: number; after: number };
    expect(bot.after).toBeLessThan(bot.before);
    expect(await matchRow(matchId)).toMatchObject({ status: "finished", winner: "b", player_b: null });

    c.send({ type: "rematch" });
    const rematch = await c.waitFor("rematch");
    expect(rematch).toMatchObject({ state: "accepted" });
    expect(await matchRow(rematch.matchId as string)).toMatchObject({ mode: "bot", bot_level: 9, player_a: me });
    await roomStub(rematch.matchId as string).cancel("cancelled");
    c.close();
  });
  it("deletes its storage at cleanupAt after a finished match instead of ticking", async () => {
    const { a, b, matchId, stub } = await rankedMatch();
    const ca = await openSocket(stub, a);
    const cb = await openSocket(stub, b);
    await ca.waitFor("intro");
    cb.send({ type: "surrender" });
    expect(await ca.waitFor("match_end")).toMatchObject({ result: "win", reason: "surrender" });
    const finished = (await readState(stub))!;
    expect(finished.phase).toBe("finished");
    expect(finished.cleanupAt).not.toBeNull();
    // Ranked has no rematch window, so the only deadline left is cleanup.
    expect(await readAlarm(stub)).toBe(finished.cleanupAt);

    await fastForward(stub);
    expect(await readState(stub)).toBeNull();
    expect(await readAlarm(stub)).toBeNull();
    expect((await ca.waitClosed()).code).toBe(CLOSE_CODES.normal);
    expect((await cb.waitClosed()).code).toBe(CLOSE_CODES.normal);
    // D1 keeps the finished row; a late alarm on the empty room does nothing.
    expect((await matchRow(matchId))?.status).toBe("finished");
    await runDurableObjectAlarm(stub);
    expect(await readState(stub)).toBeNull();
  });

  it("runs the rematch window before cleanup in a bot match", async () => {
    const { courseId } = await seedCourse();
    const me = await seedUser();
    const { matchId } = await createMatch(env, { courseId, mode: "bot", rated: false, settings: SETTINGS, humans: [me], bot: { level: 1 }, testMode: true });
    const stub = roomStub(matchId);
    const c = await openSocket(stub, me);
    await c.waitFor("intro");
    c.send({ type: "surrender" });
    const end = await c.waitFor("match_end");
    expect(end).toMatchObject({ result: "loss", reason: "surrender" });
    const finished = (await readState(stub))!;
    expect(finished.rematchUntil).not.toBeNull();
    expect(await readAlarm(stub)).toBe(finished.rematchUntil);
    await fastForward(stub); // rematch window closes
    const after = (await readState(stub))!;
    expect(after.phase).toBe("finished");
    expect(await readAlarm(stub)).toBe(after.cleanupAt);
    await fastForward(stub); // cleanup
    expect(await readState(stub)).toBeNull();
    expect(await readAlarm(stub)).toBeNull();
    expect((await matchRow(matchId))?.status).toBe("finished");
    c.close();
  });
});
