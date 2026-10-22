// Client fetch helpers: paths, queries, schema validation and error mapping.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, apiRequest, buildPath, buildQuery, errorMessage, isUnauthorised, uploadAvatar } from "../../../src/client/lib/api";

function respond(status: number, body: unknown) {
  return vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildPath and buildQuery", () => {
  it("fills params and encodes them", () => {
    expect(buildPath("/api/users/:username/matches", { username: "anna k" })).toBe("/api/users/anna%20k/matches");
  });

  it("throws on a missing param", () => {
    expect(() => buildPath("/api/matches/:id", {})).toThrow(/id/);
  });

  it("skips undefined and null values", () => {
    expect(buildQuery({ course: "agai", lecture: undefined, before: null, status: "open" })).toBe("?course=agai&status=open");
    expect(buildQuery(undefined)).toBe("");
    expect(buildQuery({})).toBe("");
  });
});

describe("apiRequest", () => {
  it("sends method, query and JSON body, and returns the parsed response", async () => {
    const fetchMock = respond(200, { matchId: "m_12345678" });
    vi.stubGlobal("fetch", fetchMock);
    const res = await apiRequest("createBotMatch", { body: { courseId: "agai", bot: "echo", lectures: null } });
    expect(res).toEqual({ matchId: "m_12345678" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/bot-matches");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ courseId: "agai", bot: "echo", lectures: null });
    expect((init?.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("builds the query string for GET endpoints", async () => {
    const fetchMock = respond(200, { count: 0, items: [], nextBefore: null });
    vi.stubGlobal("fetch", fetchMock);
    await apiRequest("missedList", { query: { course: "agai", status: "learned", before: 1700 } });
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/missed?course=agai&status=learned&before=1700");
  });

  it("throws ApiRequestError with the error body on non-2xx", async () => {
    vi.stubGlobal("fetch", respond(409, { error: { code: "already_in_match", message: "In a match", matchId: "m_running01" } }));
    const err = await apiRequest("createLobby", { body: { courseId: "agai", powerups: true, rated: true } }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(409);
    expect(err.code).toBe("already_in_match");
    expect(err.body.error.matchId).toBe("m_running01");
    expect(errorMessage(err)).toBe("You are already in a match.");
  });

  it("keeps the status when the error body is not an ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502 })));
    const err = await apiRequest("config").catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(502);
    expect(err.body).toBeNull();
  });

  it("rejects a response that does not match its schema", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", respond(200, { googleEnabled: "yes" }));
    const err = await apiRequest("config").catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.message).toMatch(/unexpected/);
  });

  it("turns a network failure into a readable error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const err = await apiRequest("me").catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(0);
    expect(errorMessage(err)).toMatch(/reach the server/);
  });

  it("recognises a signed-out response", async () => {
    vi.stubGlobal("fetch", respond(401, { error: { code: "unauthorised", message: "Sign in" } }));
    const err = await apiRequest("me").catch((e) => e);
    expect(isUnauthorised(err)).toBe(true);
    expect(isUnauthorised(new Error("x"))).toBe(false);
  });
});

describe("uploadAvatar", () => {
  it("PUTs raw bytes with the image content type", async () => {
    const fetchMock = respond(200, { image: "/api/avatars/abc" });
    vi.stubGlobal("fetch", fetchMock);
    const res = await uploadAvatar(new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }));
    expect(res.image).toBe("/api/avatars/abc");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/me/avatar");
    expect(init?.method).toBe("PUT");
    expect((init?.headers as Record<string, string>)["content-type"]).toBe("image/webp");
  });

  it("maps a too-large upload to a readable message", async () => {
    vi.stubGlobal("fetch", respond(413, { error: { code: "payload_too_large", message: "Too large" } }));
    const err = await uploadAvatar(new Blob(["x"], { type: "image/png" })).catch((e) => e);
    expect(errorMessage(err)).toBe("That file is too large.");
  });
});
