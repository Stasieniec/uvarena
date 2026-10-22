// Courses, home, bots, match detail, profiles, history and leaderboards.
import { describe, expect, it } from "vitest";
import {
  BotsResponseSchema,
  CoursesResponseSchema,
  HomeResponseSchema,
  LeaderboardResponseSchema,
  MatchDetailResponseSchema,
  UserMatchesResponseSchema,
  UserProfileResponseSchema,
} from "@shared/api-schemas";
import { call, insertMatch, insertRow, json, now, seed, signUp, type Session } from "./helpers";

async function roundRow(matchId: string, roundNo: number, questionId: string, extra: Record<string, unknown> = {}) {
  await insertRow("match_rounds", {
    match_id: matchId,
    round_no: roundNo,
    question_id: questionId,
    question_rev: 1,
    multiplier: 1,
    answer_a_json: JSON.stringify({ kind: "options", ids: ["a"] }),
    answer_b_json: null,
    correct_a: 1,
    correct_b: 0,
    ms_a: 4000,
    ms_b: null,
    score_a: 900,
    score_b: 0,
    damage_to_a: 0,
    damage_to_b: 900,
    hp_a_after: 6000,
    hp_b_after: 5100,
    powerups_json: JSON.stringify({ armed: ["zeus", null], effective: ["zeus", null], cancelled: [false, false], quick: [null, null], phoenix: [false, false] }),
    ...extra,
  });
}

describe("GET /courses", () => {
  it("lists active courses with playable question counts per lecture", async () => {
    await seed();
    const s = await signUp("coursey");
    const body = CoursesResponseSchema.parse(await json(await call("/api/courses", { cookie: s })));
    const agai = body.courses.find((c) => c.id === "agai")!;
    expect(body.courses.map((c) => c.id)).toEqual(["agai", "eprm"]);
    // 36 agai fixture questions, of which order (2) and match (2) are not playable yet.
    expect(agai.questionCount).toBe(32);
    expect(agai.lectures.map((l) => l.id)).toEqual(["AGAI-fixture-games", "AGAI-fixture-agents"]);
    expect(agai.lectures.reduce((n, l) => n + l.questionCount, 0)).toBe(32);
  });
});

describe("GET /home and /bots", () => {
  it("shows defaults for a new player", async () => {
    const s = await signUp("newbie");
    const home = HomeResponseSchema.parse(await json(await call("/api/home?course=agai", { cookie: s })));
    expect(home.ranked).toMatchObject({ rating: null, provisional: true, played: 0 });
    expect(home.bot).toMatchObject({ rating: null, provisional: true, n: 0, highestBotLevel: 0 });
    expect(home.searching).toBe(0);
    expect(home.missedOpen).toBe(0);
    expect(home.recentMatches).toEqual([]);
    expect(home.nextBot).toMatchObject({ level: 1, name: "Icarus", unlocked: true, beaten: false });

    const bots = BotsResponseSchema.parse(await json(await call("/api/bots?course=agai", { cookie: s })));
    expect(bots.echo).toEqual({ name: "Echo", line: "Repeats your level back to you.", rating: 1425 });
    expect(bots.ladder.filter((b) => b.unlocked).map((b) => b.level)).toEqual([1]);
    expect(bots.ladder).toHaveLength(8);
  });

  it("reflects ratings, missed questions, recent matches and ladder progress", async () => {
    await seed();
    const s = await signUp("veteran");
    const opp = await signUp("opponent");
    await insertRow("ratings", { user_id: s.userId, course_id: "agai", kind: "ranked", rating: 1662, rd: 290, vol: 0.06, played: 1, won: 1, updated_at: now() });
    await insertRow("ratings", { user_id: s.userId, course_id: "agai", kind: "bot", rating: 1580, n: 40, played: 3, won: 3, highest_bot_level: 8, updated_at: now() });
    await insertRow("missed_questions", { user_id: s.userId, question_id: "agai-rrxcbz", course_id: "agai", lecture_id: "AGAI-fixture-games", first_missed_at: now(), last_missed_at: now() });
    for (let i = 0; i < 4; i++) {
      await insertMatch({ id: `match_recent0${i}`, player_a: s.userId, player_b: opp.userId, ended_at: now() - 10_000 + i });
    }
    await insertMatch({ id: "match_otherc01", course_id: "eprm", player_a: s.userId, player_b: opp.userId });
    await insertMatch({ id: "match_running1", player_a: s.userId, player_b: opp.userId, status: "active", ended_at: null, winner: null });

    const home = HomeResponseSchema.parse(await json(await call("/api/home?course=agai", { cookie: s })));
    expect(home.ranked).toMatchObject({ rating: 1662, provisional: true, played: 1 });
    expect(home.bot).toMatchObject({ rating: 1580, provisional: false, highestBotLevel: 8 });
    expect(home.missedOpen).toBe(1);
    expect(home.recentMatches.map((m) => m.id)).toEqual(["match_recent03", "match_recent02", "match_recent01"]);
    expect(home.recentMatches[0]).toMatchObject({ result: "win", ratingChange: 162, opponent: { username: "opponent" }, hp: { you: 6000, opponent: 0 } });
    expect(home.nextBot).toBeNull();

    const theirs = HomeResponseSchema.parse(await json(await call("/api/home?course=agai", { cookie: opp })));
    expect(theirs.recentMatches[0]).toMatchObject({ result: "loss", ratingChange: -162, hp: { you: 0, opponent: 6000 } });

    const me = await json(await call("/api/me", { cookie: s }));
    expect(me.activeMatchId).toBe("match_running1");
  });

  it("reports a joined lobby as the running match, not an open one", async () => {
    const host = await signUp("lobbyme");
    const guest = await signUp("lobbyyou");
    await insertMatch({ id: "match_openlob1", mode: "private", player_a: host.userId, status: "lobby", join_code: "OPENLB", winner: null, ended_at: null });
    expect((await json(await call("/api/me", { cookie: host }))).activeMatchId).toBeNull();
    await insertMatch({ id: "match_fulllob1", mode: "private", player_a: guest.userId, player_b: host.userId, status: "lobby", join_code: "FULLLB", winner: null, ended_at: null });
    expect((await json(await call("/api/me", { cookie: host }))).activeMatchId).toBe("match_fulllob1");
  });

  it("validates the course query", async () => {
    const s = await signUp("querier");
    expect((await call("/api/home", { cookie: s })).status).toBe(400);
    expect((await call("/api/home?course=zz", { cookie: s })).status).toBe(404);
    expect((await call("/api/bots?course=zzz", { cookie: s })).status).toBe(404);
  });
});

describe("GET /matches/:id", () => {
  it("returns a finished match round by round, with keys", async () => {
    await seed();
    const a = await signUp("winner");
    const b = await signUp("loser");
    await insertMatch({ id: "match_detail01", player_a: a.userId, player_b: b.userId, rounds_played: 2 });
    await roundRow("match_detail01", 1, "agai-rrxcbz");
    await roundRow("match_detail01", 2, "agai-ymyte5", { answer_a_json: JSON.stringify({ kind: "bool", value: true }), multiplier: 1 });
    const body = MatchDetailResponseSchema.parse(await json(await call("/api/matches/match_detail01", { cookie: b })));
    expect(body.players[0].user?.username).toBe("winner");
    expect(body.players[1].user?.username).toBe("loser");
    expect(body.rounds).toHaveLength(2);
    expect(body.rounds[0]!.question.key).toEqual({ kind: "options", ids: ["a"] });
    expect(body.rounds[0]!.question.lectureTitle).toBe("Fixture: games");
    expect(body.rounds[0]!.a).toMatchObject({ armed: "zeus", effective: "zeus", score: 900, correct: true });
    expect(body.rounds[0]!.b).toMatchObject({ answer: null, correct: false, damageTaken: 900 });
  });

  it("shows bot matches with the bot on side b", async () => {
    const a = await signUp("botplayer");
    await insertMatch({ id: "match_botgame1", mode: "bot", rated: 0, player_a: a.userId, bot_level: 3, bot_rating: 1350, bot_rating_before: 1500, bot_rating_after: 1531, rating_a_before: null, rating_a_after: null, rating_b_before: null, rating_b_after: null });
    const body = MatchDetailResponseSchema.parse(await json(await call("/api/matches/match_botgame1", { cookie: a })));
    expect(body.players[1]).toMatchObject({ user: null, bot: { level: 3, name: "Sisyphus" }, ratingBefore: 1350 });
    expect(body.players[0]).toMatchObject({ ratingBefore: 1500, ratingAfter: 1531 });
  });

  it("hides running and unknown matches", async () => {
    await seed();
    const a = await signUp("runner");
    await insertMatch({ id: "match_running2", player_a: a.userId, status: "active", ended_at: null, winner: null });
    await roundRow("match_running2", 1, "agai-rrxcbz");
    expect((await call("/api/matches/match_running2", { cookie: a })).status).toBe(404);
    expect((await call("/api/matches/match_nothing1", { cookie: a })).status).toBe(404);
    expect((await call("/api/matches/x", { cookie: a })).status).toBe(404);
  });
});

describe("profiles and history", () => {
  it("shows stats, accuracy per lecture and head-to-head", async () => {
    await seed();
    const viewer = await signUp("viewer");
    const target = await signUp("target");
    await insertRow("ratings", { user_id: target.userId, course_id: "agai", kind: "ranked", rating: 1700, rd: 80, vol: 0.06, played: 12, won: 9, lost: 3, best_streak: 5, abandoned: 1, updated_at: now() });
    await insertRow("ratings", { user_id: target.userId, course_id: "agai", kind: "casual", played: 2, won: 1, lost: 1, updated_at: now() });
    for (const [i, correct] of [1, 0, 1].entries()) {
      await insertRow("answers", { id: `m:${i}:0`, user_id: target.userId, match_id: "m", round_no: i + 1, question_id: "agai-rrxcbz", course_id: "agai", lecture_id: "AGAI-fixture-games", mode: "ranked", correct, timed_out: 0, ms: 3000, helped: 0, answer_json: null, answered_at: now() });
    }
    await insertMatch({ id: "match_h2h00001", player_a: viewer.userId, player_b: target.userId, winner: "a" });
    await insertMatch({ id: "match_h2h00002", player_a: target.userId, player_b: viewer.userId, winner: "a" });
    await insertMatch({ id: "match_h2h00003", player_a: target.userId, player_b: viewer.userId, winner: "draw" });
    await insertMatch({ id: "match_h2h00004", player_a: target.userId, player_b: viewer.userId, status: "void", winner: null });

    const body = UserProfileResponseSchema.parse(await json(await call("/api/users/Target", { cookie: viewer })));
    expect(body.isSelf).toBe(false);
    expect(body.user).toMatchObject({ username: "target", firstName: "Ada", lastName: "Lovelace" });
    expect(body.headToHead).toEqual({ wins: 1, losses: 1, draws: 1 });
    const agai = body.courses.find((c) => c.courseId === "agai")!;
    expect(agai.ranked).toMatchObject({ rating: 1700, provisional: false, played: 12, won: 9, abandoned: 1, bestStreak: 5 });
    expect(agai.casual).toEqual({ played: 2, won: 1, lost: 1, drawn: 0 });
    expect(agai.accuracy).toEqual([{ lectureId: "AGAI-fixture-games", title: "Fixture: games", answers: 3, correct: 2 }]);

    const own = UserProfileResponseSchema.parse(await json(await call("/api/users/viewer?course=eprm", { cookie: viewer })));
    expect(own.isSelf).toBe(true);
    expect(own.headToHead).toBeNull();
    expect(own.courses.map((c) => c.courseId)).toEqual(["eprm"]);
    expect((await call("/api/users/nobody_here", { cookie: viewer })).status).toBe(404);
  });

  it("pages match history with a before cursor", async () => {
    const a = await signUp("historian");
    const t0 = now() - 1_000_000;
    for (let i = 0; i < 23; i++) {
      await insertMatch({ id: `match_hist${String(i).padStart(4, "0")}`, player_a: a.userId, mode: "bot", rated: 0, bot_level: -1, bot_rating: 1425, ended_at: t0 + i * 1000 });
    }
    const page1 = UserMatchesResponseSchema.parse(await json(await call("/api/users/historian/matches", { cookie: a })));
    expect(page1.items).toHaveLength(20);
    expect(page1.items[0]!.id).toBe("match_hist0022");
    expect(page1.items[0]!.bot).toEqual({ level: -1, name: "Echo" });
    expect(page1.nextBefore).toBe(page1.items[19]!.endedAt);
    const page2 = UserMatchesResponseSchema.parse(await json(await call(`/api/users/historian/matches?before=${page1.nextBefore}`, { cookie: a })));
    expect(page2.items.map((m) => m.id)).toEqual(["match_hist0002", "match_hist0001", "match_hist0000"]);
    expect(page2.nextBefore).toBeNull();
  });
});

describe("GET /leaderboards/:course", () => {
  it("splits established and provisional players, each ranked from 1", async () => {
    const users: Session[] = [];
    for (const name of ["lb_one", "lb_two", "lb_three", "lb_four"]) users.push(await signUp(name));
    const row = (i: number, rating: number, rd: number) =>
      insertRow("ratings", { user_id: users[i]!.userId, course_id: "agai", kind: "ranked", rating, rd, vol: 0.06, played: 5, won: 3, updated_at: now() });
    await row(0, 1600, 90);
    await row(1, 1800, 300);
    await row(2, 1550, 60);
    await row(3, 1900, 109.9);
    const s = users[0]!;
    const body = LeaderboardResponseSchema.parse(await json(await call("/api/leaderboards/agai", { cookie: s })));
    // Storage is shared between the tests in a file: look at this test's players only.
    const mine = (rows: typeof body.established) => rows.filter((r) => r.user.username.startsWith("lb_"));
    expect(mine(body.established).map((r) => r.user.username)).toEqual(["lb_four", "lb_one", "lb_three"]);
    expect(mine(body.provisional).map((r) => [r.user.username, r.rating])).toEqual([["lb_two", 1800]]);
    for (const list of [body.established, body.provisional]) expect(list.map((r) => r.rank)).toEqual(list.map((_, i) => i + 1));
    expect((await call("/api/leaderboards/zzz", { cookie: s })).status).toBe(404);
  });
});
