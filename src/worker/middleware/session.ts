// Session loading. Better Auth is built once per request (getAuth caches it
// on the Request), and getSession runs with returnHeaders so its daily
// session refresh also refreshes the cookie on the response.
import type { Context, MiddlewareHandler } from "hono";
import { createAuth, type Auth } from "../auth";
import type { HonoEnv, SessionUser } from "../env";
import { apiError } from "./http";

const authByRequest = new WeakMap<Request, Auth>();

/** Better Auth for this request. */
export function getAuth(c: Context<HonoEnv>): Auth {
  let auth = authByRequest.get(c.req.raw);
  if (!auth) {
    let waitUntil: ((p: Promise<unknown>) => void) | undefined;
    try {
      const ctx = c.executionCtx;
      waitUntil = (p) => ctx.waitUntil(p);
    } catch {
      waitUntil = undefined; // no ExecutionContext (some test harnesses)
    }
    auth = createAuth(c.env.DB, c.env, { waitUntil });
    authByRequest.set(c.req.raw, auth);
  }
  return auth;
}

function toSessionUser(u: Record<string, unknown>): SessionUser {
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    id: String(u.id),
    email: String(u.email ?? ""),
    emailVerified: Boolean(u.emailVerified),
    name: String(u.name ?? ""),
    username: str(u.username),
    displayUsername: str(u.displayUsername),
    firstName: String(u.firstName ?? ""),
    lastName: String(u.lastName ?? ""),
    image: str(u.image),
    role: str(u.role) ?? "user",
  };
}

/** Loads the Better Auth session and sets c.var.user and c.var.sessionId (null when signed out). */
export const sessionMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  c.set("user", null);
  c.set("sessionId", null);
  let setCookies: string[] = [];
  // No cookie, no session: skip the database.
  if (c.req.header("Cookie")) {
    const auth = getAuth(c);
    const { headers, response } = await auth.api.getSession({ headers: c.req.raw.headers, returnHeaders: true });
    if (response) {
      c.set("user", toSessionUser(response.user as unknown as Record<string, unknown>));
      c.set("sessionId", response.session.id);
    }
    setCookies = headers?.getSetCookie?.() ?? [];
  }
  await next();
  if (setCookies.length > 0 && c.res.status !== 101) {
    try {
      for (const cookie of setCookies) c.res.headers.append("Set-Cookie", cookie);
    } catch {
      // Immutable headers (a passed-through response): copy it first.
      const res = new Response(c.res.body, c.res);
      for (const cookie of setCookies) res.headers.append("Set-Cookie", cookie);
      c.res = res;
    }
  }
};

/** 401 ApiError unless c.var.user is set. */
export const requireUser: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!c.get("user")) return apiError(c, 401, "unauthorised", "Sign in first");
  await next();
};
