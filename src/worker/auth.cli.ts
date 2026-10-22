// Entry point for the Better Auth schema generator:
//   npx auth@1.7.12 generate --config src/worker/auth.cli.ts --output src/worker/db/auth-schema.ts
// Builds the same options as createAuth with a placeholder D1 handle (never
// queried) and exports them as `auth`. Imports nothing from cloudflare:*, so it
// loads in Node. Google is configured here so the generator sees every field.
import { betterAuth } from "better-auth";
import { authOptions } from "./auth";
import type { Env } from "./env";

const placeholderEnv = {
  APP_URL: "http://localhost:5173",
  NOTES_URL: "https://notes.example",
  BETTER_AUTH_SECRET: "schema-generation-only-0123456789abcdef",
  GOOGLE_CLIENT_ID: "schema-generation-only",
  GOOGLE_CLIENT_SECRET: "schema-generation-only",
} as unknown as Env;

export const auth = betterAuth(authOptions({} as D1Database, placeholderEnv));
