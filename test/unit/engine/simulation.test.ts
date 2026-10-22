// Seeded simulations: match length, invariants, determinism, bot calibration,
// answer secrecy in every outbound frame, and the alarm contract.
import { describe, expect, it } from "vitest";
import { botInit } from "@shared/game/bot";
import { MATCH } from "@shared/game/config";
import { botPlayer, nextDeadline } from "@shared/game/engine";
import { createRng } from "@shared/game/rng";
import { answerToOpaque } from "@shared/game/view";
import type { AnswerKey, BotLevel, MatchState, Side } from "@shared/game/types";
import { Driver, botMatchInit, botVsBot, human } from "./helpers";
import { pickQuestions, runToEnd, simMatch, syntheticPool, tickAtDeadline } from "./sim-helpers";

const pool = syntheticPool();

function checkRounds(s: MatchState): void {
  for (const r of s.rounds) {
    expect(r.sides.filter((x) => x.damageTaken > 0).length).toBeLessThanOrEqual(1);
    for (const side of r.sides) expect(side.hpAfter).toBeGreaterThanOrEqual(0);
  }
  for (const p of s.players) expect(p!.hp).toBeGreaterThanOrEqual(0);
}

describe("bot-vs-bot simulation", () => {
  it("2,000 seeded matches across levels: invariants and match length", () => {
    const lengths: number[] = [];
    for (let seed = 0; seed < 2000; seed++) {
      const a = (1 + (seed % 8)) as BotLevel;
      const b = (1 + ((seed * 5 + 3) % 8)) as BotLevel;
      const d = simMatch(a, b, seed, pool, seed % 4 !== 0);
      expect(d.state.phase).toBe("finished");
      expect(["hp", "rounds"]).toContain(d.state.result!.reason);
      expect(d.state.rounds.length).toBeLessThanOrEqual(MATCH.maxRounds + MATCH.suddenDeathMax);
      expect(d.effects.filter((e) => e.kind === "finalize")).toHaveLength(1);
      checkRounds(d.state);
      lengths.push(d.state.rounds.length);
    }
    lengths.sort((x, y) => x - y);
    const median = lengths[lengths.length / 2]!;
    const typical = lengths.filter((l) => l >= 8 && l <= 15).length / lengths.length;
    // design.md: "most matches end in 9 to 14".
    expect(median).toBeGreaterThanOrEqual(9);
    expect(median).toBeLessThanOrEqual(14);
    expect(typical).toBeGreaterThan(0.6);
  }, 180_000);

  it("the same seed gives the same match", () => {
    for (const seed of [1, 99, 4242]) {
      const a = simMatch(3, 6, seed, pool);
      const b = simMatch(3, 6, seed, pool);
      expect(b.state).toEqual(a.state);
    }
    expect(simMatch(3, 6, 1, pool).state.rounds).not.toEqual(simMatch(3, 6, 2, pool).state.rounds);
  });
});

/** Share of wins (draws count half) for a bot of strength 1500 + gap/2 against 1500 - gap/2. */
function winShare(gap: number, powerups: boolean, n: number): number {
  let score = 0;
  for (let seed = 0; seed < n; seed++) {
    const sa = 1500 + gap / 2;
    const sb = 1500 - gap / 2;
    const d = botVsBot(4, 4, 10_000 + seed, pickQuestions(pool, [sa, sb], 10_000 + seed), powerups);
    const a = botPlayer({ level: -1, name: "A", strength: sa }, powerups, createRng(seed * 31 + 1));
    const b = botPlayer({ level: -1, name: "B", strength: sb }, powerups, createRng(seed * 17 + 2));
    d.state = { ...d.state, players: [a, b] };
    runToEnd(d);
    const w = d.state.result!.winner;
    score += w === 0 ? 1 : w === "draw" ? 0.5 : 0;
  }
  return score / n;
}

describe("bot calibration", () => {
  it("equal strength wins about half", () => {
    const share = winShare(0, false, 800);
    expect(share).toBeGreaterThan(0.44);
    expect(share).toBeLessThan(0.56);
  }, 120_000);

  it("a 100-point gap wins roughly 60 to 75%", () => {
    expect(winShare(100, false, 800)).toBeGreaterThan(0.6);
    const withPowerups = winShare(100, true, 800);
    expect(withPowerups).toBeGreaterThan(0.6);
    expect(withPowerups).toBeLessThan(0.75);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// A random human against bots: every frame is scanned for leaks, and every
// reachable state is checked against the alarm contract.
// ---------------------------------------------------------------------------

const PRE_REVEAL_FORBIDDEN = ['"key"', 'Correct"', '"opponentAnswer"', '"whyShort"', '"savedToMissed"'];

interface LeakStats {
  keyPositions: number[];
  frames: number;
}

function scanFrames(d: Driver, from: number, oracleRound: number | null, stats: LeakStats): void {
  for (const o of d.log.slice(from)) {
    expect(o.to).toBe(0); // the bot side never gets frames
    const msg = o.msg;
    stats.frames += 1;
    if (msg.type === "reveal" || msg.type === "match_end") continue;
    let json: string;
    if (msg.type === "snapshot") {
      if (msg.phase === "question") expect(msg.lastReveal).toBeNull();
      if (msg.hidden.length > 0) expect(oracleRound).toBe(msg.round);
      json = JSON.stringify({ ...msg, lastReveal: null, result: null });
    } else {
      json = JSON.stringify(msg);
    }
    for (const bad of PRE_REVEAL_FORBIDDEN) expect(json).not.toContain(bad);
    if (msg.type === "powerup_result" && msg.hidden.length > 0) expect(oracleRound).toBe(msg.round);
    if (msg.type === "question") {
      const q = d.state.q;
      if (q && q.shownAt === msg.shownAt) {
        expect(msg.options.map((x) => x.id)).toEqual(q.order[0]);
        for (const opt of msg.options) expect(q.question.options.some((r) => r.id === opt.id)).toBe(false);
        if (q.question.type === "single" && q.question.options.length === 4) {
          const keyOpaque = (answerToOpaque(q.question.key, q, 0) as { ids: string[] }).ids[0]!;
          stats.keyPositions.push(msg.options.findIndex((x) => x.id === keyOpaque));
        }
      }
    }
  }
}

function randomAnswer(d: Driver, rng: ReturnType<typeof createRng>): AnswerKey {
  const q = d.state.q!;
  const ids = q.order[0];
  switch (q.question.type) {
    case "truefalse":
      return { kind: "bool", value: rng.next() < 0.5 };
    case "multi": {
      const chosen = ids.filter(() => rng.next() < 0.5);
      return { kind: "options", ids: chosen.length > 0 ? chosen : [ids[0]!] };
    }
    default:
      // Sometimes the right answer, so matches have both outcomes.
      return rng.next() < 0.6 ? answerToOpaque(q.question.key, q, 0) : { kind: "options", ids: [rng.pick(ids)] };
  }
}

function humanVsBot(seed: number, level: BotLevel, stats: LeakStats): Driver {
  const rng = createRng(seed * 7919 + 13);
  const strength = botInit(level, 1500).strength;
  const d = new Driver(
    botMatchInit(level, {
      seed,
      matchId: `hb-${seed}`,
      humans: [human("alice", { loadout: rng.shuffle(["zeus", "aegis", "nemesis", "oracle", "hermes", "phoenix"] as const).slice(0, 3) })],
      settings: { powerups: rng.next() < 0.85, lectures: null },
      questions: pickQuestions(pool, [1500, strength], seed),
      timeScale: rng.next() < 0.2 ? 0.2 : 1,
    }),
  );
  let armedRound = -1;
  let planRound = -1;
  let answerAt = 0;
  let quickAt: number | null = null;
  let quick: "oracle" | "hermes" = "oracle";
  let oracleRound: number | null = null;
  let awayUntil: number | null = d.now + rng.int(0, 2000);
  let scanned = 0;

  for (let i = 0; i < 4000; i++) {
    const s = d.state;
    if (s.phase === "finished" && s.cleanupAt !== null && nextDeadline(s) === s.cleanupAt) {
      tickAtDeadline(d); // the cleanup contract
      break;
    }
    if (s.phase === "cancelled") break;
    const me = s.players[0];
    const connected = me.connected;

    // Pick the earliest human action.
    const actions: { at: number; run: () => void }[] = [];
    if (!connected && awayUntil !== null) actions.push({ at: Math.max(d.now, awayUntil), run: () => d.event({ type: "connect", side: 0 }, Math.max(d.now, awayUntil!)) });
    if (connected && s.phase === "arming" && armedRound !== s.round) {
      actions.push({
        at: d.now,
        run: () => {
          armedRound = s.round;
          if (rng.next() < 0.3) d.arm(0, rng.pick(["zeus", "aegis", "nemesis"] as const));
          if (rng.next() < 0.2) d.arm(0, null);
        },
      });
    }
    if (s.phase === "question" && s.q && planRound !== s.round) {
      planRound = s.round;
      answerAt = s.q.shownAt + rng.int(0, s.q.timerMs + 1500);
      quickAt = rng.next() < 0.3 ? s.q.shownAt + rng.int(0, 3000) : null;
      quick = rng.next() < 0.5 ? "oracle" : "hermes";
    }
    if (connected && s.phase === "question" && s.q && me.r.answer === null) {
      if (quickAt !== null && quickAt < answerAt) {
        const at = Math.max(d.now, quickAt);
        actions.push({
          at,
          run: () => {
            quickAt = null;
            d.use(0, quick, at);
            if (d.out(0).some((m) => m.type === "powerup_result" && m.powerup === "oracle")) oracleRound = d.state.round;
          },
        });
      } else {
        const at = Math.max(d.now, answerAt);
        actions.push({ at, run: () => { answerAt = Number.POSITIVE_INFINITY; d.answer(0, randomAnswer(d, rng), at); } });
      }
    }
    if (connected && rng.next() < 0.01) {
      actions.push({
        at: d.now,
        run: () => {
          d.event({ type: "disconnect", side: 0 });
          awayUntil = d.now + (rng.next() < 0.1 ? 60_000 : rng.int(500, 8000));
        },
      });
    }
    if (s.phase === "finished" && s.rematchUntil !== null && !s.rematch[0] && rng.next() < 0.3) {
      actions.push({ at: d.now, run: () => d.event({ type: "rematch", side: 0 }) });
    }

    const deadline = nextDeadline(s);
    actions.sort((a, b) => a.at - b.at);
    const next = actions[0];
    if (next && (deadline === null || next.at < deadline)) next.run();
    else tickAtDeadline(d);

    scanFrames(d, scanned, oracleRound, stats);
    scanned = d.log.length;
    checkRounds(d.state);
  }
  return d;
}

describe("random human against bots", () => {
  it("never leaks the answer before the reveal, and keeps the alarm contract", () => {
    const stats: LeakStats = { keyPositions: [], frames: 0 };
    const levels: BotLevel[] = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const reasons = new Set<string>();
    for (let seed = 0; seed < 400; seed++) {
      const d = humanVsBot(seed, levels[seed % levels.length]!, stats);
      expect(["finished", "cancelled"]).toContain(d.state.phase);
      reasons.add(d.state.result!.reason);
    }
    expect(stats.frames).toBeGreaterThan(10_000);
    expect(reasons).toContain("hp");
    expect(reasons).toContain("abandon");
    // The key's display position is uniform: shuffling gives nothing away.
    const counts = [0, 1, 2, 3].map((p) => stats.keyPositions.filter((x) => x === p).length);
    for (const c of counts) expect(c / stats.keyPositions.length).toBeGreaterThan(0.18);
    for (const c of counts) expect(c / stats.keyPositions.length).toBeLessThan(0.32);
  }, 180_000);
});

describe("bots inside a match", () => {
  it("Dummy loses to a human who answers right, Oracle Bot beats one who never answers", () => {
    const d = new Driver(botMatchInit(0, { timeScale: 0.2 }));
    d.connectAll();
    while (d.state.phase !== "finished") {
      if (d.state.phase === "question" && d.state.players[0].r.answer === null) d.answer(0, d.correct(0), d.state.q!.shownAt + 200);
      else tickAtDeadline(d);
    }
    expect(d.state.result).toMatchObject({ winner: 0, reason: "hp" });
    expect(d.state.rounds.every((r) => !r.sides[1].correct)).toBe(true);

    const o = new Driver(botMatchInit(9, { timeScale: 0.2 }));
    o.connectAll();
    runToEnd(o);
    expect(o.state.result).toMatchObject({ winner: 1, reason: "hp" });
    expect(o.state.rounds.every((r) => r.sides[1].correct && r.sides[1].ms === 2000)).toBe(true);
  });

  it("a bot answers before the countdown ends about 80% of the time when the human is first", () => {
    let late = 0;
    let guessed = 0;
    for (let seed = 0; seed < 300; seed++) {
      const d = new Driver(botMatchInit(1, { seed, settings: { powerups: false, lectures: null } }));
      d.connectAll();
      d.toPhase("question", 1);
      const plan = d.state.players[1]!.bot!.q!;
      d.answer(0, d.correct(0), d.q.shownAt + 100);
      if (plan.answerAt! <= d.q.countdownEnd!) continue;
      late += 1;
      d.toPhase("reveal", 1);
      const bot = d.state.rounds[0]!.sides[1];
      if (!bot.timedOut) {
        guessed += 1;
        expect(bot.answeredAt!).toBeLessThanOrEqual(d.state.rounds[0]!.countdownEnd!);
      } else {
        expect(bot.timedOutAfterCountdown).toBe(true);
      }
    }
    expect(late).toBeGreaterThan(100);
    expect(guessed / late).toBeGreaterThan(0.7);
    expect(guessed / late).toBeLessThan(0.9);
  });

  it("a smart bot arms Zeus in its planned round, and the human sees the banner", () => {
    let checked = 0;
    for (let seed = 0; seed < 60 && checked < 5; seed++) {
      const d = new Driver(botMatchInit(8, { seed }));
      const bot = d.state.players[1]!;
      if (!bot.loadout.includes("zeus") || bot.bot!.nemesisRound === bot.bot!.zeusRound) continue;
      const zr = bot.bot!.zeusRound!;
      if (bot.bot!.nemesisRound !== null && bot.bot!.nemesisRound < zr) continue;
      // The human never answers; a large HP pool keeps the match going until the Zeus round.
      d.state = { ...d.state, players: [{ ...d.state.players[0], hp: 1_000_000 }, d.state.players[1]] };
      d.connectAll();
      d.until((s) => s.round === zr && (s.phase === "banner" || s.phase === "question"));
      expect(d.state.phase).toBe("banner");
      expect(d.lastMsg(0, "banner").items).toContainEqual({ who: "opponent", powerup: "zeus", outcome: "active" });
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("a bot uses Oracle only when unsure, and then guesses among what is left", () => {
    let used = 0;
    for (let seed = 0; seed < 200 && used < 10; seed++) {
      const d = new Driver(botMatchInit(5, { seed }));
      const bot = d.state.players[1]!;
      if (!bot.loadout.includes("oracle")) continue;
      d.connectAll();
      d.until((s) => s.phase === "reveal" || s.phase === "finished" || (s.players[1]!.r.quick === "oracle"));
      if (d.state.players[1]!.r.quick !== "oracle") continue;
      const hidden = d.state.players[1]!.r.hidden;
      expect(d.lastMsg(0, "opponent_powerup").powerup).toBe("oracle");
      d.toPhase("reveal");
      const rec = d.state.rounds.at(-1)!;
      expect(rec.sides[1].helped).toBe(true);
      const ans = rec.sides[1].answer;
      if (ans?.kind === "options") for (const id of ans.ids) expect(hidden).not.toContain(id);
      used += 1;
    }
    expect(used).toBeGreaterThan(0);
  });

  it("frames to the bot side are dropped", () => {
    const d = new Driver(botMatchInit(4));
    d.connectAll();
    d.toPhase("reveal", 1);
    expect(d.log.every((o) => o.to === (0 as Side))).toBe(true);
  });
});
