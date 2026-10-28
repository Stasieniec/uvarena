// Shared helpers for the DO suite: D1 seeding with fresh ids (the suite runs
// without storage isolation), WebSocket clients, and state patching.
import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import type { MatchState } from "@shared/game/types";
import { HEADERS } from "../../src/worker/do/contracts";

export function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

// ---------------------------------------------------------------------------
// D1 seeding
// ---------------------------------------------------------------------------

export interface SeededCourse {
  courseId: string;
  lectureIds: string[];
  questionIds: string[];
}

/** A fresh course with `perLecture` single-choice questions in each of `lectures` lectures. */
export async function seedCourse(opts: { lectures?: number; perLecture?: number } = {}): Promise<SeededCourse> {
  const courseId = uid("c").toLowerCase();
  const lectures = opts.lectures ?? 1;
  const perLecture = opts.perLecture ?? 30;
  const now = Date.now();
  const stmts = [
    env.DB.prepare("INSERT INTO courses (id, code, title, short_title, active, sort) VALUES (?, ?, ?, ?, 1, 9)").bind(
      courseId,
      courseId.toUpperCase(),
      `Course ${courseId}`,
      courseId,
    ),
  ];
  const lectureIds: string[] = [];
  const questionIds: string[] = [];
  for (let l = 0; l < lectures; l++) {
    const lectureId = `${courseId}-L${l + 1}`;
    lectureIds.push(lectureId);
    stmts.push(
      env.DB.prepare("INSERT INTO lectures (id, course_id, title, sort) VALUES (?, ?, ?, ?)").bind(lectureId, courseId, `Lecture ${l + 1}`, l + 1),
    );
    for (let q = 0; q < perLecture; q++) {
      const id = `${courseId}-q${l}x${q}`;
      questionIds.push(id);
      stmts.push(
        env.DB.prepare(
          `INSERT INTO questions (id, rev, course_id, lecture_id, status, type, prompt_md, options_json, key_json, shuffle,
             why_md, why_short, option_why_json, difficulty, level, topics_json, words, chance, start_rating, rating,
             rating_n, attempts, correct, fingerprint, content_hash, source_path, created_at, updated_at)
           VALUES (?, 1, ?, ?, 'active', 'single', ?, ?, ?, 1, 'Because.', 'Because.', '{}', 'medium', 'remember', '[]',
             12, 0.25, 1500, 1500, 0, 0, 0, 'fp', 'ch', 'test', ?, ?)`,
        ).bind(
          id,
          courseId,
          lectureId,
          `Question ${q} of lecture ${l + 1}?`,
          JSON.stringify([
            { id: "a", text: "Right" },
            { id: "b", text: "Wrong one" },
            { id: "c", text: "Wrong two" },
            { id: "d", text: "Wrong three" },
          ]),
          JSON.stringify({ kind: "options", ids: ["a"] }),
          now,
          now,
        ),
      );
    }
  }
  await env.DB.batch(stmts);
  return { courseId, lectureIds, questionIds };
}

export async function seedUser(name = uid("u")): Promise<string> {
  const id = uid("user");
  await env.DB.prepare(
    "INSERT INTO user (id, name, email, username, display_username, first_name, last_name) VALUES (?, ?, ?, ?, ?, 'Test', 'User')",
  )
    .bind(id, name, `${id}@example.com`, name.toLowerCase(), name)
    .run();
  return id;
}

export async function matchRow(matchId: string): Promise<Record<string, unknown> | null> {
  return env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(matchId).first();
}

// ---------------------------------------------------------------------------
// WebSocket clients
// ---------------------------------------------------------------------------

type Json = Record<string, unknown> & { type: string };

export class Client {
  readonly frames: Json[] = [];
  closed: { code: number; reason: string } | null = null;

  constructor(readonly ws: WebSocket) {
    ws.addEventListener("message", (e) => {
      const text = String(e.data);
      if (text === "pong") return;
      this.frames.push(JSON.parse(text) as Json);
    });
    ws.addEventListener("close", (e) => {
      this.closed = { code: e.code, reason: e.reason };
    });
  }

  of(type: string): Json[] {
    return this.frames.filter((f) => f.type === type);
  }

  last(type: string): Json | undefined {
    return this.of(type).at(-1);
  }

  /** Waits until `count` frames of `type` have arrived. */
  async waitFor(type: string, count = 1, timeoutMs = 3000): Promise<Json> {
    await until(() => this.of(type).length >= count, `${count} x ${type}`, timeoutMs);
    return this.of(type)[count - 1]!;
  }

  async waitClosed(timeoutMs = 3000): Promise<{ code: number; reason: string }> {
    await until(() => this.closed !== null, "close", timeoutMs);
    return this.closed!;
  }

  send(msg: unknown): void {
    this.ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  close(): void {
    try {
      this.ws.close(1000, "bye");
    } catch {
      // already closed
    }
  }
}

export async function until(check: () => boolean, what: string, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Opens a socket to a DO stub the way the Worker forwards it. */
export async function openSocket(
  stub: { fetch(input: string, init?: RequestInit): Promise<Response> },
  userId: string | null,
  extraHeaders: Record<string, string> = {},
  url = "http://do/ws",
): Promise<Client> {
  const headers: Record<string, string> = { Upgrade: "websocket", ...extraHeaders };
  if (userId) headers[HEADERS.userId] = userId;
  const res = await stub.fetch(url, { headers });
  if (res.status !== 101 || !res.webSocket) throw new Error(`expected 101, got ${res.status}`);
  const client = new Client(res.webSocket);
  res.webSocket.accept();
  return client;
}

// ---------------------------------------------------------------------------
// MatchRoom state
// ---------------------------------------------------------------------------

type RoomStub = DurableObjectStub<import("../../src/worker/do/match-room").MatchRoom>;

export function roomStub(matchId: string): RoomStub {
  return env.MATCH_ROOM.getByName(matchId);
}

export async function readState(stub: RoomStub): Promise<MatchState | null> {
  return runInDurableObject(stub, async (_i, state) => (await state.storage.get<MatchState>("state")) ?? null);
}

export async function readAlarm(stub: RoomStub): Promise<number | null> {
  return runInDurableObject(stub, async (_i, state) => state.storage.getAlarm());
}

export async function patchState(stub: RoomStub, patch: (s: MatchState) => void): Promise<void> {
  await runInDurableObject(stub, async (_i, state) => {
    const s = await state.storage.get<MatchState>("state");
    if (!s) throw new Error("no state");
    patch(s);
    await state.storage.put("state", s);
  });
}

const TIME_KEYS = new Set([
  "phaseEndsAt",
  "shownAt",
  "deadline",
  "countdownEnd",
  "noShowAt",
  "lobbyExpiresAt",
  "rematchUntil",
  "cleanupAt",
  "disconnectedSince",
  "answerAt",
  "fiftyAt",
  "fastAt",
  "answeredAt",
  "startedAt",
  "createdAt",
  "endedAt",
]);

/** Shifts every timestamp in the state back by `ms`, as if that much time had passed. */
export function shiftTimes(value: unknown, ms: number): void {
  if (Array.isArray(value)) {
    for (const v of value) shiftTimes(v, ms);
    return;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (TIME_KEYS.has(k) && typeof v === "number") obj[k] = v - ms;
      else shiftTimes(v, ms);
    }
  }
}

/** Moves the room's clock forward to its next deadline (or by `ms`) and runs the alarm. */
export async function fastForward(stub: RoomStub, ms?: number): Promise<boolean> {
  const alarm = await readAlarm(stub);
  const by = ms ?? (alarm === null ? 0 : Math.max(0, alarm - Date.now()));
  if (by > 0) await patchState(stub, (s) => shiftTimes(s, by));
  return runDurableObjectAlarm(stub);
}
