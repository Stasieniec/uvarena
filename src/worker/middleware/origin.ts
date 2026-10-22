// Origin checks.
//
// Production: the only allowed origin is APP_URL's origin.
//
// Local (APP_URL points at localhost or 127.0.0.1, which is the case in dev,
// in `vite preview` for the E2E suite, and in the workerd tests): any
// http://localhost:<port> or http://127.0.0.1:<port> origin is also allowed.
// `npm run dev` serves on :5173 but Playwright runs `vite preview` on :4173,
// and parallel agents use their own ports, while .dev.vars holds a single
// APP_URL. Better Auth's baseURL and trustedOrigins follow the same rule
// (auth.ts). A production APP_URL is https and never local, so this can never
// widen what production accepts.
import type { MiddlewareHandler } from "hono";
import type { Env, HonoEnv } from "../env";
import { apiError } from "./http";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** http://localhost:<any port>, http://127.0.0.1:<any port>. */
export function isLocalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && LOCAL_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

/** The request was addressed to localhost (its URL, which is what the runtime routed on). */
export function isLocalRequest(request: Request): boolean {
  try {
    return LOCAL_HOSTNAMES.has(new URL(request.url).hostname);
  } catch {
    return false;
  }
}

/** Dev and test deployments: APP_URL is a localhost URL. */
export function isLocalApp(env: Env): boolean {
  return isLocalUrl(env.APP_URL);
}

/** APP_URL's origin (scheme, host and port, no path). */
export function appOrigin(env: Env): string {
  return new URL(env.APP_URL).origin;
}

/** Whether an Origin header value is allowed. Null (no header) is not. */
export function isAllowedOriginValue(origin: string | null | undefined, env: Env): boolean {
  if (!origin) return false;
  if (origin === appOrigin(env)) return true;
  return isLocalApp(env) && isLocalUrl(origin);
}

/** Origin === APP_URL (plus any localhost origin when APP_URL is local, see above). */
export function isAllowedOrigin(request: Request, env: Env): boolean {
  return isAllowedOriginValue(request.headers.get("Origin"), env);
}

/** 403 unless the Origin header is allowed. Used on WebSocket upgrades. */
export const requireOrigin: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!isAllowedOrigin(c.req.raw, c.env)) return apiError(c, 403, "forbidden", "Origin not allowed");
  await next();
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF guard for the app's own state-changing endpoints: a browser always
 * sends Origin on POST, PUT, PATCH and DELETE, so a present Origin that is not
 * ours is refused. Requests without Origin (curl, server-side tests) cannot
 * carry a victim's cookies from another site and pass.
 */
export const checkMutationOrigin: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method)) {
    const origin = c.req.header("Origin");
    if (origin !== undefined && !isAllowedOriginValue(origin, c.env)) {
      return apiError(c, 403, "forbidden", "Origin not allowed");
    }
  }
  await next();
};
