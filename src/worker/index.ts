// Worker entry: the Hono app under /api plus the Durable Object classes.
// Static assets (the SPA) are served by the assets binding; only /api/* runs
// the Worker first (wrangler.jsonc run_worker_first).
//
// Scaffold version: only /api/health. The Worker API and auth package owns
// this file and mounts the routers from ./routes.
import { Hono } from "hono";
import type { ApiError, HealthResponse } from "../shared/api-schemas";
import type { HonoEnv } from "./env";

export { Matchmaker } from "./do/matchmaker";
export { MatchRoom } from "./do/match-room";

const app = new Hono<HonoEnv>().basePath("/api");

app.get("/health", (c) => c.json<HealthResponse>({ ok: true }));

app.notFound((c) => c.json<ApiError>({ error: { code: "not_found", message: "Not found" } }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json<ApiError>({ error: { code: "internal", message: "Internal error" } }, 500);
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<HonoEnv["Bindings"]>;
