// STUB (Worker API and auth package).
import type { MiddlewareHandler } from "hono";
import { notImplemented } from "../../shared/not-implemented";
import type { Env, HonoEnv } from "../env";

/** TEST_MODE === "1" and the request comes from localhost. Both checked. */
export function isTestMode(env: Env, request: Request): boolean {
  void env; void request;
  return notImplemented("middleware.isTestMode");
}

/** 404 unless isTestMode. */
export const testModeOnly: MiddlewareHandler<HonoEnv> = async () => notImplemented("middleware.testModeOnly");
