// Drizzle over D1 with the app and auth schema.
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../../env";
import * as schema from "../schema";

export function getDb(env: Env) {
  return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof getDb>;

/** True for a SQLite UNIQUE or PRIMARY KEY violation, as D1 reports it. */
export function isUniqueViolation(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? "")}` : String(err);
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(text);
}
