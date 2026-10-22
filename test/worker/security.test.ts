// Regression tests for the security review: the auth secret, Better Auth's own
// profile endpoints, avatar ownership, round detail, rate limits and headers.
import { env } from "cloudflare:workers";
import { createExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index";
import { authSecretProblem, createAuth } from "../../src/worker/auth";
import type { Env } from "../../src/worker/env";
import { call, json, signUp } from "./helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

const deployed = (overrides: Partial<Env>): Env => ({ ...env, APP_URL: "https://quiz.example", TEST_MODE: undefined, ...overrides }) as Env;

describe("BETTER_AUTH_SECRET", () => {
  it("is required, long and not a published value outside local dev", () => {
    expect(authSecretProblem(deployed({ BETTER_AUTH_SECRET: undefined as unknown as string }))).toMatch(/not set/);
    expect(authSecretProblem(deployed({ BETTER_AUTH_SECRET: "  " }))).toMatch(/not set/);
    expect(authSecretProblem(deployed({ BETTER_AUTH_SECRET: "short-secret" }))).toMatch(/shorter/);
    expect(authSecretProblem(deployed({ BETTER_AUTH_SECRET: "better-auth-secret-12345678901234567890" }))).toMatch(/published/);
    expect(authSecretProblem(deployed({ BETTER_AUTH_SECRET: "q0vX0m3l0Yq1oO8R1cH2zH9V6g0b0w3J5x0e9d6t7Ck=" }))).toBeNull();
    // Local dev and tests accept their own secrets.
    expect(authSecretProblem({ ...env, BETTER_AUTH_SECRET: "" } as Env)).toBeNull();
  });

  it("createAuth refuses to build Better Auth without it", () => {
    expect(() => createAuth(env.DB, deployed({ BETTER_AUTH_SECRET: "" }))).toThrow(/auth misconfigured/);
  });

  it("the deployed Worker answers 503 on every API route, health and auth included", async () => {
    const bad = deployed({ BETTER_AUTH_SECRET: "" });
    for (const path of ["/api/health", "/api/auth/get-session", "/api/me"]) {
      const res = await worker.fetch(new Request(`https://quiz.example${path}`), bad, createExecutionContext());
      expect(res.status).toBe(503);
    }
    const good = deployed({ BETTER_AUTH_SECRET: "q0vX0m3l0Yq1oO8R1cH2zH9V6g0b0w3J5x0e9d6t7Ck=" });
    const ok = await worker.fetch(new Request("https://quiz.example/api/health"), good, createExecutionContext());
    expect(ok.status).toBe(200);
  });
});

describe("Better Auth profile writes", () => {
  it("refuses /update-user, so name, image and displayUsername stay with the app's endpoints", async () => {
    const s = await signUp("honest");
    for (const body of [{ displayUsername: "stas" }, { image: "https://evil.example/x.png" }, { name: "Someone Else" }, { firstName: "X" }]) {
      const res = await call("/api/auth/update-user", { cookie: s, json: body });
      expect(res.status).toBe(403);
    }
    const me = await json(await call("/api/me", { cookie: s }));
    expect(me.user).toMatchObject({ displayUsername: "honest", image: null, name: "Ada Lovelace", firstName: "Ada" });
  });

  it("refuses an image, a different displayUsername or a non-string username at sign-up", async () => {
    const base = { email: "fresh1@example.com", password: "password123", name: "x", username: "freshone", firstName: "A", lastName: "B" };
    expect((await call("/api/auth/sign-up/email", { json: { ...base, image: "https://evil.example/x.png" } })).status).toBe(400);
    expect((await call("/api/auth/sign-up/email", { json: { ...base, displayUsername: "stas" } })).status).toBe(400);
    expect((await call("/api/auth/sign-up/email", { json: { ...base, username: 7 } })).status).toBe(400);
    // The same casing as the username is fine (the client may send it).
    const ok = await call("/api/auth/sign-up/email", { json: { ...base, displayUsername: "freshone" } });
    expect(ok.status).toBe(200);
  });
});

describe("avatar deletion", () => {
  it("never deletes another user's object, whatever the stored image says", async () => {
    const victim = await signUp("victim");
    const up = await call("/api/me/avatar", { method: "PUT", cookie: victim.cookie, body: PNG as BodyInit, headers: { "Content-Type": "image/png" } });
    const { image } = await json<{ image: string }>(up);
    const attacker = await signUp("attacker");
    await env.DB.prepare("UPDATE user SET image = ? WHERE id = ?").bind(image, attacker.userId).run();

    expect(await json(await call("/api/me/avatar", { method: "DELETE", cookie: attacker }))).toEqual({ image: null });
    // Uploading over the borrowed URL does not delete it either.
    await env.DB.prepare("UPDATE user SET image = ? WHERE id = ?").bind(image, attacker.userId).run();
    await call("/api/me/avatar", { method: "PUT", cookie: attacker.cookie, body: PNG as BodyInit, headers: { "Content-Type": "image/png" } });

    const listed = await env.AVATARS.list({ prefix: `avatars/${victim.userId}/` });
    expect(listed.objects).toHaveLength(1);
    expect((await call(image)).status).toBe(200);
  });
});
