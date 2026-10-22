// Test mode: TEST_MODE=1, the request was addressed to localhost, and APP_URL
// is a localhost URL. All three are checked, so a stray TEST_MODE var on a
// deployed Worker still cannot turn it on for requests to the real domain.
import type { MiddlewareHandler } from "hono";
import type { Env, HonoEnv } from "../env";
import { apiError } from "./http";
import { isLocalApp, isLocalRequest } from "./origin";

/** TEST_MODE === "1" and the request comes from localhost. Both checked. */
export function isTestMode(env: Env, request: Request): boolean {
  return env.TEST_MODE === "1" && isLocalRequest(request) && isLocalApp(env);
}

/** 404 unless isTestMode. */
export const testModeOnly: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!isTestMode(c.env, c.req.raw)) return apiError(c, 404, "test_mode_off", "Not found");
  await next();
};
