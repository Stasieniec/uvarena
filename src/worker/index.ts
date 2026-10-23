// Worker entry: the Hono app under /api plus the Durable Object classes.
// Locally the SPA is served by Workers Static Assets and only /api/* runs the
// Worker first (wrangler.jsonc run_worker_first). The production deploy has
// no assets and a STATIC R2 bucket instead (scripts/deploy.ts), so there every
// other path is served from R2 by serveStatic.
//
// Order matters: public routes and Better Auth come before the session
// middleware; every app route that needs a user says so with requireUser.
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ApiError, ConfigResponse, HealthResponse } from "../shared/api-schemas";
import { authSecretProblem, googleEnabled } from "./auth";
import { emailEnabled } from "./email";
import type { HonoEnv } from "./env";
import { ApiFailure, apiError, errorBody } from "./middleware/http";
import { checkMutationOrigin } from "./middleware/origin";
import { authRateLimit } from "./middleware/rate-limit";
import { getAuth, sessionMiddleware } from "./middleware/session";
import { isTestMode } from "./middleware/test-mode";
import { avatarsRoutes } from "./routes/avatars";
import { botMatchesRoutes } from "./routes/bot-matches";
import { botsRoutes } from "./routes/bots";
import { coursesRoutes } from "./routes/courses";
import { homeRoutes } from "./routes/home";
import { leaderboardsRoutes } from "./routes/leaderboards";
import { lobbiesRoutes } from "./routes/lobbies";
import { matchesRoutes } from "./routes/matches";
import { meRoutes } from "./routes/me";
import { missedRoutes } from "./routes/missed";
import { queueRoutes } from "./routes/queue";
import { reportsRoutes } from "./routes/reports";
import { testRoutes } from "./routes/test";
import { usersRoutes } from "./routes/users";
import { serveStatic } from "./static";

export { Matchmaker } from "./do/matchmaker";
export { MatchRoom } from "./do/match-room";

const app = new Hono<HonoEnv>().basePath("/api");

// Fail closed: a deployed Worker without a real BETTER_AUTH_SECRET would sign
// sessions with Better Auth's public default. Every API request, /health
// included, is refused until the secret is set.
app.use("*", async (c, next) => {
  const problem = authSecretProblem(c.env);
  if (problem) {
    console.error(`refusing requests: ${problem}`);
    return c.json<ApiError>(errorBody("internal", "The server is not configured yet"), 503);
  }
  await next();
});

// API responses are JSON (avatars set their own stricter headers): never
// sniffed, never framed, no referrer to other sites.
app.use("*", async (c, next) => {
  await next();
  if (c.res.status === 101) return;
  const set = (res: Response) => {
    if (!res.headers.has("X-Content-Type-Options")) res.headers.set("X-Content-Type-Options", "nosniff");
    if (!res.headers.has("Content-Security-Policy")) res.headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  };
  try {
    set(c.res);
  } catch {
    // Immutable headers (a passed-through response): copy it first.
    const res = new Response(c.res.body, c.res);
    set(res);
    c.res = res;
  }
});

app.use("*", checkMutationOrigin);

app.get("/health", (c) => c.json<HealthResponse>({ ok: true }));

app.get("/config", (c) =>
  c.json<ConfigResponse>({
    googleEnabled: googleEnabled(c.env),
    emailEnabled: emailEnabled(c.env),
    testMode: isTestMode(c.env, c.req.raw),
  }),
);

// Better Auth. Password reset needs email; without it, say so plainly.
app.use("/auth/*", authRateLimit);
app.post("/auth/request-password-reset", async (c, next) => {
  if (!emailEnabled(c.env)) {
    return apiError(c, 403, "forbidden", "Password reset is not available yet. Ask Stas to reset your password.");
  }
  await next();
});
app.on(["GET", "POST"], "/auth/*", (c) => getAuth(c).handler(c.req.raw));

app.use("*", sessionMiddleware);

app.route("/", testRoutes);
app.route("/", meRoutes);
app.route("/", avatarsRoutes);
app.route("/", coursesRoutes);
app.route("/", homeRoutes);
app.route("/", botsRoutes);
app.route("/", botMatchesRoutes);
app.route("/", lobbiesRoutes);
app.route("/", queueRoutes);
app.route("/", matchesRoutes);
app.route("/", usersRoutes);
app.route("/", leaderboardsRoutes);
app.route("/", missedRoutes);
app.route("/", reportsRoutes);

app.notFound((c) => c.json<ApiError>({ error: { code: "not_found", message: "Not found" } }, 404));

app.onError((err, c) => {
  if (err instanceof ApiFailure) return c.json<ApiError>(errorBody(err.code, err.message, err.extra), err.status);
  if (err instanceof HTTPException && err.status < 500) {
    return c.json<ApiError>(errorBody("bad_request", err.message || "Bad request"), err.status);
  }
  console.error(err);
  return c.json<ApiError>(errorBody("internal", "Internal error"), 500);
});

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export default {
  fetch(request: Request, env: HonoEnv["Bindings"], ctx: ExecutionContext) {
    if (env.STATIC && !isApiPath(new URL(request.url).pathname)) return serveStatic(request, env.STATIC);
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<HonoEnv["Bindings"]>;
