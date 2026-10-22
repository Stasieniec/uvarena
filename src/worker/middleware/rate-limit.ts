// AUTH_LIMITER (wrangler.jsonc ratelimits) on the Better Auth endpoints that
// take a password or send email. Better Auth's own in-memory limiter is off
// (it is per isolate, so useless on Workers). API_LIMITER per user on the
// endpoints that create rows, Durable Objects or socket connections.
import type { Context, MiddlewareHandler } from "hono";
import { AUTH_BASE_PATH } from "../auth";
import type { HonoEnv } from "../env";
import { apiError } from "./http";
import { isTestMode } from "./test-mode";

/** Better Auth paths (after /api/auth) that are rate limited, POST only. */
export const RATE_LIMITED_AUTH_PATHS: readonly string[] = [
  "/sign-up/email",
  "/sign-in/email",
  "/sign-in/username",
  "/request-password-reset",
  "/forget-password",
  "/reset-password",
  "/send-verification-email",
];

export function isRateLimitedAuthPath(method: string, pathname: string): boolean {
  if (method !== "POST" || !pathname.startsWith(AUTH_BASE_PATH)) return false;
  const rest = pathname.slice(AUTH_BASE_PATH.length).replace(/\/+$/, "");
  return RATE_LIMITED_AUTH_PATHS.includes(rest);
}

/**
 * AUTH_LIMITER keyed by cf-connecting-ip on sign-up, sign-in and password
 * reset. 429 ApiError when limited. Skipped in test mode (the E2E suite signs
 * up many users from one address). A limiter failure lets the request through.
 */
export const authRateLimit: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const url = new URL(c.req.url);
  if (isRateLimitedAuthPath(c.req.method, url.pathname) && !isTestMode(c.env, c.req.raw) && c.env.AUTH_LIMITER) {
    const ip = c.req.header("cf-connecting-ip") ?? "unknown";
    let allowed = true;
    try {
      ({ success: allowed } = await c.env.AUTH_LIMITER.limit({ key: `auth:${ip}` }));
    } catch (err) {
      console.error("rate limit: limiter failed", err);
    }
    if (!allowed) return apiError(c, 429, "rate_limited", "Too many attempts. Wait a minute and try again.");
  }
  await next();
};

/** What a user does that API_LIMITER counts, each with its own budget. */
export type LimitedAction = "lobby" | "join" | "bot" | "queue" | "match_ws" | "report";

/**
 * Whether the user may do `action` now. Always true in test mode, and when
 * the limiter itself fails (it is a cost guard, not a security boundary).
 */
export async function userAllowed(c: Context<HonoEnv>, action: LimitedAction, userId: string): Promise<boolean> {
  if (isTestMode(c.env, c.req.raw) || !c.env.API_LIMITER) return true;
  try {
    const { success } = await c.env.API_LIMITER.limit({ key: `${action}:${userId}` });
    return success;
  } catch (err) {
    console.error("rate limit: limiter failed", err);
    return true;
  }
}

/** 429 rate_limited when the signed-in user is over their budget for `action`. Use after requireUser. */
export function userRateLimit(action: LimitedAction): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const user = c.get("user");
    if (user && !(await userAllowed(c, action, user.id))) {
      return apiError(c, 429, "rate_limited", "Too many requests. Wait a minute and try again.");
    }
    await next();
  };
}
