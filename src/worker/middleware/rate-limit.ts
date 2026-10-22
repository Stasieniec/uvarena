// STUB (Worker API and auth package).
import type { MiddlewareHandler } from "hono";
import { notImplemented } from "../../shared/not-implemented";
import type { HonoEnv } from "../env";

/** AUTH_LIMITER keyed by cf-connecting-ip on sign-up, sign-in and password reset. 429 ApiError when limited. */
export const authRateLimit: MiddlewareHandler<HonoEnv> = async () => notImplemented("middleware.authRateLimit");
