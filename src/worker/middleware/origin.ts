// STUB (Worker API and auth package).
import type { MiddlewareHandler } from "hono";
import { notImplemented } from "../../shared/not-implemented";
import type { Env, HonoEnv } from "../env";

/** Origin === env.APP_URL. */
export function isAllowedOrigin(request: Request, env: Env): boolean {
  void request; void env;
  return notImplemented("middleware.isAllowedOrigin");
}

/** 403 unless the Origin header is allowed. Used on WebSocket upgrades. */
export const requireOrigin: MiddlewareHandler<HonoEnv> = async () => notImplemented("middleware.requireOrigin");
