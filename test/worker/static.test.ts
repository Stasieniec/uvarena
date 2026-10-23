// Production static serving from R2 (src/worker/static.ts). The local AVATARS
// bucket stands in for STATIC, filled per test.
import { env } from "cloudflare:workers";
import { createExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index";
import { contentTypeFor, keyForPath, parseHeadersFile, SECURITY_HEADERS } from "../../src/worker/static";

const INDEX_HTML = "<!doctype html><title>uvarena</title>";
const JS = "console.log(1)";

async function fill(): Promise<void> {
  await env.AVATARS.put("index.html", INDEX_HTML);
  await env.AVATARS.put("assets/index-C4yXyga4.js", JS);
  await env.AVATARS.put("favicon.svg", "<svg/>");
}

async function get(path: string, init: RequestInit = {}, withStatic = true): Promise<Response> {
  const e = withStatic ? { ...env, STATIC: env.AVATARS } : env;
  return worker.fetch(new Request(`https://uvarena.swasilewski.com${path}`, init), e, createExecutionContext());
}

describe("static files from R2", () => {
  it("serves index.html at / with no-cache and the security headers", async () => {
    await fill();
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(res.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("ETag")).toMatch(/^"/);
    expect(await res.text()).toBe(INDEX_HTML);
  });

  it("serves hashed assets as immutable with the right type", async () => {
    await fill();
    const res = await get("/assets/index-C4yXyga4.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(await res.text()).toBe(JS);
  });

  it("serves unhashed files with no-cache", async () => {
    await fill();
    const res = await get("/favicon.svg");
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("falls back to index.html for app routes, usernames with dots included", async () => {
    await fill();
    for (const path of ["/profile", "/u/jan.kowalski", "/match/abc", "/missed/run", "/index.html/x/"]) {
      const res = await get(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("Cache-Control"), path).toBe("no-cache");
      expect(await res.text(), path).toBe(INDEX_HTML);
    }
  });

  it("answers a real 404 for missing assets and known file types", async () => {
    await fill();
    for (const path of ["/assets/gone-123.js", "/assets/x", "/robots.txt", "/logo.png"]) {
      const res = await get(path);
      expect(res.status, path).toBe(404);
      expect(res.headers.get("X-Content-Type-Options"), path).toBe("nosniff");
    }
  });

  it("never serves underscore files or path tricks", async () => {
    await fill();
    await env.AVATARS.put("_headers", "secret");
    for (const path of ["/_headers", "/%2e%2e/index.html", "/assets/%2e%2e/index.html", "/%E0%A4%A"]) {
      const res = await get(path);
      expect(await res.text(), path).not.toBe("secret");
    }
  });

  it("answers 304 to a matching If-None-Match", async () => {
    await fill();
    const first = await get("/assets/index-C4yXyga4.js");
    const etag = first.headers.get("ETag")!;
    await first.text();
    const res = await get("/assets/index-C4yXyga4.js", { headers: { "If-None-Match": etag } });
    expect(res.status).toBe(304);
    expect(res.headers.get("ETag")).toBe(etag);
    const stale = await get("/assets/index-C4yXyga4.js", { headers: { "If-None-Match": '"other"' } });
    expect(stale.status).toBe(200);
    expect(await stale.text()).toBe(JS);
  });

  it("supports HEAD without a body and refuses other methods", async () => {
    await fill();
    const head = await get("/profile", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await head.text()).toBe("");
    const post = await get("/profile", { method: "POST" });
    expect(post.status).toBe(405);
    expect(post.headers.get("Allow")).toBe("GET, HEAD");
  });

  it("404s when the bucket is empty", async () => {
    await env.AVATARS.delete(["index.html", "assets/index-C4yXyga4.js", "favicon.svg", "_headers"]);
    expect((await get("/")).status).toBe(404);
  });

  it("leaves /api to the app", async () => {
    await fill();
    const res = await get("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((await get("/api/nope")).headers.get("Content-Type")).toContain("application/json");
  });

  it("without STATIC (local dev, tests) non-api paths still reach the API app only", async () => {
    await fill();
    const res = await get("/profile", {}, false);
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });
});

describe("static helpers", () => {
  it("reads the /* block of public/_headers", () => {
    const names = SECURITY_HEADERS.map(([n]) => n);
    expect(names).toEqual(["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Permissions-Policy"]);
    expect(parseHeadersFile("# c\n/*\n  A: 1\n/x\n  B: 2\n")).toEqual([["A", "1"]]);
  });

  it("maps paths to keys", () => {
    expect(keyForPath("/")).toBe("index.html");
    expect(keyForPath("/assets/a.js")).toBe("assets/a.js");
    expect(keyForPath("/a//b")).toBeNull();
    expect(keyForPath("/a/../b")).toBeNull();
    expect(keyForPath("/_headers")).toBeNull();
    expect(keyForPath("/dir/")).toBeNull();
  });

  it("knows the content types", () => {
    expect(contentTypeFor("assets/x.css")).toBe("text/css; charset=utf-8");
    expect(contentTypeFor("assets/x.woff2")).toBe("font/woff2");
    expect(contentTypeFor("x.unknown")).toBe("application/octet-stream");
  });
});
