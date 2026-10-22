// STUB (Worker API and auth package). Better Auth, built per request.
// No module-level Cloudflare imports, so `npx auth@latest generate` can load
// auth.cli.ts in Node.
import type { betterAuth } from "better-auth";
import { notImplemented } from "../shared/not-implemented";
import type { Env } from "./env";

export type Auth = ReturnType<typeof betterAuth>;

/** Better Auth on the Drizzle adapter over D1, base path /api/auth. See build-plan.md "Auth". */
export function createAuth(db: D1Database, env: Env): Auth {
  void db; void env;
  return notImplemented("auth.createAuth");
}

/** Whether Google sign-in is configured (both secrets set). */
export function googleEnabled(env: Env): boolean {
  void env;
  return notImplemented("auth.googleEnabled");
}
