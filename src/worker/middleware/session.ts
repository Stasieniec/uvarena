// STUB (Worker API and auth package).
import type { MiddlewareHandler } from "hono";
import { notImplemented } from "../../shared/not-implemented";
import type { HonoEnv } from "../env";

/** Loads the Better Auth session and sets c.var.user and c.var.sessionId (null when signed out). */
export const sessionMiddleware: MiddlewareHandler<HonoEnv> = async () => notImplemented("middleware.sessionMiddleware");

/** 401 ApiError unless c.var.user is set. */
export const requireUser: MiddlewareHandler<HonoEnv> = async () => notImplemented("middleware.requireUser");
