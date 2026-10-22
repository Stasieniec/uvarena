// createMatch and joinLobby against D1 and real MatchRooms (fake engine).
import { env } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MATCH, POWERUPS } from "@shared/game/config";
import { MatchFactoryError } from "../../src/worker/do/contracts";
import { createMatch, joinLobby, newJoinCode, normaliseJoinCode, toQuestionFull } from "../../src/worker/match-factory";
import { questions } from "../../src/worker/db/schema";
import { installFakes, removeFakes } from "./fake-engine";
import { matchRow, readState, roomStub, seedCourse, seedUser } from "./helpers";

const SETTINGS = { powerups: true, lectures: null };

beforeAll(installFakes);
afterAll(removeFakes);

async function expectFactoryError(p: Promise<unknown>, code: string): Promise<MatchFactoryError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(MatchFactoryError);
  expect((err as MatchFactoryError).code).toBe(code);
  return err as MatchFactoryError;
}

describe("createMatch", () => {
  it("creates a ranked match with players, loadouts and 25 questions", async () => {
    const { courseId } = await seedCourse();
    const a = await seedUser("Alice");
    const b = await seedUser();
    await env.DB.prepare(`INSERT INTO user_prefs (user_id, loadout_json) VALUES (?, '["nemesis","hermes","phoenix"]')`).bind(a).run();
    await env.DB.prepare("INSERT INTO ratings (user_id, course_id, kind, rating, rd, vol, updated_at) VALUES (?, ?, 'ranked', 1620, 80, 0.05, 1)")
      .bind(a, courseId)
      .run();

    const { matchId, code } = await createMatch(env, { courseId, mode: "ranked", rated: false, settings: SETTINGS, humans: [a, b] });
    expect(code).toBeNull();
    const row = await matchRow(matchId);
    expect(row).toMatchObject({ mode: "ranked", rated: 1, status: "active", player_a: a, player_b: b, join_code: null, bot_level: null });
    expect(JSON.parse(String(row?.loadout_a_json))).toEqual(["nemesis", "hermes", "phoenix"]);
    expect(JSON.parse(String(row?.loadout_b_json))).toEqual(POWERUPS.defaultLoadout);

    const state = await readState(roomStub(matchId));
    expect(state?.questions).toHaveLength(MATCH.questionsPerMatch);
    expect(new Set(state?.questions.map((q) => q.id)).size).toBe(MATCH.questionsPerMatch);
    expect(state?.questions[0]?.key).toEqual({ kind: "options", ids: ["a"] });
    expect(state?.players[0]).toMatchObject({ name: "Alice", rankedBefore: { r: 1620, rd: 80, vol: 0.05 } });
    expect(state?.players[1]?.rankedBefore).toBeNull();
    expect(state?.timeScale).toBe(1);
    await roomStub(matchId).cancel("cancelled");
  });

  it("refuses a player in an active match and cancels their open lobbies", async () => {
    const { courseId } = await seedCourse();
    const a = await seedUser();
    const b = await seedUser();
    const c = await seedUser();
    const lobby = await createMatch(env, { courseId, mode: "private", rated: true, settings: SETTINGS, humans: [a] });
    const first = await createMatch(env, { courseId, mode: "bot", rated: false, settings: SETTINGS, humans: [a], bot: { level: "echo" } });
    expect(await matchRow(lobby.matchId)).toMatchObject({ status: "cancelled", end_reason: "cancelled" });
    expect((await roomStub(lobby.matchId).summary()).phase).toBe("cancelled");

    const err = await expectFactoryError(createMatch(env, { courseId, mode: "ranked", rated: true, settings: SETTINGS, humans: [b, a] }), "already_in_match");
    expect(err.matchId).toBe(first.matchId);
    // c is free.
    const ok = await createMatch(env, { courseId, mode: "ranked", rated: true, settings: SETTINGS, humans: [b, c] });
    await roomStub(ok.matchId).cancel("cancelled");

    // Once the room is over, a stale `active` row no longer blocks.
    await roomStub(first.matchId).cancel("cancelled");
    await env.DB.prepare("UPDATE matches SET status = 'active' WHERE id = ?").bind(first.matchId).run();
    const again = await createMatch(env, { courseId, mode: "bot", rated: false, settings: SETTINGS, humans: [a], bot: { level: 1 } });
    await roomStub(again.matchId).cancel("cancelled");
  });

  it("checks the course, the users, the bot ladder and the question supply", async () => {
    const { courseId, lectureIds } = await seedCourse({ lectures: 2, perLecture: 4 });
    const a = await seedUser();
    await expectFactoryError(createMatch(env, { courseId: "nope", mode: "bot", rated: false, settings: SETTINGS, humans: [a], bot: { level: 1 } }), "unknown_course");
    await expectFactoryError(
      createMatch(env, { courseId, mode: "bot", rated: false, settings: SETTINGS, humans: ["ghost"], bot: { level: 1 } }),
      "user_not_found",
    );
    await expectFactoryError(createMatch(env, { courseId, mode: "bot", rated: false, settings: SETTINGS, humans: [a], bot: { level: 3 } }), "bot_locked");
    await expectFactoryError(createMatch(env, { courseId, mode: "bot", rated: false, settings: SETTINGS, humans: [a], bot: { level: 0 } }), "bot_locked");
    await expectFactoryError(
      createMatch(env, { courseId, mode: "bot", rated: false, settings: { powerups: true, lectures: ["none"] }, humans: [a], bot: { level: 1 } }),
      "no_questions",
    );

    await env.DB.prepare("INSERT INTO ratings (user_id, course_id, kind, rating, n, highest_bot_level, updated_at) VALUES (?, ?, 'bot', 1600, 50, 2, 1)")
      .bind(a, courseId)
      .run();
    // Beat level 2, so level 3 is open. One lecture has 4 questions: they repeat to fill the match.
    const m = await createMatch(env, {
      courseId,
      mode: "bot",
      rated: true,
      settings: { powerups: false, lectures: [lectureIds[0]!] },
      humans: [a],
      bot: { level: 3 },
    });
    const row = await matchRow(m.matchId);
    expect(row).toMatchObject({ rated: 0, bot_level: 3, bot_rating: 1350 });
    expect(JSON.parse(String(row?.loadout_a_json))).toEqual([]);
    const state = await readState(roomStub(m.matchId));
    expect(state?.questions).toHaveLength(MATCH.questionsPerMatch);
    expect(new Set(state?.questions.map((q) => q.id)).size).toBe(4);
    expect(state?.questions.every((q) => q.lectureId === lectureIds[0])).toBe(true);
    await roomStub(m.matchId).cancel("cancelled");

    const test = await createMatch(env, { courseId, mode: "bot", rated: false, settings: SETTINGS, humans: [a], bot: { level: 9 }, testMode: true });
    expect((await readState(roomStub(test.matchId)))?.timeScale).toBeLessThan(1);
    await roomStub(test.matchId).cancel("cancelled");
  });

  it("generates readable join codes", () => {
    for (let i = 0; i < 50; i++) expect(newJoinCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(normaliseJoinCode(" k7q4mx ")).toBe("K7Q4MX");
    expect(normaliseJoinCode("K7Q4M0")).toBeNull();
    expect(normaliseJoinCode("K7Q4")).toBeNull();
  });

  it("maps a questions row to QuestionFull", () => {
    const row = {
      id: "agai-abcdef",
      rev: 2,
      courseId: "agai",
      lectureId: "AGAI-L01",
      status: "active",
      type: "truefalse",
      promptMd: null,
      statementMd: "Agents act.",
      codeLang: null,
      optionsJson: [],
      targetsJson: null,
      keyJson: { kind: "bool", value: true },
      shuffle: false,
      whyMd: "Long why.",
      whyShort: "Short why.",
      optionWhyJson: {},
      noteUrl: null,
      difficulty: "easy",
      level: "remember",
      topicsJson: [],
      timeS: 12,
      words: 2,
      chance: 0.5,
      startRating: 1300,
      rating: 1290,
      ratingN: 4,
      attempts: 9,
      correct: 7,
      fingerprint: "f",
      contentHash: "h",
      sourcePath: "p",
      createdAt: 1,
      updatedAt: 1,
    } satisfies typeof questions.$inferSelect;
    expect(toQuestionFull(row)).toEqual({
      id: "agai-abcdef",
      rev: 2,
      courseId: "agai",
      lectureId: "AGAI-L01",
      type: "truefalse",
      prompt: null,
      statement: "Agents act.",
      codeLang: null,
      options: [],
      targets: null,
      key: { kind: "bool", value: true },
      shuffle: false,
      whyShort: "Short why.",
      timeS: 12,
      words: 2,
      chance: 0.5,
      rating: 1290,
      ratingN: 4,
    });
  });
});

describe("joinLobby", () => {
  it("joins, then refuses a third player, and lets the host and guest reopen it", async () => {
    const { courseId } = await seedCourse();
    const host = await seedUser();
    const guest = await seedUser();
    const third = await seedUser();
    const { matchId, code } = await createMatch(env, { courseId, mode: "private", rated: true, settings: SETTINGS, humans: [host] });
    expect((await readState(roomStub(matchId)))?.questions).toHaveLength(0);

    await expectFactoryError(joinLobby(env, "ZZZZZZ", guest), "lobby_not_found");
    await expectFactoryError(joinLobby(env, "bad", guest), "lobby_not_found");
    expect(await joinLobby(env, code!, guest)).toEqual({ matchId });
    expect(await joinLobby(env, code!, guest)).toEqual({ matchId });
    expect(await joinLobby(env, code!, host)).toEqual({ matchId });
    await expectFactoryError(joinLobby(env, code!, third), "lobby_full");
    const row = await matchRow(matchId);
    expect(row).toMatchObject({ player_b: guest, status: "lobby" });
    expect(JSON.parse(String(row?.loadout_b_json))).toEqual(POWERUPS.defaultLoadout);
    await roomStub(matchId).cancel("cancelled");
    await expectFactoryError(joinLobby(env, code!, third), "lobby_expired");
  });

  it("refuses a joiner who is in a running match", async () => {
    const { courseId } = await seedCourse();
    const host = await seedUser();
    const guest = await seedUser();
    const { code, matchId } = await createMatch(env, { courseId, mode: "private", rated: false, settings: SETTINGS, humans: [host] });
    const busy = await createMatch(env, { courseId, mode: "bot", rated: false, settings: SETTINGS, humans: [guest], bot: { level: 1 } });
    const err = await expectFactoryError(joinLobby(env, code!, guest), "already_in_match");
    expect(err.matchId).toBe(busy.matchId);
    await roomStub(busy.matchId).cancel("cancelled");
    await roomStub(matchId).cancel("cancelled");
  });

  it("reports an expired lobby", async () => {
    const { courseId } = await seedCourse();
    const host = await seedUser();
    const guest = await seedUser();
    const { code, matchId } = await createMatch(env, { courseId, mode: "private", rated: false, settings: SETTINGS, humans: [host] });
    const { patchState } = await import("./helpers");
    await patchState(roomStub(matchId), (s) => {
      s.lobbyExpiresAt = Date.now() - 1;
    });
    await expectFactoryError(joinLobby(env, code!, guest), "lobby_expired");
    expect(await matchRow(matchId)).toMatchObject({ status: "cancelled", end_reason: "expired", player_b: null });
  });
});
