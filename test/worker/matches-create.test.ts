// Bot match, lobby create and join, with the match factory mocked (it belongs
// to the Durable Objects package): the routes' validation, unlock rules,
// rated rule, test-mode gate and error mapping.
import { env } from "cloudflare:workers";
import { createExecutionContext } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchFactoryError } from "../../src/worker/do/contracts";
import { call as baseCall, insertMatch, insertRow, json, now, seed as baseSeed, signUp as baseSignUp, type CallOptions } from "./helpers";

// The pool loads the Worker's main module before this file's mocks exist, so
// these tests re-import it after resetting the module cache and call it directly.
let worker: { fetch: (req: Request, env: Cloudflare.Env, ctx: ExecutionContext) => Promise<Response> };
beforeAll(async () => {
  vi.resetModules();
  worker = (await import("../../src/worker/index")).default as unknown as typeof worker;
});
const direct = (request: Request) => worker.fetch(request, env, createExecutionContext());
const call = (path: string, opts: CallOptions = {}) => baseCall(path, { fetcher: direct, ...opts });
const signUp = (name: string) => baseSignUp(name);
const seed = () => baseSeed();

const factory = vi.hoisted(() => ({
  createMatch: vi.fn(),
  joinLobby: vi.fn(),
}));

vi.mock("../../src/worker/match-factory", () => ({
  createMatch: factory.createMatch,
  joinLobby: factory.joinLobby,
  toQuestionFull: vi.fn(),
}));

beforeEach(() => {
  factory.createMatch.mockReset();
  factory.joinLobby.mockReset();
  factory.createMatch.mockResolvedValue({ matchId: "match_0001abcd", code: null });
});

describe("POST /bot-matches", () => {
  it("creates an Echo match through the factory, in test mode", async () => {
    await seed();
    const s = await signUp("botter");
    const body = await json(await call("/api/bot-matches", { cookie: s, json: { courseId: "agai", bot: "echo", lectures: ["AGAI-fixture-games"] } }));
    expect(body).toEqual({ matchId: "match_0001abcd" });
    expect(factory.createMatch).toHaveBeenCalledWith(expect.anything(), {
      courseId: "agai",
      mode: "bot",
      rated: false,
      settings: { powerups: true, lectures: ["AGAI-fixture-games"] },
      humans: [s.userId],
      bot: { level: "echo" },
      testMode: true,
    });
  });

  it("allows ladder level 1, refuses a locked level, allows it once the previous one is beaten", async () => {
    const s = await signUp("climber");
    expect((await call("/api/bot-matches", { cookie: s, json: { courseId: "agai", bot: 1 } })).status).toBe(200);
    const locked = await call("/api/bot-matches", { cookie: s, json: { courseId: "agai", bot: 3 } });
    expect(locked.status).toBe(403);
    expect(await locked.json()).toMatchObject({ error: { code: "bot_locked" } });
    await insertRow("ratings", { user_id: s.userId, course_id: "agai", kind: "bot", rating: 1500, n: 10, highest_bot_level: 2, updated_at: now() });
    expect((await call("/api/bot-matches", { cookie: s, json: { courseId: "agai", bot: 3 } })).status).toBe(200);
  });

  it("refuses the test bots outside test mode", async () => {
    const s = await signUp("notest");
    const req = new Request("http://localhost/api/bot-matches", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: s.cookie, Origin: "http://localhost" },
      body: JSON.stringify({ courseId: "agai", bot: 0 }),
    });
    const res = await worker.fetch(req, { ...env, TEST_MODE: undefined }, createExecutionContext());
    expect(res.status).toBe(400);
    expect(factory.createMatch).not.toHaveBeenCalled();
    // In test mode level 0 (Dummy) and 9 (Perfect Bot) are fine.
    expect((await call("/api/bot-matches", { cookie: s, json: { courseId: "agai", bot: 9 } })).status).toBe(200);
  });

  it("validates the course and the lecture filter", async () => {
    await seed();
    const s = await signUp("validator");
    expect((await call("/api/bot-matches", { cookie: s, json: { courseId: "nope", bot: "echo" } })).status).toBe(404);
    const wrongCourse = await call("/api/bot-matches", { cookie: s, json: { courseId: "agai", bot: "echo", lectures: ["EPRM-fixture-w01"] } });
    expect(wrongCourse.status).toBe(400);
    expect((await call("/api/bot-matches", { cookie: s, json: { courseId: "agai", bot: 10 } })).status).toBe(400);
  });

  it("maps factory errors to API errors", async () => {
    const s = await signUp("busy");
    factory.createMatch.mockRejectedValueOnce(new MatchFactoryError("already_in_match", "You are in a match", "match_running1"));
    const res = await call("/api/bot-matches", { cookie: s, json: { courseId: "agai", bot: "echo" } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: "already_in_match", message: "You are in a match", matchId: "match_running1" } });
    factory.createMatch.mockRejectedValueOnce(new MatchFactoryError("no_questions", "Not enough questions"));
    const none = await call("/api/bot-matches", { cookie: s, json: { courseId: "agai", bot: "echo" } });
    expect(none.status).toBe(409);
    expect(await none.json()).toMatchObject({ error: { code: "no_questions" } });
  });
});

describe("POST /lobbies", () => {
  beforeEach(() => {
    factory.createMatch.mockResolvedValue({ matchId: "match_lobby001", code: "K7Q4MX" });
  });

  it("creates a rated lobby with standard settings", async () => {
    const s = await signUp("host");
    const body = await json(await call("/api/lobbies", { cookie: s, json: { courseId: "agai", powerups: true, rated: true } }));
    expect(body).toEqual({ matchId: "match_lobby001", code: "K7Q4MX", rated: true });
    expect(factory.createMatch.mock.calls[0]![1]).toMatchObject({ mode: "private", rated: true, humans: [s.userId], settings: { powerups: true, lectures: null } });
  });

  it("forces unrated with any custom setting", async () => {
    await seed();
    const s = await signUp("custom");
    const off = await json(await call("/api/lobbies", { cookie: s, json: { courseId: "agai", powerups: false, rated: true } }));
    expect(off.rated).toBe(false);
    const filtered = await json(await call("/api/lobbies", { cookie: s, json: { courseId: "agai", powerups: true, rated: true, lectures: ["AGAI-fixture-games"] } }));
    expect(filtered.rated).toBe(false);
    expect(factory.createMatch.mock.calls[1]![1].rated).toBe(false);
  });
});

describe("POST /lobbies/join", () => {
  it("joins through the factory and is idempotent for the players already in it", async () => {
    const host = await signUp("lobbyhost");
    const guest = await signUp("lobbyguest");
    await insertMatch({ id: "match_lobby002", player_a: host.userId, mode: "private", status: "lobby", join_code: "ABCDEF", winner: null, ended_at: null });
    factory.joinLobby.mockResolvedValue({ matchId: "match_lobby002" });

    const joined = await json(await call("/api/lobbies/join", { cookie: guest, json: { code: "abcdef" } }));
    expect(joined).toEqual({ matchId: "match_lobby002" });
    expect(factory.joinLobby).toHaveBeenCalledWith(expect.anything(), "ABCDEF", guest.userId);

    // The host opening their own link lands in the lobby without a factory call.
    factory.joinLobby.mockClear();
    expect(await json(await call("/api/lobbies/join", { cookie: host, json: { code: "ABCDEF" } }))).toEqual({ matchId: "match_lobby002" });
    expect(factory.joinLobby).not.toHaveBeenCalled();
  });

  it("returns clear errors for bad, unknown, closed and full lobbies", async () => {
    const host = await signUp("closedhost");
    const guest = await signUp("closedguest");
    expect((await call("/api/lobbies/join", { cookie: guest, json: { code: "0OI1XX" } })).status).toBe(400);
    expect((await call("/api/lobbies/join", { cookie: guest, json: { code: "ZZZZZZ" } })).status).toBe(404);
    await insertMatch({ id: "match_lobby003", player_a: host.userId, mode: "private", status: "cancelled", join_code: "CANCEL", winner: null });
    const closed = await call("/api/lobbies/join", { cookie: guest, json: { code: "CANCEL" } });
    expect(closed.status).toBe(410);
    await insertMatch({ id: "match_lobby004", player_a: host.userId, mode: "private", status: "lobby", join_code: "FULLLL", winner: null, ended_at: null });
    factory.joinLobby.mockRejectedValueOnce(new MatchFactoryError("lobby_full", "That lobby is full"));
    const full = await call("/api/lobbies/join", { cookie: guest, json: { code: "FULLLL" } });
    expect(full.status).toBe(409);
    expect(await full.json()).toMatchObject({ error: { code: "lobby_full" } });
  });
});
