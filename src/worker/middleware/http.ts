// HTTP helpers shared by every router: ApiError responses, request parsing
// with the zod schemas from src/shared/api-schemas.ts, and the mapping from
// match factory errors to ApiErrors.
//
// Handlers either return apiError(...) or throw an ApiFailure; the app's
// onError (index.ts) turns an ApiFailure into the same JSON body.
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";
import type { ApiError, ApiErrorCode } from "../../shared/api-schemas";
import { MatchFactoryError, type MatchFactoryErrorCode } from "../do/contracts";
import type { HonoEnv, SessionUser } from "../env";

type Extra = { matchId?: string; issues?: { path: string; message: string }[] };

export function errorBody(code: ApiErrorCode, message: string, extra: Extra = {}): ApiError {
  return { error: { code, message, ...extra } };
}

/** A JSON ApiError response. */
export function apiError(c: Context, status: ContentfulStatusCode, code: ApiErrorCode, message: string, extra: Extra = {}) {
  return c.json<ApiError>(errorBody(code, message, extra), status);
}

/** Thrown from handlers; index.ts onError renders it as an ApiError. */
export class ApiFailure extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ApiErrorCode;
  readonly extra: Extra;

  constructor(status: ContentfulStatusCode, code: ApiErrorCode, message: string, extra: Extra = {}) {
    super(message);
    this.name = "ApiFailure";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const notFound = (what = "Not found") => new ApiFailure(404, "not_found", what);

function issuesOf(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
}

function parseWith<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiFailure(400, "bad_request", "Invalid request", { issues: issuesOf(result.error) });
  }
  return result.data;
}

/** Parses and validates the JSON body. 400 bad_request on malformed JSON or schema errors. */
export async function readJson<T extends z.ZodType>(c: Context<HonoEnv>, schema: T): Promise<z.output<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiFailure(400, "bad_request", "Body must be JSON");
  }
  return parseWith(schema, raw);
}

/** Validates the query string (single values per key). */
export function readQuery<T extends z.ZodType>(c: Context<HonoEnv>, schema: T): z.output<T> {
  return parseWith(schema, c.req.query());
}

/** Validates one path parameter. 404 when it cannot be a valid id. */
export function readParam<T extends z.ZodType>(c: Context<HonoEnv>, name: string, schema: T): z.output<T> {
  const result = schema.safeParse(c.req.param(name));
  if (!result.success) throw notFound();
  return result.data;
}

/** The signed-in user. Only call behind requireUser. */
export function currentUser(c: Context<HonoEnv>): SessionUser {
  const user = c.get("user");
  if (!user) throw new ApiFailure(401, "unauthorised", "Sign in first");
  return user;
}

/** Match creation and the queue need a username (Google sign-ups pick one in onboarding). */
export function requireUsername(user: SessionUser): void {
  if (!user.username) throw new ApiFailure(403, "forbidden", "Pick a username first");
}

const FACTORY_ERRORS: Record<MatchFactoryErrorCode, { status: ContentfulStatusCode; code: ApiErrorCode }> = {
  already_in_match: { status: 409, code: "already_in_match" },
  unknown_course: { status: 404, code: "not_found" },
  bot_locked: { status: 403, code: "bot_locked" },
  no_questions: { status: 409, code: "no_questions" },
  user_not_found: { status: 404, code: "not_found" },
  lobby_not_found: { status: 404, code: "not_found" },
  lobby_full: { status: 409, code: "lobby_full" },
  lobby_expired: { status: 410, code: "lobby_expired" },
};

/** Maps a MatchFactoryError to an ApiFailure; rethrows anything else. */
export function rethrowFactoryError(err: unknown): never {
  if (err instanceof MatchFactoryError || (err instanceof Error && err.name === "MatchFactoryError")) {
    const e = err as MatchFactoryError;
    const mapped = FACTORY_ERRORS[e.code] ?? { status: 500 as const, code: "internal" as const };
    throw new ApiFailure(mapped.status, mapped.code, e.message, e.matchId ? { matchId: e.matchId } : {});
  }
  throw err;
}
