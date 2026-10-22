// Helpers for the Worker API tests: requests through exports.default.fetch,
// sign-up with Better Auth, and direct D1 inserts for rows other packages
// write (matches, rounds, missed questions, ratings).
import { env, exports } from "cloudflare:workers";
import { expect } from "vitest";

export const BASE = "http://localhost";
export const ORIGIN = "http://localhost";

export interface Session {
  cookie: string;
  userId: string;
  username: string;
}

export interface CallOptions {
  method?: string;
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
  cookie?: string | Session;
  origin?: string | null;
  base?: string;
  /** Override the fetch (tests that mock modules call the imported worker directly). */
  fetcher?: (request: Request) => Promise<Response>;
}

/** A request to the Worker. JSON bodies get Content-Type; mutations get the local Origin by default. */
export async function call(path: string, opts: CallOptions = {}): Promise<Response> {
  const method = opts.method ?? (opts.json !== undefined ? "POST" : "GET");
  const headers = new Headers(opts.headers);
  if (opts.json !== undefined) headers.set("Content-Type", "application/json");
  const origin = opts.origin === undefined ? (method === "GET" ? null : ORIGIN) : opts.origin;
  if (origin) headers.set("Origin", origin);
  const cookie = typeof opts.cookie === "string" ? opts.cookie : opts.cookie?.cookie;
  if (cookie) headers.set("Cookie", cookie);
  const request = new Request(`${opts.base ?? BASE}${path}`, {
    method,
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
  });
  return opts.fetcher ? opts.fetcher(request) : exports.default.fetch(request);
}

export async function json<T = any>(res: Response, status = 200): Promise<T> {
  const text = await res.text();
  if (res.status !== status) throw new Error(`expected ${status}, got ${res.status}: ${text}`);
  return JSON.parse(text) as T;
}

/** "name=value; name2=value2" from Set-Cookie headers. */
export function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .filter((c) => !c.endsWith("="))
    .join("; ");
}

let counter = 0;

/** Signs up a fresh user and returns its session cookie. */
export async function signUp(username?: string, extra: Record<string, unknown> = {}): Promise<Session> {
  const name = username ?? `user${Date.now() % 100000}${counter++}`;
  const res = await call("/api/auth/sign-up/email", {
    json: {
      email: `${name.toLowerCase()}@example.com`,
      password: "password123",
      name: "ignored",
      username: name,
      firstName: "Ada",
      lastName: "Lovelace",
      ...extra,
    },
  });
  const body = await json<{ user: { id: string } }>(res);
  const cookie = cookieFrom(res);
  expect(cookie).toContain("session_token");
  return { cookie, userId: body.user.id, username: name.toLowerCase() };
}

/** Seeds the fixture bank and alice and bob through the test route. */
export async function seed(): Promise<{ users: { id: string; username: string }[]; questions: number }> {
  return json(await call("/api/test/seed", { method: "POST" }));
}

export const now = () => Date.now();

/** Inserts a matches row with sensible defaults. */
export async function insertMatch(row: Partial<Record<string, unknown>> & { id: string; player_a: string }): Promise<void> {
  const defaults: Record<string, unknown> = {
    course_id: "agai",
    mode: "ranked",
    rated: 1,
    join_code: null,
    status: "finished",
    player_b: null,
    bot_level: null,
    bot_rating: null,
    settings_json: JSON.stringify({ powerups: true, lectures: null }),
    winner: "a",
    end_reason: "hp",
    rounds_played: 1,
    hp_a: 6000,
    hp_b: 0,
    rating_a_before: 1500,
    rating_a_after: 1662,
    rating_b_before: 1500,
    rating_b_after: 1338,
    bot_rating_before: null,
    bot_rating_after: null,
    pair_capped: 0,
    created_at: now() - 60_000,
    started_at: now() - 50_000,
    ended_at: now() - 1000,
  };
  const full = { ...defaults, ...row };
  const cols = Object.keys(full);
  await env.DB.prepare(`INSERT INTO matches (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .bind(...cols.map((c) => full[c] ?? null))
    .run();
}

export async function insertRow(table: string, row: Record<string, unknown>): Promise<void> {
  const cols = Object.keys(row);
  await env.DB.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .bind(...cols.map((c) => row[c] ?? null))
    .run();
}

/** A missed_questions row for a fixture question. */
export async function insertMissed(userId: string, questionId: string, extra: Record<string, unknown> = {}): Promise<void> {
  const q = await env.DB.prepare("SELECT course_id, lecture_id FROM questions WHERE id = ?").bind(questionId).first<{ course_id: string; lecture_id: string }>();
  if (!q) throw new Error(`no question ${questionId}`);
  await insertRow("missed_questions", {
    user_id: userId,
    question_id: questionId,
    course_id: q.course_id,
    lecture_id: q.lecture_id,
    status: "open",
    times_missed: 1,
    first_missed_at: now() - 10_000,
    last_missed_at: now() - 10_000,
    last_answer_json: null,
    last_match_id: null,
    retries: 0,
    retry_correct: 0,
    ...extra,
  });
}
