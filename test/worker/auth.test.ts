// Sign-up, sign-in, /me, onboarding flag, config, password reset without email.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { ConfigResponseSchema, MeResponseSchema } from "@shared/api-schemas";
import { mapGoogleProfile } from "../../src/worker/auth";
import { call, cookieFrom, json, signUp } from "./helpers";

describe("config", () => {
  it("reports test mode on localhost, Google and email off without secrets", async () => {
    const body = ConfigResponseSchema.parse(await json(await call("/api/config")));
    expect(body).toEqual({ googleEnabled: false, emailEnabled: false, testMode: true });
  });

  it("is not test mode for a request to another host", async () => {
    const body = await json(await call("/api/config", { base: "http://ragequiz.example" }));
    expect(body.testMode).toBe(false);
  });
});

describe("sign-up and /me", () => {
  it("signs up with username, first name and surname, and /me reflects it", async () => {
    const s = await signUp("Zeus_Main.99");
    const me = MeResponseSchema.parse(await json(await call("/api/me", { cookie: s })));
    expect(me.user.username).toBe("zeus_main.99");
    expect(me.user.displayUsername).toBe("Zeus_Main.99");
    expect(me.user.firstName).toBe("Ada");
    expect(me.user.lastName).toBe("Lovelace");
    expect(me.user.name).toBe("Ada Lovelace");
    expect(me.user.role).toBe("user");
    expect(me.user.emailVerified).toBe(false);
    expect(me.needsOnboarding).toBe(false);
    expect(me.activeMatchId).toBeNull();
    expect(me.prefs).toEqual({ loadout: ["zeus", "aegis", "oracle"], sound: true, courseId: null });
  });

  it("rejects a missing surname, a short password, a bad or taken username", async () => {
    const base = { email: "x1@example.com", password: "password123", name: "x", username: "xone", firstName: "X", lastName: "Y" };
    expect((await call("/api/auth/sign-up/email", { json: { ...base, lastName: "  " } })).status).toBe(400);
    expect((await call("/api/auth/sign-up/email", { json: { ...base, password: "short" } })).status).toBe(400);
    expect((await call("/api/auth/sign-up/email", { json: { ...base, username: "no spaces" } })).status).toBe(400);
    expect((await call("/api/auth/sign-up/email", { json: { ...base, username: "ab" } })).status).toBe(400);
    await signUp("taken");
    const dup = await call("/api/auth/sign-up/email", { json: { ...base, email: "other@example.com", username: "TAKEN" } });
    expect(dup.status).toBe(400);
  });

  it("ignores a role sent at sign-up", async () => {
    const s = await signUp("sneaky", { role: "admin" });
    const me = await json(await call("/api/me", { cookie: s }));
    expect(me.user.role).toBe("user");
  });

  it("signs in by username and by email", async () => {
    await signUp("signer");
    const byName = await call("/api/auth/sign-in/username", { json: { username: "Signer", password: "password123" } });
    expect(byName.status).toBe(200);
    expect(cookieFrom(byName)).toContain("session_token");
    const byEmail = await call("/api/auth/sign-in/email", { json: { email: "signer@example.com", password: "password123" } });
    expect(byEmail.status).toBe(200);
    const wrong = await call("/api/auth/sign-in/username", { json: { username: "signer", password: "nope12345" } });
    expect(wrong.status).toBe(401);
  });

  it("returns 401 without a session", async () => {
    const res = await call("/api/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "unauthorised" } });
  });

  it("flags onboarding for a user without a username (Google sign-up)", async () => {
    const s = await signUp("willgo");
    await env.DB.prepare("UPDATE user SET username = NULL, display_username = NULL WHERE id = ?").bind(s.userId).run();
    const me = await json(await call("/api/me", { cookie: s }));
    expect(me.needsOnboarding).toBe(true);
    const lobby = await call("/api/lobbies", { cookie: s, json: { courseId: "agai", powerups: true, rated: true } });
    expect(lobby.status).toBe(403);
    // Onboarding: PATCH /me sets the username.
    const patched = await json(await call("/api/me", { method: "PATCH", cookie: s, json: { username: "Picked" } }));
    expect(patched.user.username).toBe("picked");
    expect((await json(await call("/api/me", { cookie: s }))).needsOnboarding).toBe(false);
  });

  it("explains that password reset is unavailable while email is off", async () => {
    const res = await call("/api/auth/request-password-reset", { json: { email: "a@example.com" } });
    expect(res.status).toBe(403);
    const body = await res.json<{ error: { message: string } }>();
    expect(body.error.message).toMatch(/not available/);
  });

  it("signs out", async () => {
    const s = await signUp("leaver");
    const out = await call("/api/auth/sign-out", { method: "POST", cookie: s, json: {} });
    expect(out.status).toBe(200);
    expect((await call("/api/me", { cookie: s })).status).toBe(401);
  });
});

describe("Google profile mapping", () => {
  it("copies given name, family name and picture", () => {
    expect(mapGoogleProfile({ given_name: "Ada", family_name: "Lovelace", picture: "https://x/p.jpg", name: "Ada Lovelace" })).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      image: "https://x/p.jpg",
    });
  });

  it("falls back to the display name and allows a missing family name", () => {
    expect(mapGoogleProfile({ name: "Plato" })).toEqual({ firstName: "Plato", lastName: "" });
  });
});

describe("Origin checks", () => {
  it("trusts both local dev ports (5173 dev, 4173 preview) for Better Auth", async () => {
    for (const origin of ["http://localhost:5173", "http://localhost:4173"]) {
      const name = `port${origin.slice(-4)}`;
      const res = await call("/api/auth/sign-up/email", {
        origin,
        json: { email: `${name}@example.com`, password: "password123", name: "x", username: name, firstName: "A", lastName: "B" },
      });
      expect(res.status, origin).toBe(200);
    }
  });

  it("refuses a foreign Origin on Better Auth and on app mutations", async () => {
    const s = await signUp("origincheck");
    const auth = await call("/api/auth/sign-in/username", { origin: "https://evil.example", json: { username: "origincheck", password: "password123" } });
    expect(auth.status).toBe(403);
    const patch = await call("/api/me", { method: "PATCH", cookie: s, origin: "https://evil.example", json: { firstName: "Mallory" } });
    expect(patch.status).toBe(403);
  });
});
