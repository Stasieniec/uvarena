// PATCH /me, PUT /me/prefs, avatars.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { call, json, signUp } from "./helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 8, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38]);

describe("PATCH /me", () => {
  it("updates names and username, keeping name in sync", async () => {
    const s = await signUp("renamer");
    const body = await json(await call("/api/me", { method: "PATCH", cookie: s, json: { firstName: " Grace ", lastName: "Hopper", username: "Cobol_Queen" } }));
    expect(body.user).toMatchObject({ firstName: "Grace", lastName: "Hopper", name: "Grace Hopper", username: "cobol_queen", displayUsername: "Cobol_Queen" });
  });

  it("refuses a taken username with username_taken, and invalid input with bad_request", async () => {
    await signUp("firstcome");
    const s = await signUp("latecomer");
    const taken = await call("/api/me", { method: "PATCH", cookie: s, json: { username: "FirstCome" } });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({ error: { code: "username_taken" } });
    // Changing only the case of your own username is fine.
    expect((await call("/api/me", { method: "PATCH", cookie: s, json: { username: "LateComer" } })).status).toBe(200);
    const bad = await call("/api/me", { method: "PATCH", cookie: s, json: { username: "a b" } });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { code: "bad_request", issues: [{ path: "username" }] } });
    expect((await call("/api/me", { method: "PATCH", cookie: s, json: {} })).status).toBe(400);
    expect((await call("/api/me", { method: "PATCH", cookie: s, json: { lastName: "" } })).status).toBe(400);
    expect((await call("/api/me", { method: "PATCH", cookie: s, body: "not json", headers: { "Content-Type": "application/json" } })).status).toBe(400);
  });
});

describe("PUT /me/prefs", () => {
  it("saves a loadout, sound and course, merging partial updates", async () => {
    const s = await signUp("prefs");
    const a = await json(await call("/api/me/prefs", { method: "PUT", cookie: s, json: { loadout: ["nemesis", "phoenix", "hermes"] } }));
    expect(a.prefs).toEqual({ loadout: ["nemesis", "phoenix", "hermes"], sound: true, courseId: null });
    const b = await json(await call("/api/me/prefs", { method: "PUT", cookie: s, json: { sound: false, courseId: "eprm" } }));
    expect(b.prefs).toEqual({ loadout: ["nemesis", "phoenix", "hermes"], sound: false, courseId: "eprm" });
    const me = await json(await call("/api/me", { cookie: s }));
    expect(me.prefs).toEqual(b.prefs);
  });

  it("validates the loadout and the course", async () => {
    const s = await signUp("badprefs");
    const put = (body: unknown) => call("/api/me/prefs", { method: "PUT", cookie: s, json: body });
    expect((await put({ loadout: ["zeus", "zeus", "aegis"] })).status).toBe(400);
    expect((await put({ loadout: ["zeus", "aegis"] })).status).toBe(400);
    expect((await put({ loadout: ["zeus", "aegis", "kraken"] })).status).toBe(400);
    expect((await put({ courseId: "nope" })).status).toBe(400);
    expect((await put({})).status).toBe(400);
  });
});

describe("avatars", () => {
  const upload = (s: { cookie: string }, bytes: Uint8Array | ArrayBuffer, type: string) =>
    call("/api/me/avatar", { method: "PUT", cookie: s.cookie, body: bytes as BodyInit, headers: { "Content-Type": type } });

  it("uploads PNG, JPEG and WebP, serves them with an immutable cache, and replaces the old object", async () => {
    const s = await signUp("pictured");
    const first = await json(await upload(s, PNG, "image/png"));
    expect(first.image).toMatch(new RegExp(`^/api/avatars/${s.userId}\\.[0-9a-f]+\\.png$`));
    const served = await call(first.image);
    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/png");
    expect(served.headers.get("Cache-Control")).toContain("immutable");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG);

    const second = await json(await upload(s, JPEG, "image/jpeg"));
    expect(second.image).toMatch(/\.jpg$/);
    expect((await call(first.image)).status).toBe(404); // old object deleted
    expect((await json(await call("/api/me", { cookie: s }))).user.image).toBe(second.image);

    const third = await json(await upload(s, WEBP, "image/webp"));
    expect(third.image).toMatch(/\.webp$/);
  });

  it("refuses wrong types, mismatched magic bytes, empty and oversized bodies", async () => {
    const s = await signUp("refused");
    expect((await upload(s, PNG, "image/gif")).status).toBe(415);
    expect((await upload(s, new TextEncoder().encode("<svg></svg>"), "image/png")).status).toBe(415);
    expect((await upload(s, JPEG, "image/png")).status).toBe(415);
    expect((await upload(s, new Uint8Array(0), "image/png")).status).toBe(400);
    const big = new Uint8Array(512 * 1024 + 1);
    big.set(PNG);
    const tooBig = await upload(s, big, "image/png");
    expect(tooBig.status).toBe(413);
    expect(await tooBig.json()).toMatchObject({ error: { code: "payload_too_large" } });
    const exact = new Uint8Array(512 * 1024);
    exact.set(PNG);
    expect((await upload(s, exact, "image/png")).status).toBe(200);
  });

  it("deletes the avatar", async () => {
    const s = await signUp("unpictured");
    const { image } = await json(await upload(s, PNG, "image/png"));
    expect(await json(await call("/api/me/avatar", { method: "DELETE", cookie: s }))).toEqual({ image: null });
    expect((await call(image)).status).toBe(404);
    const listed = await env.AVATARS.list({ prefix: `avatars/${s.userId}/` });
    expect(listed.objects).toHaveLength(0);
  });

  it("needs a session to upload, none to view, and 404s unknown keys", async () => {
    expect((await call("/api/me/avatar", { method: "PUT", body: PNG, headers: { "Content-Type": "image/png" } })).status).toBe(401);
    expect((await call("/api/avatars/nothing.here.png")).status).toBe(404);
    expect((await call("/api/avatars/..%2F..%2Fsecret")).status).toBe(404);
  });
});
