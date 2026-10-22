import { describe, expect, it } from "vitest";
import { ELO, GLICKO, PAIR_CAP } from "@shared/game/config";
import { eloUpdate, playerK } from "@shared/game/elo";
import { glicko2Update, inflateForIdleDays } from "@shared/game/glicko2";
import { answerRowId, itemGuardPasses, pairCapDay, planFinalization, statsKindFor } from "@shared/game/finalize";
import type { FinalizationPlan, RatingKind, RatingRow } from "@shared/game/types";
import {
  DAY,
  T0,
  botPlayer,
  context,
  deepFreeze,
  finishedState,
  human,
  pcRow,
  ratingRow,
  rounds,
  type RoundSpec,
} from "./helpers";

function row(plan: FinalizationPlan, userId: string, kind: RatingKind): RatingRow {
  const found = plan.ratings.find((r) => r.userId === userId && r.kind === kind);
  if (!found) throw new Error(`no ${kind} row for ${userId}`);
  return found;
}

/** Alice wins every round, Bob is wrong every round. */
const aliceSweeps: RoundSpec[] = [
  { a: true, b: false },
  { a: true, b: false },
  { a: true, b: null },
  { a: true, b: false },
];

describe("ranked match", () => {
  it("updates both Glicko ratings from the pre-match values, one game each", () => {
    const state = finishedState({ rounds: rounds(aliceSweeps), winner: 0, reason: "hp", hp: [6000, 0] });
    const ctx = context({
      ratings: [
        ratingRow("alice", "ranked", { rating: 1600, rd: 80, vol: 0.06, played: 10, won: 6, lost: 4, lastPlayedAt: T0 - 1000 }),
        ratingRow("bob", "ranked", { rating: 1550, rd: 120, vol: 0.061, played: 3, won: 1, lost: 2, lastPlayedAt: T0 - 1000 }),
      ],
    });
    const plan = planFinalization(state, ctx);

    const alice = { r: 1600, rd: 80, vol: 0.06 };
    const bob = { r: 1550, rd: 120, vol: 0.061 };
    const aliceAfter = glicko2Update(alice, [{ opponent: bob, score: 1 }]);
    const bobAfter = glicko2Update(bob, [{ opponent: alice, score: 0 }]);

    const a = row(plan, "alice", "ranked");
    const b = row(plan, "bob", "ranked");
    expect(a.rating).toBeCloseTo(aliceAfter.r, 9);
    expect(a.rd).toBeCloseTo(aliceAfter.rd, 9);
    expect(a.vol).toBeCloseTo(aliceAfter.vol, 12);
    expect(b.rating).toBeCloseTo(bobAfter.r, 9);
    expect(a.rating! > 1600 && b.rating! < 1550).toBe(true);

    expect([a.played, a.won, a.lost]).toEqual([11, 7, 4]);
    expect([b.played, b.won, b.lost]).toEqual([4, 1, 3]);
    expect(a.lastPlayedAt).toBe(state.result!.endedAt);
    expect(a.updatedAt).toBe(ctx.now);
    expect(plan.ratings).toHaveLength(2);

    expect(plan.match).toMatchObject({
      status: "finished",
      winner: "a",
      endReason: "hp",
      roundsPlayed: 4,
      hpA: 6000,
      hpB: 0,
      ratingABefore: 1600,
      ratingBBefore: 1550,
      pairCapped: false,
      botRatingBefore: null,
      botRatingAfter: null,
      startedAt: state.startedAt,
      endedAt: state.result!.endedAt,
    });
    expect(plan.match.ratingAAfter).toBeCloseTo(aliceAfter.r, 9);
    expect(plan.match.ratingBAfter).toBeCloseTo(bobAfter.r, 9);

    expect(plan.summaries[0].ranked).toEqual({ before: 1600, after: a.rating, provisional: false });
    expect(plan.summaries[1].ranked).toEqual({ before: 1550, after: b.rating, provisional: true });
    expect(plan.summaries[0].bot).toBeNull();
    expect(plan.matchId).toBe("m1");
    expect(plan.finalizedAt).toBe(ctx.now);
  });

  it("starts new players at 1500 / 350 / 0.06 and creates their rows", () => {
    const state = finishedState({ rounds: rounds(aliceSweeps), winner: 0, reason: "hp" });
    const plan = planFinalization(state, context());
    const a = row(plan, "alice", "ranked");
    const b = row(plan, "bob", "ranked");
    expect(a.rating! - 1500).toBeGreaterThan(140);
    expect(a.rating! - 1500).toBeLessThan(180);
    expect(b.rating! + a.rating!).toBeCloseTo(3000, 6);
    expect(a.rd).toBeLessThan(GLICKO.startRd);
    expect([a.played, a.won, a.curStreak, a.bestStreak, a.n]).toEqual([1, 1, 1, 1, 0]);
    expect(a.courseId).toBe("agai");
    expect(plan.summaries[0].ranked).toMatchObject({ before: 1500, provisional: true });
  });

  it("inflates RD for full idle days since the last ranked game before updating", () => {
    const state = finishedState({ rounds: rounds(aliceSweeps), winner: 0, reason: "hp" });
    const fresh = { rating: 1600, rd: 60, vol: 0.06 };
    const active = planFinalization(
      state,
      context({ ratings: [ratingRow("alice", "ranked", { ...fresh, lastPlayedAt: state.startedAt! - 1000 })] }),
    );
    const idle = planFinalization(
      state,
      context({ ratings: [ratingRow("alice", "ranked", { ...fresh, lastPlayedAt: state.startedAt! - 40 * DAY - 1000 })] }),
    );
    const inflated = inflateForIdleDays({ r: 1600, rd: 60, vol: 0.06 }, 40);
    const expected = glicko2Update(inflated, [{ opponent: { r: 1500, rd: 350, vol: 0.06 }, score: 1 }]);
    expect(row(idle, "alice", "ranked").rating).toBeCloseTo(expected.r, 9);
    expect(row(idle, "alice", "ranked").rating! - 1600).toBeGreaterThan(row(active, "alice", "ranked").rating! - 1600);
  });

  it("surrender is a full loss and counts as surrendered", () => {
    const rs = rounds([{ a: true, b: false }]);
    const surrender = planFinalization(finishedState({ rounds: rs, winner: 0, reason: "surrender" }), context());
    const hp = planFinalization(finishedState({ rounds: rs, winner: 0, reason: "hp" }), context());
    const b = row(surrender, "bob", "ranked");
    expect(b.rating).toBeCloseTo(row(hp, "bob", "ranked").rating!, 9);
    expect([b.lost, b.surrendered, b.abandoned]).toEqual([1, 1, 0]);
    expect(row(surrender, "alice", "ranked").surrendered).toBe(0);
    expect(surrender.match.endReason).toBe("surrender");
  });

  it("disconnect forfeit (abandon) is a full loss and counts as left early", () => {
    const plan = planFinalization(finishedState({ rounds: rounds([{ a: null, b: true }]), winner: 1, reason: "abandon" }), context());
    const a = row(plan, "alice", "ranked");
    expect([a.lost, a.abandoned, a.surrendered]).toEqual([1, 1, 0]);
    expect(a.rating).toBeLessThan(1500);
    expect(row(plan, "bob", "ranked").abandoned).toBe(0);
    expect(plan.match.winner).toBe("b");
  });

  it("win on HP after the rounds limit", () => {
    const specs: RoundSpec[] = Array.from({ length: 20 }, (_, i) => ({ a: i % 2 === 0, b: i % 3 === 0 }));
    const plan = planFinalization(finishedState({ rounds: rounds(specs), winner: 1, reason: "rounds", hp: [1200, 3400] }), context());
    expect(plan.match).toMatchObject({ winner: "b", endReason: "rounds", roundsPlayed: 20, hpA: 1200, hpB: 3400 });
    expect(row(plan, "bob", "ranked").won).toBe(1);
  });

  it("a sudden-death draw scores 0.5 each and resets streaks", () => {
    const specs: RoundSpec[] = Array.from({ length: 25 }, () => ({ a: true, b: true }));
    const state = finishedState({ rounds: rounds(specs), winner: "draw", reason: "rounds", hp: [2000, 2000] });
    const ctx = context({
      ratings: [
        ratingRow("alice", "ranked", { rating: 1700, rd: 60, vol: 0.06, curStreak: 4, bestStreak: 6, played: 30 }),
        ratingRow("bob", "ranked", { rating: 1500, rd: 60, vol: 0.06, curStreak: 2, bestStreak: 2, played: 30 }),
      ],
    });
    const plan = planFinalization(state, ctx);
    const a = row(plan, "alice", "ranked");
    const b = row(plan, "bob", "ranked");
    expect(a.rating).toBeLessThan(1700);
    expect(b.rating).toBeGreaterThan(1500);
    expect(a.rating).toBeCloseTo(glicko2Update({ r: 1700, rd: 60, vol: 0.06 }, [{ opponent: { r: 1500, rd: 60, vol: 0.06 }, score: 0.5 }]).r, 9);
    expect([a.drawn, a.curStreak, a.bestStreak]).toEqual([1, 0, 6]);
    expect([b.drawn, b.curStreak, b.bestStreak]).toEqual([1, 0, 2]);
    expect(plan.match.winner).toBe("draw");
    expect(plan.match.roundsPlayed).toBe(25);
    expect(plan.rounds.map((r) => r.roundNo)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("keeps win streaks and best streaks", () => {
    const ctx = context({
      ratings: [
        ratingRow("alice", "ranked", { rating: 1500, rd: 200, vol: 0.06, curStreak: 3, bestStreak: 3 }),
        ratingRow("bob", "ranked", { rating: 1500, rd: 200, vol: 0.06, curStreak: 2, bestStreak: 5 }),
      ],
    });
    const plan = planFinalization(finishedState({ rounds: rounds(aliceSweeps), winner: 0, reason: "hp" }), ctx);
    expect([row(plan, "alice", "ranked").curStreak, row(plan, "alice", "ranked").bestStreak]).toEqual([4, 4]);
    expect([row(plan, "bob", "ranked").curStreak, row(plan, "bob", "ranked").bestStreak]).toEqual([0, 5]);
  });
});

describe("pair cap", () => {
  const ratings = [
    ratingRow("alice", "ranked", { rating: 1600, rd: 70, vol: 0.06, played: 9 }),
    ratingRow("bob", "ranked", { rating: 1580, rd: 70, vol: 0.06, played: 9 }),
  ];

  it(`moves no rating from the ${PAIR_CAP.perDay + 1}th rated game of the day, but counts the stats`, () => {
    const plan = planFinalization(
      finishedState({ rounds: rounds(aliceSweeps), winner: 0, reason: "hp" }),
      context({ ratings, pairCount: PAIR_CAP.perDay }),
    );
    const a = row(plan, "alice", "ranked");
    expect([a.rating, a.rd, a.vol]).toEqual([1600, 70, 0.06]);
    expect([a.played, a.won]).toEqual([10, 1]);
    expect(row(plan, "bob", "ranked").rating).toBe(1580);
    expect(plan.match).toMatchObject({ pairCapped: true, ratingABefore: 1600, ratingAAfter: 1600, ratingBBefore: 1580, ratingBAfter: 1580 });
    expect(plan.summaries[0]).toMatchObject({ pairCapped: true, ranked: { before: 1600, after: 1600, provisional: false } });
    expect(plan.summaries[1].pairCapped).toBe(true);
  });

  it("still rates the 5th game", () => {
    const plan = planFinalization(
      finishedState({ rounds: rounds(aliceSweeps), winner: 0, reason: "hp" }),
      context({ ratings, pairCount: PAIR_CAP.perDay - 1 }),
    );
    expect(plan.match.pairCapped).toBe(false);
    expect(row(plan, "alice", "ranked").rating).toBeGreaterThan(1600);
  });

  it("applies to rated private matches too", () => {
    const plan = planFinalization(
      finishedState({ mode: "private", rated: true, rounds: rounds(aliceSweeps), winner: 0, reason: "hp" }),
      context({ ratings, pairCount: 7 }),
    );
    expect(plan.match.pairCapped).toBe(true);
    expect(row(plan, "alice", "ranked").rating).toBe(1600);
  });

  it("finds the Amsterdam calendar day, including DST changes", () => {
    const hour = 3_600_000;
    // 2026-10-22 is CEST (UTC+2): the day starts at 22:00 UTC the evening before.
    expect(pairCapDay(Date.UTC(2026, 9, 22, 12))).toEqual({ start: Date.UTC(2026, 9, 21, 22), end: Date.UTC(2026, 9, 22, 22) });
    // 23:30 UTC on 2026-10-22 is already 01:30 on 2026-10-23 in Amsterdam.
    expect(pairCapDay(Date.UTC(2026, 9, 22, 23, 30)).start).toBe(Date.UTC(2026, 9, 22, 22));
    // 2026-10-25: clocks go back, a 25-hour day.
    const autumn = pairCapDay(Date.UTC(2026, 9, 25, 12));
    expect(autumn.start).toBe(Date.UTC(2026, 9, 24, 22));
    expect(autumn.end - autumn.start).toBe(25 * hour);
    // 2026-03-29: clocks go forward, a 23-hour day.
    const spring = pairCapDay(Date.UTC(2026, 2, 29, 12));
    expect(spring.start).toBe(Date.UTC(2026, 2, 28, 23));
    expect(spring.end - spring.start).toBe(23 * hour);
    // Winter time (UTC+1), across a month end.
    expect(pairCapDay(Date.UTC(2026, 11, 31, 23, 15))).toEqual({ start: Date.UTC(2026, 11, 31, 23), end: Date.UTC(2027, 0, 1, 23) });
  });
});

describe("private and unrated matches", () => {
  it("an unrated private match counts on the casual row and moves no ranked rating", () => {
    const ctx = context({ ratings: [ratingRow("alice", "ranked", { rating: 1650, rd: 90, vol: 0.06 })] });
    const plan = planFinalization(finishedState({ mode: "private", rated: false, rounds: rounds(aliceSweeps), winner: 0, reason: "hp" }), ctx);
    expect(plan.ratings.map((r) => `${r.userId}:${r.kind}`).sort()).toEqual(["alice:casual", "bob:casual"]);
    const a = row(plan, "alice", "casual");
    expect([a.rating, a.rd, a.vol, a.played, a.won]).toEqual([null, null, null, 1, 1]);
    expect(plan.match).toMatchObject({ ratingABefore: null, ratingAAfter: null, ratingBBefore: null, ratingBAfter: null, pairCapped: false });
    expect(plan.summaries[0].ranked).toBeNull();
    expect(plan.summaries[0].bot).toBeNull();
  });

  it("a rated private match counts on the ranked row", () => {
    const plan = planFinalization(finishedState({ mode: "private", rated: true, rounds: rounds(aliceSweeps), winner: 1, reason: "surrender" }), context());
    expect(row(plan, "bob", "ranked").won).toBe(1);
    expect(row(plan, "alice", "ranked").surrendered).toBe(1);
    expect(plan.match.ratingABefore).toBe(1500);
  });

  it("picks the stats row by mode", () => {
    expect(statsKindFor("ranked", true)).toBe("ranked");
    expect(statsKindFor("private", true)).toBe("ranked");
    expect(statsKindFor("private", false)).toBe("casual");
    expect(statsKindFor("bot", false)).toBe("bot");
  });
});

describe("void match", () => {
  it("writes the history but moves no rating and no counter", () => {
    const specs: RoundSpec[] = [{ a: true, b: false }, { a: null, b: null }, { a: null, b: null }];
    const state = finishedState({ rounds: rounds(specs), winner: null, reason: "void", hp: [6000, 5100] });
    const plan = planFinalization(state, context());
    expect(plan.match).toMatchObject({ status: "void", winner: null, endReason: "void", ratingABefore: null, ratingAAfter: null, pairCapped: false });
    expect(plan.ratings).toEqual([]);
    expect(plan.summaries[0].ranked).toBeNull();
    expect(plan.rounds).toHaveLength(3);
    expect(plan.answers).toHaveLength(6);
    expect(plan.missed.map((m) => `${m.userId}:${m.questionId}`)).toEqual(["alice:q2", "alice:q3", "bob:q1", "bob:q2", "bob:q3"]);
    for (const item of plan.items) {
      expect(item.ratingDelta).toBe(0);
      expect(item.ratingNDelta).toBe(0);
    }
    expect(plan.items.find((i) => i.questionId === "q1")).toMatchObject({ attemptsDelta: 2, correctDelta: 1 });
    expect(plan.playerCourse).toHaveLength(2);
  });
});

describe("cancelled and unfinished matches", () => {
  for (const reason of ["no_show", "expired", "cancelled"] as const) {
    it(`refuses ${reason}: the MatchRoom writes cancellations itself`, () => {
      expect(() => planFinalization(finishedState({ winner: null, reason }), context())).toThrow(/cancelled/);
    });
  }

  it("refuses a match without a result", () => {
    const state = { ...finishedState({ winner: 0, reason: "hp" }), result: null };
    expect(() => planFinalization(state, context())).toThrow(/no result/);
  });
});

describe("bot match", () => {
  const bot = (level: Parameters<typeof botPlayer>[0], strength = 1650) => botPlayer(level, strength);

  it("moves the bot rating per answer in round order, skipping Oracle answers", () => {
    const specs: RoundSpec[] = [
      { a: true, b: false, itemRating: 1400, chance: 0.25 },
      { a: false, b: true, itemRating: 1300, chance: 0.5 },
      { a: { correct: true, helped: true }, b: false, itemRating: 1800, chance: 0.25 },
      { a: null, b: true, itemRating: 1600, chance: 1 / 7 },
      { a: true, b: true, itemRating: 1700, chance: 0.25 },
    ];
    const state = finishedState({ mode: "bot", rated: false, players: [human("alice"), bot(5)], rounds: rounds(specs), winner: 0, reason: "hp" });
    const ctx = context({
      users: ["alice"],
      ratings: [ratingRow("alice", "bot", { rating: 1450, n: 12, played: 2, lastPlayedAt: T0 - 1000 })],
    });
    const plan = planFinalization(state, ctx);

    let theta = 1450;
    let n = 12;
    for (const [i, spec] of specs.entries()) {
      if (i === 2) continue; // Oracle
      const correct = spec.a === true;
      const u = eloUpdate(theta, n, spec.itemRating!, 0, spec.chance!, correct);
      theta += u.playerDelta;
      n += 1;
    }
    const r = row(plan, "alice", "bot");
    expect(r.rating).toBeCloseTo(theta, 9);
    expect(r.n).toBe(16);
    expect([r.rd, r.vol]).toEqual([null, null]);
    expect([r.played, r.won, r.highestBotLevel]).toEqual([3, 1, 5]);
    expect(plan.ratings).toHaveLength(1);
    expect(plan.summaries[0].bot).toEqual({ before: 1450, after: r.rating, provisional: true });
    expect(plan.summaries[0].ranked).toBeNull();
    expect(plan.summaries[1]).toEqual({ ranked: null, bot: null, pairCapped: false, missedCount: 0 });
    expect(plan.match).toMatchObject({ botRatingBefore: 1450, ratingABefore: null, ratingBBefore: null, winner: "a" });
    expect(plan.match.botRatingAfter).toBeCloseTo(theta, 9);
  });

  it("records only the human's answers, but both sides in the round rows", () => {
    const state = finishedState({ mode: "bot", players: [human("alice"), bot(2, 1200)], rounds: rounds(aliceSweeps), winner: 0, reason: "hp" });
    const plan = planFinalization(state, context({ users: ["alice"] }));
    expect(plan.answers.every((a) => a.userId === "alice")).toBe(true);
    expect(plan.answers).toHaveLength(4);
    expect(plan.rounds[0]).toMatchObject({ correctA: true, correctB: false, answerBJson: { kind: "options", ids: ["wrong"] } });
    expect(plan.missed).toEqual([]);
    expect(plan.playerCourse.map((p) => p.userId)).toEqual(["alice"]);
  });

  it("starts at 1500 with K 174 for a first bot match", () => {
    const state = finishedState({ mode: "bot", players: [human("alice"), bot(1, 1050)], rounds: rounds([{ a: true, b: false, chance: 0 }]), winner: 0, reason: "hp" });
    const plan = planFinalization(state, context({ users: ["alice"] }));
    expect(row(plan, "alice", "bot").rating).toBeCloseTo(1500 + playerK(0) * 0.5, 9);
    expect(row(plan, "alice", "bot").n).toBe(1);
  });

  it("reduces n by 1 per 3 full idle days before rating", () => {
    const state = finishedState({ mode: "bot", players: [human("alice"), bot(4, 1500)], rounds: rounds([{ a: true, b: false }]), winner: 0, reason: "hp" });
    const plan = planFinalization(
      state,
      context({ users: ["alice"], ratings: [ratingRow("alice", "bot", { rating: 1500, n: 100, lastPlayedAt: state.startedAt! - 31 * DAY }) ] }),
    );
    expect(row(plan, "alice", "bot").n).toBe(100 - 10 + 1);
    const p = 0.25 + 0.75 * 0.5;
    expect(row(plan, "alice", "bot").rating).toBeCloseTo(1500 + playerK(90) * (1 - p), 9);
  });

  it("counts a timeout as wrong for the bot rating", () => {
    const state = finishedState({ mode: "bot", players: [human("alice"), bot(4, 1500)], rounds: rounds([{ a: null, b: true }]), winner: 1, reason: "abandon" });
    const plan = planFinalization(state, context({ users: ["alice"] }));
    const r = row(plan, "alice", "bot");
    expect(r.rating).toBeLessThan(1500);
    expect([r.lost, r.abandoned, r.curStreak]).toEqual([1, 1, 0]);
  });

  it("keeps the strongest bot beaten; losses, Echo and test bots do not raise it", () => {
    const ctx = context({ users: ["alice"], ratings: [ratingRow("alice", "bot", { rating: 1600, n: 50, highestBotLevel: 6 })] });
    const play = (level: Parameters<typeof botPlayer>[0], winner: 0 | 1) =>
      row(planFinalization(finishedState({ mode: "bot", players: [human("alice"), bot(level)], rounds: rounds(aliceSweeps), winner, reason: "hp" }), ctx), "alice", "bot")
        .highestBotLevel;
    expect(play(7, 0)).toBe(7);
    expect(play(3, 0)).toBe(6);
    expect(play(8, 1)).toBe(6);
    expect(play(-1, 0)).toBe(6);
    expect(play(9, 0)).toBe(6);
    expect(play(0, 0)).toBe(6);
  });

  it("is no longer provisional from 30 rated answers", () => {
    const state = finishedState({ mode: "bot", players: [human("alice"), bot(4, 1500)], rounds: rounds([{ a: true, b: false }]), winner: 0, reason: "hp" });
    const plan = planFinalization(state, context({ users: ["alice"], ratings: [ratingRow("alice", "bot", { rating: 1500, n: ELO.botProvisionalAnswers - 1 })] }));
    expect(plan.summaries[0].bot?.provisional).toBe(false);
  });

  it("an all-Oracle match leaves the bot rating where it was", () => {
    const state = finishedState({
      mode: "bot",
      players: [human("alice"), bot(4, 1500)],
      rounds: rounds([{ a: { correct: true, helped: true }, b: false }]),
      winner: 0,
      reason: "hp",
    });
    const plan = planFinalization(state, context({ users: ["alice"], ratings: [ratingRow("alice", "bot", { rating: 1523, n: 40 })] }));
    expect(row(plan, "alice", "bot")).toMatchObject({ rating: 1523, n: 40 });
    expect(plan.match).toMatchObject({ botRatingBefore: 1523, botRatingAfter: 1523 });
    expect(plan.items[0]).toMatchObject({ ratingDelta: 0, ratingNDelta: 0, attemptsDelta: 1, correctDelta: 1 });
  });
});

describe("item ratings", () => {
  it("moves items by -Ki(m) * (x - P) using the player's bot rating", () => {
    const state = finishedState({
      players: [human("alice", { botRating: 1700 }), human("bob", { botRating: 1500 })],
      rounds: rounds([{ a: true, b: false, itemRating: 1500, itemRatingN: 20, chance: 0.25 }]),
      winner: 0,
      reason: "hp",
    });
    const plan = planFinalization(state, context({ ratings: [ratingRow("alice", "bot", { rating: 1650, n: 80 })] }));
    // Alice's stored bot rating (1650) wins over the state's copy; Bob has none, so the state's 1500.
    const first = eloUpdate(1650, 80, 1500, 20, 0.25, true).itemDelta;
    const second = eloUpdate(1500, 0, 1500, 21, 0.25, false).itemDelta;
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].ratingDelta).toBeCloseTo(first + second, 9);
    expect(plan.items[0]).toMatchObject({ questionId: "q1", ratingNDelta: 2, attemptsDelta: 2, correctDelta: 1 });
  });

  it("does not move the bot rating in a ranked match", () => {
    const plan = planFinalization(finishedState({ rounds: rounds(aliceSweeps), winner: 0, reason: "hp" }), context());
    expect(plan.ratings.some((r) => r.kind === "bot")).toBe(false);
    expect(plan.summaries[0].bot).toBeNull();
  });

  it("needs 10 answers in the course, counting earlier answers in this match", () => {
    const specs: RoundSpec[] = Array.from({ length: 4 }, () => ({ a: true, b: true }));
    const state = finishedState({ rounds: rounds(specs), winner: 0, reason: "rounds" });
    const plan = planFinalization(state, context({ playerCourse: [pcRow("alice", 8), pcRow("bob", 0)] }));
    // Alice has 8 before round 1, 9 before round 2, 10 before round 3.
    expect(plan.items.map((i) => i.ratingNDelta)).toEqual([0, 0, 1, 1]);
  });

  it("treats a player with no player_course row as having 0 answers", () => {
    const state = finishedState({ rounds: rounds([{ a: true, b: true }]), winner: 0, reason: "hp" });
    const ctx = context();
    const plan = planFinalization(state, { ...ctx, playerCourse: {} });
    expect(plan.items[0].ratingNDelta).toBe(0);
    expect(plan.playerCourse).toHaveLength(2);
  });

  it("skips Oracle answers, recent repeats and timeouts after the countdown", () => {
    const specs: RoundSpec[] = [
      { a: { correct: true, helped: true }, b: { timedOut: true, timedOutAfterCountdown: true } },
      { a: true, b: false, questionId: "seen" },
      { a: null, b: true },
    ];
    const state = finishedState({ rounds: rounds(specs), winner: 0, reason: "hp" });
    const plan = planFinalization(state, context({ recentAnswers: { alice: ["seen"], bob: [] } }));
    const byId = Object.fromEntries(plan.items.map((i) => [i.questionId, i]));
    expect(byId.q1).toMatchObject({ ratingDelta: 0, ratingNDelta: 0, attemptsDelta: 2, correctDelta: 1 });
    // Only Bob's answer moved the item Alice had seen recently.
    expect(byId.seen.ratingNDelta).toBe(1);
    expect(byId.seen.ratingDelta).toBeCloseTo(eloUpdate(1500, 0, 1500, 0, 0.25, false).itemDelta, 9);
    // A plain timeout (no countdown) still counts, as a wrong answer.
    expect(byId.q3.ratingNDelta).toBe(2);
  });

  it("guard function", () => {
    const ok = { playerAnswersBefore: ELO.itemMinPlayerAnswers, helped: false, answeredRecently: false, timedOutAfterCountdown: false };
    expect(itemGuardPasses(ok)).toBe(true);
    expect(itemGuardPasses({ ...ok, playerAnswersBefore: ELO.itemMinPlayerAnswers - 1 })).toBe(false);
    expect(itemGuardPasses({ ...ok, helped: true })).toBe(false);
    expect(itemGuardPasses({ ...ok, answeredRecently: true })).toBe(false);
    expect(itemGuardPasses({ ...ok, timedOutAfterCountdown: true })).toBe(false);
  });
});

describe("answers, missed questions and totals", () => {
  const specs: RoundSpec[] = [
    { a: true, b: false, lectureId: "AGAI-L01" },
    { a: false, b: null, lectureId: "AGAI-L02" },
    { a: { correct: false, helped: true }, b: true, lectureId: "AGAI-L02" },
  ];
  const state = finishedState({ mode: "private", rated: false, rounds: rounds(specs), winner: 1, reason: "rounds" });
  const plan = planFinalization(state, context());

  it("writes one answer row per human per round with stable ids", () => {
    expect(plan.answers.map((a) => a.id)).toEqual(["m1:1:0", "m1:2:0", "m1:3:0", "m1:1:1", "m1:2:1", "m1:3:1"]);
    expect(answerRowId("m1", 2, 1)).toBe("m1:2:1");
    const timeout = plan.answers.find((a) => a.id === "m1:2:1")!;
    expect(timeout).toMatchObject({ userId: "bob", timedOut: true, correct: false, ms: null, answerJson: null, mode: "private", courseId: "agai", lectureId: "AGAI-L02" });
    expect(timeout.answeredAt).toBe(state.rounds[1].deadline);
    const helped = plan.answers.find((a) => a.id === "m1:3:0")!;
    expect(helped).toMatchObject({ helped: true, correct: false, ms: 4000, answeredAt: state.rounds[2].shownAt + 4000 });
  });

  it("upserts every wrong or timed-out answer into missed questions", () => {
    expect(plan.missed).toEqual([
      { userId: "alice", questionId: "q2", courseId: "agai", lectureId: "AGAI-L02", missedAt: state.rounds[1].shownAt + 4000, lastAnswerJson: { kind: "options", ids: ["wrong"] }, matchId: "m1" },
      { userId: "alice", questionId: "q3", courseId: "agai", lectureId: "AGAI-L02", missedAt: state.rounds[2].shownAt + 4000, lastAnswerJson: { kind: "options", ids: ["wrong"] }, matchId: "m1" },
      { userId: "bob", questionId: "q1", courseId: "agai", lectureId: "AGAI-L01", missedAt: state.rounds[0].shownAt + 4000, lastAnswerJson: { kind: "options", ids: ["wrong"] }, matchId: "m1" },
      { userId: "bob", questionId: "q2", courseId: "agai", lectureId: "AGAI-L02", missedAt: state.rounds[1].deadline, lastAnswerJson: null, matchId: "m1" },
    ]);
    expect(plan.summaries.map((s) => s.missedCount)).toEqual([2, 2]);
  });

  it("uses the countdown end as the answer time of a timeout after the countdown", () => {
    const rs = rounds([{ a: true, b: { timedOut: true, timedOutAfterCountdown: true } }]);
    rs[0] = { ...rs[0], firstSide: 0, countdownEnd: rs[0].shownAt + 9000 };
    const p = planFinalization(finishedState({ rounds: rs, winner: 0, reason: "hp" }), context());
    expect(p.answers[1].answeredAt).toBe(rs[0].shownAt + 9000);
    expect(p.missed[0].missedAt).toBe(rs[0].shownAt + 9000);
  });

  it("adds per-course answer totals", () => {
    expect(plan.playerCourse).toEqual([
      { userId: "alice", courseId: "agai", answersDelta: 3, correctDelta: 1, lastAnswerAt: state.rounds[2].shownAt + 4000 },
      { userId: "bob", courseId: "agai", answersDelta: 3, correctDelta: 1, lastAnswerAt: state.rounds[2].shownAt + 4000 },
    ]);
  });

  it("writes nothing per player for a match with no rounds", () => {
    const p = planFinalization(finishedState({ rounds: [], winner: 1, reason: "surrender" }), context());
    expect([p.answers, p.missed, p.items, p.playerCourse, p.rounds]).toEqual([[], [], [], [], []]);
    expect(row(p, "alice", "ranked").surrendered).toBe(1);
  });
});

describe("round rows", () => {
  it("copies scores, damage and power-ups, marking Nemesis cancellations", () => {
    const rs = rounds([
      {
        a: { correct: true, score: 950, armed: "zeus", effective: null, nemesisAgainst: true, hpAfter: 6000 },
        b: { correct: false, armed: "nemesis", effective: "nemesis", damageTaken: 950, hpAfter: 5050, quick: "oracle", helped: true },
      },
      { a: { correct: false, armed: "nemesis", effective: null, damageTaken: 6000, hpAfter: 1, phoenix: true }, b: { correct: true, armed: "nemesis", effective: null } },
    ]);
    const plan = planFinalization(finishedState({ rounds: rs, winner: 1, reason: "hp" }), context());
    expect(plan.rounds[0]).toMatchObject({
      matchId: "m1",
      roundNo: 1,
      questionId: "q1",
      questionRev: 1,
      multiplier: 1,
      scoreA: 950,
      scoreB: 0,
      damageToA: 0,
      damageToB: 950,
      hpAAfter: 6000,
      hpBAfter: 5050,
      msA: 4000,
      powerupsJson: {
        armed: ["zeus", "nemesis"],
        effective: [null, "nemesis"],
        cancelled: [true, false],
        quick: [null, "oracle"],
        phoenix: [false, false],
      },
    });
    expect(plan.rounds[1].powerupsJson).toMatchObject({ cancelled: [true, true], phoenix: [true, false] });
  });
});

describe("idempotency and purity", () => {
  it("gives the same plan twice and never mutates its inputs", () => {
    const state = deepFreeze(
      finishedState({ mode: "bot", players: [human("alice"), botPlayer(5, 1650)], rounds: rounds(aliceSweeps), winner: 0, reason: "hp" }),
    );
    const ctx = deepFreeze(
      context({ users: ["alice"], ratings: [ratingRow("alice", "bot", { rating: 1480, n: 20, played: 5 })], recentAnswers: { alice: ["q2"] } }),
    );
    const first = planFinalization(state, ctx);
    const second = planFinalization(state, ctx);
    expect(second).toEqual(first);
    expect(ctx.ratings.alice.bot!.played).toBe(5);
  });

  it("never mutates ranked context rows", () => {
    const ctx = deepFreeze(
      context({
        ratings: [ratingRow("alice", "ranked", { rating: 1500, rd: 100, vol: 0.06 }), ratingRow("bob", "ranked", { rating: 1500, rd: 100, vol: 0.06 })],
      }),
    );
    const state = deepFreeze(finishedState({ rounds: rounds(aliceSweeps), winner: 0, reason: "hp" }));
    expect(() => planFinalization(state, ctx)).not.toThrow();
  });

  it("answer row ids are unique within a plan", () => {
    const specs: RoundSpec[] = Array.from({ length: 25 }, () => ({ a: true, b: false }));
    const plan = planFinalization(finishedState({ rounds: rounds(specs), winner: 0, reason: "rounds" }), context());
    expect(new Set(plan.answers.map((a) => a.id)).size).toBe(50);
  });
});
