// Test routes, the test-mode gate and the auth rate limiter's scope.
import { env } from "cloudflare:workers";
import { createExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index";
import { isTestEnv, isTestMode } from "../../src/worker/middleware/test-mode";
import { isRateLimitedAuthPath } from "../../src/worker/middleware/rate-limit";
import { isAllowedOriginValue } from "../../src/worker/middleware/origin";
import { call, json, seed } from "./helpers";

describe("test mode gate", () => {
  it("needs TEST_MODE=1, a localhost request and a localhost APP_URL", () => {
    const local = new Request("http://localhost:4173/api/test/seed");
    expect(isTestMode(env, local)).toBe(true);
    expect(isTestMode({ ...env, TEST_MODE: undefined }, local)).toBe(false);
    expect(isTestMode(env, new Request("https://uvarena.swasilewski.com/api/test/seed"))).toBe(false);
    expect(isTestMode({ ...env, APP_URL: "https://uvarena.swasilewski.com" }, local)).toBe(false);
  });

  it("isTestEnv (DOs, ranked time scale, test seams) needs TEST_MODE=1 and a localhost APP_URL", () => {
    expect(isTestEnv(env)).toBe(true);
    expect(isTestEnv({ ...env, TEST_MODE: undefined })).toBe(false);
    // A stray TEST_MODE on the deployed Worker must not shorten ranked matches.
    expect(isTestEnv({ ...env, APP_URL: "https://uvarena.swasilewski.com" })).toBe(false);
  });

  it("refuses the test routes without test mode", async () => {
    expect((await call("/api/test/seed", { method: "POST", base: "http://uvarena.example" })).status).toBe(404);
    const req = new Request("http://localhost/api/test/reset", { method: "POST" });
    const res = await worker.fetch(req, { ...env, TEST_MODE: "0" }, createExecutionContext());
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "test_mode_off" } });
  });
});

describe("POST /test/seed and /test/reset", () => {
  it("seeds idempotently, the seeded users can sign in, and reset empties everything but courses", async () => {
    const first = await seed();
    expect(first.questions).toBe(42);
    expect(first.users.map((u) => u.username)).toEqual(["alice", "bob"]);
    const again = await seed();
    expect(again.users).toEqual(first.users);
    const signIn = await call("/api/auth/sign-in/username", { json: { username: "alice", password: "testpass123" } });
    expect(signIn.status).toBe(200);

    expect(await json(await call("/api/test/reset", { method: "POST" }))).toEqual({ ok: true });
    for (const table of ["user", "session", "questions", "lectures", "matches"]) {
      const row = await env.DB.prepare(`SELECT count(*) AS n FROM "${table}"`).first<number>("n");
      expect(row, table).toBe(0);
    }
    expect(await env.DB.prepare("SELECT count(*) AS n FROM courses").first<number>("n")).toBe(2);
    expect((await seed()).users).toHaveLength(2);
  });
});

describe("helpers", () => {
  it("rate limits only the password and email endpoints", () => {
    expect(isRateLimitedAuthPath("POST", "/api/auth/sign-up/email")).toBe(true);
    expect(isRateLimitedAuthPath("POST", "/api/auth/sign-in/username")).toBe(true);
    expect(isRateLimitedAuthPath("POST", "/api/auth/request-password-reset")).toBe(true);
    expect(isRateLimitedAuthPath("GET", "/api/auth/get-session")).toBe(false);
    expect(isRateLimitedAuthPath("POST", "/api/auth/sign-out")).toBe(false);
  });

  it("allows any localhost origin only while APP_URL is local", () => {
    const prod = { ...env, APP_URL: "https://uvarena.swasilewski.com" };
    expect(isAllowedOriginValue("https://uvarena.swasilewski.com", prod)).toBe(true);
    expect(isAllowedOriginValue("http://localhost:5173", prod)).toBe(false);
    expect(isAllowedOriginValue("https://uvarena.swasilewski.com.evil.example", prod)).toBe(false);
    expect(isAllowedOriginValue("http://localhost:4173", env)).toBe(true);
    expect(isAllowedOriginValue("http://127.0.0.1:5173", env)).toBe(true);
    expect(isAllowedOriginValue("https://localhost:5173", env)).toBe(false);
    expect(isAllowedOriginValue("http://localhost.evil.example", env)).toBe(false);
    expect(isAllowedOriginValue(null, env)).toBe(false);
  });
});
