// Scaffold smoke test (workerd): the Worker answers /api/health through
// exports.default.fetch, and D1 has the migrations applied and courses seeded.
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { HealthResponseSchema } from "@shared/api-schemas";

describe("worker scaffold", () => {
  it("serves /api/health", async () => {
    const res = await exports.default.fetch("http://localhost/api/health");
    expect(res.status).toBe(200);
    expect(HealthResponseSchema.parse(await res.json())).toEqual({ ok: true });
  });

  it("returns a JSON 404 for unknown API routes", async () => {
    const res = await exports.default.fetch("http://localhost/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("has the D1 schema and the seeded course (Engineering was removed in 0001)", async () => {
    const { results } = await env.DB.prepare("SELECT id, code, active FROM courses ORDER BY sort").all();
    expect(results).toEqual([{ id: "agai", code: "AGAI", active: 1 }]);
    const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>();
    const names = tables.results.map((t) => t.name);
    for (const t of ["user", "session", "questions", "matches", "missed_questions", "match_finalizations"]) {
      expect(names).toContain(t);
    }
  });
});
