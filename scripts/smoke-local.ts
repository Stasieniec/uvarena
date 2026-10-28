// End-to-end smoke run against a local dev server, with real HTTP and
// WebSocket clients (no browser):
//
//   npm run db:migrate:local
//   npm run bank -- import --local --vault ../university-vault
//   npx vite --port 5210            (TEST_MODE=1 in .dev.vars)
//   npm run smoke -- --url http://localhost:5210
//
// Or against the production bundle in workerd:
//   npm run build && cp .dev.vars dist/uvarena/.dev.vars   (with APP_URL=http://localhost:5211)
//   npx wrangler dev --port 5211 --local-upstream localhost:5211
//   npm run smoke -- --url http://localhost:5211
// (--local-upstream keeps request URLs on localhost; without it wrangler uses
// the production route's hostname and test mode stays off.)
//
// Against production (no test mode, real timers): the ranked match and a bot
// match against the first ladder bot only, with users named zz_smoke_*:
//   npm run smoke -- --url https://uvarena.swasilewski.com --production
// Then delete those users (docs/build-plan.md, Deploy).
//
// It signs up fresh users each run, so it can be re-run against the same
// local database. Every server frame and API response is validated against
// the contract schemas. It knows the right answers from bank/bank.json (the
// import writes it), matched to each question by its text.
//
// Covered: ranked queue and a full match (one player right and fast, the
// other wrong), match_end, rating changes, stats, history, round detail,
// missed questions and a retry, the leaderboard; a private match by code
// (create, join, ready, surrender, rematch) in Agentic AI, the only course on
// offer (Engineering is refused); bot matches against Echo and the
// first ladder bot; a disconnect and reconnect in the middle of a question.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { z } from "zod";
import {
  BotsResponseSchema,
  CoursesResponseSchema,
  CreateBotMatchResponseSchema,
  CreateLobbyResponseSchema,
  HomeResponseSchema,
  JoinLobbyResponseSchema,
  LeaderboardResponseSchema,
  MatchDetailResponseSchema,
  MeResponseSchema,
  MissedAnswerResponseSchema,
  MissedListResponseSchema,
  MissedQuestionResponseSchema,
  MissedRetryResponseSchema,
  UserMatchesResponseSchema,
  UserProfileResponseSchema,
} from "../src/shared/api-schemas";
import type { AnswerKey } from "../src/shared/game/types";
import {
  FINAL_CLOSE_CODES,
  PING,
  PONG,
  QueueServerMessageSchema,
  ServerMessageSchema,
  type MatchEndMessage,
  type QuestionView,
  type ServerMessage,
} from "../src/shared/protocol";
import { BankFileSchema, type BankItem } from "../src/shared/question-schema";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const BASE = (argValue("--url") ?? process.env.SMOKE_URL ?? "http://localhost:5210").replace(/\/$/, "");
const WS_BASE = BASE.replace(/^http/, "ws");
const PRODUCTION = process.argv.includes("--production");
/** Logs every match frame and socket event with a timestamp. */
const DEBUG = process.argv.includes("--debug");
const BANK_PATH = resolve(import.meta.dirname, "..", "bank", "bank.json");
const MATCH_TIMEOUT_MS = 240_000;
/** The smoke client pings this often (the app pings every NET.pingIntervalMs; shorter here to notice a dead socket sooner). */
const SMOKE_PING_MS = 5_000;
/** A match socket with no frame, not even a pong, for this long is treated as dead. */
const SMOKE_SILENT_MS = 12_000;

let failures = 0;
function check(cond: unknown, what: string): void {
  if (cond) {
    console.log(`  ok    ${what}`);
  } else {
    failures++;
    console.log(`  FAIL  ${what}`);
  }
}
function must(cond: unknown, what: string): asserts cond {
  check(cond, what);
  if (!cond) throw new Error(`stopping: ${what}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Answers from the bank
// ---------------------------------------------------------------------------

const bank = BankFileSchema.parse(JSON.parse(readFileSync(BANK_PATH, "utf8")));
const byText = new Map<string, BankItem>();
for (const q of bank.questions) byText.set(`${q.type}|${q.prompt ?? q.statement ?? ""}`, q);

function bankItem(q: QuestionView): BankItem {
  const item = byText.get(`${q.type}|${q.prompt ?? q.statement ?? ""}`);
  if (!item) throw new Error(`question not in bank/bank.json: ${q.type} ${q.prompt ?? q.statement}`);
  return item;
}

/** The right or a wrong answer in the receiver's opaque ids, matched by option text. */
function answerFor(q: QuestionView, right: boolean): AnswerKey {
  const item = bankItem(q);
  const key = item.key;
  if (key.kind === "bool") return { kind: "bool", value: right ? key.value : !key.value };
  if (key.kind !== "options") throw new Error(`smoke run cannot answer ${key.kind}`);
  const textOf = new Map(item.options.map((o) => [o.id, o.text]));
  const opaqueOf = new Map(q.options.map((o) => [o.text, o.id]));
  const rightIds = key.ids.map((id) => {
    const opaque = opaqueOf.get(textOf.get(id) ?? "");
    if (!opaque) throw new Error(`option ${id} of ${item.id} not on screen`);
    return opaque;
  });
  if (right) return { kind: "options", ids: rightIds };
  const wrong = q.options.find((o) => !rightIds.includes(o.id));
  if (wrong) return { kind: "options", ids: [wrong.id] };
  // Every option is correct (multi): leave one out.
  return { kind: "options", ids: rightIds.slice(1) };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

interface User {
  username: string;
  userId: string;
  cookie: string;
}

async function http(method: string, path: string, user: User | null, body?: unknown): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { Origin: BASE };
  if (user) headers.Cookie = user.cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

/** A 200 response parsed with its contract schema. */
async function api<S extends z.ZodType>(schema: S, method: string, path: string, user: User | null, body?: unknown): Promise<z.infer<S>> {
  const res = await http(method, path, user, body);
  if (res.status !== 200) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(res.json)}`);
  const parsed = schema.safeParse(res.json);
  if (!parsed.success) throw new Error(`${method} ${path}: response breaks its schema: ${parsed.error.message}`);
  return parsed.data;
}

async function signUp(prefix: string): Promise<User> {
  const username = `${PRODUCTION ? "zz_smoke_" : ""}${prefix}${Math.random().toString(36).slice(2, 8)}`;
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { Origin: BASE, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `${username}@example.com`,
      password: "smoke-password-1",
      name: username,
      username,
      firstName: "Smoke",
      lastName: prefix,
    }),
  });
  const body = (await res.json()) as { user?: { id: string } };
  if (res.status !== 200 || !body.user) throw new Error(`sign-up ${username}: ${res.status} ${JSON.stringify(body)}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .filter((c) => !c.endsWith("="))
    .join("; ");
  return { username, userId: body.user.id, cookie };
}

// ---------------------------------------------------------------------------
// WebSockets
// ---------------------------------------------------------------------------

type AnswerMode = "right" | "wrong" | "none";

/**
 * A match socket that records every frame and can answer questions on its own.
 *
 * Like the app's own client (src/client/match/socket.ts) it pings, treats a
 * socket that stops answering as dead, and reconnects after any close that is
 * not final. On a reconnect the server's snapshot rebuilds what was missed: a
 * running question is answered again if the answer never arrived, and a
 * finished match's result counts as its match_end. Networks drop WebSockets
 * without a close frame (code 1006); the run reports each drop and goes on.
 */
class MatchClient {
  readonly frames: ServerMessage[] = [];
  readonly errors: string[] = [];
  closed: { code: number; reason: string } | null = null;
  /** Drops this client recovered from, as "code at time". */
  readonly drops: string[] = [];
  ws!: WebSocket;
  private answered = new Set<number>();
  private stopped = false;
  private recovering = false;
  private lastFrameAt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    readonly user: User,
    readonly matchId: string,
    public mode: AnswerMode = "none",
    public delayMs = 150,
  ) {}

  async open(): Promise<this> {
    this.stopped = false;
    await this.connect();
    this.pingTimer ??= setInterval(() => this.ping(), SMOKE_PING_MS);
    return this;
  }

  private debug(what: string): void {
    if (DEBUG) console.log(`  debug ${new Date().toISOString()} ${this.user.username} ${what}`);
  }

  private connect(): Promise<void> {
    this.closed = null;
    const ws = new WebSocket(`${WS_BASE}/api/matches/${this.matchId}/ws`, {
      headers: { Origin: BASE, Cookie: this.user.cookie },
    } as unknown as string[]);
    this.ws = ws;
    this.lastFrameAt = Date.now();
    ws.addEventListener("message", (e) => {
      if (this.ws !== ws) return;
      this.lastFrameAt = Date.now();
      this.debug(`<- ${String(e.data).length} B ${String(e.data).slice(0, 60)}`);
      this.onFrame(String(e.data));
    });
    ws.addEventListener("close", (e) => {
      this.debug(`closed ${e.code} ${e.reason}`);
      if (this.ws !== ws) return;
      this.closed = { code: e.code, reason: e.reason };
      if (!this.stopped && !this.recovering && !FINAL_CLOSE_CODES.includes(e.code)) this.recover(`closed ${e.code}`);
    });
    return new Promise<void>((res, rej) => {
      ws.addEventListener("open", () => res(), { once: true });
      ws.addEventListener("error", () => rej(new Error(`match socket for ${this.user.username} failed`)), { once: true });
    });
  }

  /** Sends "ping"; a socket with no frame (not even a pong) for SMOKE_SILENT_MS is dropped and reopened. */
  private ping(): void {
    if (this.stopped || this.ws.readyState !== WebSocket.OPEN) return;
    if (Date.now() - this.lastFrameAt > SMOKE_SILENT_MS) {
      const ws = this.ws;
      this.recover("silent");
      try {
        ws.close(1000, "silent");
      } catch {
        // already closed
      }
      return;
    }
    this.ws.send(PING);
  }

  /** Reopens the socket after a drop, retrying with a growing pause. */
  private recover(why: string): void {
    if (this.stopped || this.recovering || this.of("match_end").length > 0) return;
    this.recovering = true;
    this.drops.push(`${why} at ${new Date().toISOString()}`);
    console.log(`  note  ${this.user.username}: match socket dropped (${why}), reconnecting`);
    const attempt = async (n: number): Promise<void> => {
      await sleep(Math.min(5000, 500 * 2 ** n));
      if (this.stopped) return;
      try {
        await this.connect();
        this.recovering = false;
      } catch {
        if (n < 8) return attempt(n + 1);
        this.recovering = false;
        this.errors.push(`could not reconnect after ${why}`);
      }
    };
    void attempt(0);
  }

  private onFrame(text: string): void {
    if (text === PONG) return;
    const parsed = ServerMessageSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      this.errors.push(`bad frame ${text.slice(0, 200)}: ${parsed.error.message}`);
      return;
    }
    const msg = parsed.data;
    this.frames.push(msg);
    if (msg.type === "error") this.errors.push(`error frame ${msg.code}: ${msg.message}`);
    if (msg.type === "question") this.maybeAnswer({ ...msg, type: msg.questionType });
    if (msg.type === "snapshot" && msg.phase === "question" && msg.question && !msg.yourAnswer) {
      // The server has no answer from us: one sent before a drop never arrived.
      this.answered.delete(msg.question.round);
      this.maybeAnswer(msg.question);
    }
    // A snapshot of a finished match carries its result: that is the end screen.
    if (msg.type === "snapshot" && msg.result && this.of("match_end").length === 0) {
      this.frames.push({ type: "match_end", serverNow: msg.serverNow, ...msg.result });
    }
  }

  private maybeAnswer(q: QuestionView): void {
    if (this.mode === "none" || this.answered.has(q.round)) return;
    this.answered.add(q.round);
    const mode = this.mode;
    setTimeout(() => {
      try {
        this.send({ type: "answer", round: q.round, answer: answerFor(q, mode === "right") });
      } catch (err) {
        this.errors.push(String(err));
      }
    }, this.delayMs);
  }

  send(msg: unknown): void {
    this.debug(`-> ${JSON.stringify(msg).slice(0, 80)} (readyState ${this.ws.readyState})`);
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.stopped = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    try {
      this.ws.close(1000, "bye");
    } catch {
      // already closed
    }
  }

  of<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.frames.filter((f): f is Extract<ServerMessage, { type: T }> => f.type === type);
  }

  async waitFor<T extends ServerMessage["type"]>(
    type: T,
    pred: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
    timeoutMs = 20_000,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const start = Date.now();
    for (;;) {
      const hit = this.of(type).find(pred);
      if (hit) return hit;
      if (Date.now() - start > timeoutMs) {
        const last = this.frames.slice(-3).map((f) => f.type).join(", ") || "none";
        const closed = this.closed ? `closed ${this.closed.code} ${this.closed.reason}` : "socket open";
        const errors = this.errors.length ? `; errors: ${this.errors.slice(0, 3).join(" | ")}` : "";
        throw new Error(`${this.user.username}: timed out waiting for ${type} (${closed}; last frames: ${last}${errors})`);
      }
      await sleep(25);
    }
  }
}

/**
 * Joins the ranked queue and resolves with the matched match id. Pings like
 * the app, and reopens the socket after a close that is not final (the queue
 * keeps a reconnecting player's place, or hands them the match already made).
 */
function queue(user: User, course: string): { matched: Promise<string>; statuses: number[]; close: () => void } {
  const statuses: number[] = [];
  let ws: WebSocket;
  let done = false;
  const ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(PING);
  }, SMOKE_PING_MS);
  const matched = new Promise<string>((res, rej) => {
    const finish = (err: Error | null, matchId?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(ping);
      if (err) rej(err);
      else res(matchId!);
    };
    const timer = setTimeout(() => finish(new Error(`${user.username}: no match within 30 s`)), 30_000);
    const connect = () => {
      const socket = new WebSocket(`${WS_BASE}/api/queue/ws?course=${course}`, {
        headers: { Origin: BASE, Cookie: user.cookie },
      } as unknown as string[]);
      ws = socket;
      socket.addEventListener("message", (e) => {
        const text = String(e.data);
        if (text === PONG) return;
        const msg = QueueServerMessageSchema.parse(JSON.parse(text));
        if (msg.type === "queue_status") statuses.push(msg.searching);
        if (msg.type === "matched") finish(null, msg.matchId);
        if (msg.type === "error") finish(new Error(`${user.username}: queue error ${msg.code} ${msg.matchId ?? ""}`));
      });
      socket.addEventListener("close", (e) => {
        if (done || socket !== ws) return;
        if (FINAL_CLOSE_CODES.includes(e.code)) {
          if (e.code !== 1000) finish(new Error(`${user.username}: queue closed ${e.code} ${e.reason}`));
          return;
        }
        console.log(`  note  ${user.username}: queue socket dropped (closed ${e.code}), reconnecting`);
        setTimeout(() => {
          if (!done) connect();
        }, 500);
      });
    };
    connect();
  });
  return {
    matched,
    statuses,
    close: () => {
      done = true;
      clearInterval(ping);
      ws.close();
    },
  };
}

async function rankedPair(a: User, b: User, course: string): Promise<string> {
  const qa = queue(a, course);
  await sleep(300); // a is the longer waiter, so a plays side a
  const qb = queue(b, course);
  const [ma, mb] = await Promise.all([qa.matched, qb.matched]);
  must(ma === mb, `ranked queue paired ${a.username} and ${b.username} into one match`);
  return ma;
}

function frameErrors(...clients: MatchClient[]): void {
  for (const c of clients) check(c.errors.length === 0, `${c.user.username}: no bad or error frames${c.errors.length ? `: ${c.errors.slice(0, 3).join(" | ")}` : ""}`);
}

/** No key or correctness before a round's reveal: scans question, answer_ack and opponent_answered frames. */
function leakScan(c: MatchClient): void {
  const secret = /"(key|yourCorrect|opponentCorrect|correct)"/;
  const bad = c.frames.filter((f) => ["question", "answer_ack", "opponent_answered", "arming", "banner", "intro"].includes(f.type) && secret.test(JSON.stringify(f)));
  check(bad.length === 0, `${c.user.username}: no key or correctness in pre-reveal frames`);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function rankedMatch(a: User, b: User): Promise<void> {
  console.log("\nRanked match, Agentic AI: a right and fast, b wrong");
  const homeA0 = await api(HomeResponseSchema, "GET", "/api/home?course=agai", a);
  const matchId = await rankedPair(a, b, "agai");
  const ca = await new MatchClient(a, matchId, "right", 100).open();
  const cb = await new MatchClient(b, matchId, "wrong", 700).open();
  await ca.waitFor("intro");
  const meA = await api(MeResponseSchema, "GET", "/api/me", a);
  check(meA.activeMatchId === matchId, "/me reports the running match");
  const queueBusy = queue(a, "agai");
  const busy = await queueBusy.matched.then(
    () => "matched",
    (e: Error) => e.message,
  );
  check(busy.includes("already_in_match"), "the queue refuses a player with a running match");

  const endA = (await ca.waitFor("match_end", () => true, MATCH_TIMEOUT_MS)) as MatchEndMessage;
  const endB = (await cb.waitFor("match_end", () => true, 10_000)) as MatchEndMessage;
  check(endA.result === "win" && endA.reason === "hp", `a wins on hp (got ${endA.result} ${endA.reason})`);
  check(endB.result === "loss" && endB.reason === "hp", `b loses on hp (got ${endB.result} ${endB.reason})`);
  check(endA.ranked !== null && endA.ranked.after > endA.ranked.before, `a's rating went up (${endA.ranked?.before} -> ${endA.ranked?.after})`);
  check(endB.ranked !== null && endB.ranked.after < endB.ranked.before, `b's rating went down (${endB.ranked?.before} -> ${endB.ranked?.after})`);
  check(endA.summary.correct === endA.rounds && endA.summary.answered === endA.rounds, "a's summary: every round answered and right");
  check(endB.summary.correct === 0, "b's summary: nothing right");
  check(endB.missedCount === endB.rounds, `b's missed count equals the rounds (${endB.missedCount} of ${endB.rounds})`);
  const reveals = cb.of("reveal");
  // A reveal sent while b's socket was down is lost; the snapshot after the reconnect stands in for it.
  check(
    (reveals.length === endB.rounds || cb.drops.length > 0) && reveals.length > 0 && reveals.every((r) => r.savedToMissed && !r.yourCorrect && r.opponentCorrect),
    `every reveal to b: wrong, saved to missed (${reveals.length} reveals, ${endB.rounds} rounds)`,
  );
  leakScan(ca);
  leakScan(cb);
  frameErrors(ca, cb);

  await sleep(500);
  const meAfter = await api(MeResponseSchema, "GET", "/api/me", a);
  check(meAfter.activeMatchId === null, "/me has no running match after the end");

  const profA = await api(UserProfileResponseSchema, "GET", `/api/users/${a.username}?course=agai`, a);
  const profB = await api(UserProfileResponseSchema, "GET", `/api/users/${b.username}?course=agai`, a);
  const ra = profA.courses.find((c) => c.courseId === "agai")?.ranked;
  const rb = profB.courses.find((c) => c.courseId === "agai")?.ranked;
  check(ra?.played === 1 && ra.won === 1 && ra.curStreak === 1, "a's profile: 1 played, 1 won, streak 1");
  check(rb?.played === 1 && rb.lost === 1, "b's profile: 1 played, 1 lost");
  check(ra?.rating === endA.ranked?.after, `a's profile rating matches match_end (${ra?.rating} vs ${endA.ranked?.after})`);
  check(profB.headToHead?.wins === 1, "head-to-head from a's view: 1 win");
  const accB = profB.courses.find((c) => c.courseId === "agai")?.accuracy ?? [];
  check(accB.reduce((n, l) => n + l.answers, 0) === endB.rounds && accB.every((l) => l.correct === 0), "b's lecture accuracy counts every answer, none right");

  const homeA = await api(HomeResponseSchema, "GET", "/api/home?course=agai", a);
  check(homeA.recentMatches[0]?.id === matchId, "home lists the match first");
  check(homeA0.ranked.rating === null || homeA0.ranked.rating !== homeA.ranked.rating, "home rating moved");

  const histA = await api(UserMatchesResponseSchema, "GET", `/api/users/${a.username}/matches?course=agai`, a);
  const rowA = histA.items.find((m) => m.id === matchId);
  check(rowA?.result === "win" && (rowA.ratingChange ?? 0) > 0 && rowA.opponent?.username === b.username, "a's history: win, positive change, b as opponent");
  const histB = await api(UserMatchesResponseSchema, "GET", `/api/users/${b.username}/matches`, b);
  check(histB.items.find((m) => m.id === matchId)?.result === "loss", "b's history: loss");

  const detail = await api(MatchDetailResponseSchema, "GET", `/api/matches/${matchId}`, b);
  const sideA = detail.players[0].user?.id === a.userId ? "a" : "b";
  const sideB = sideA === "a" ? "b" : "a";
  check(detail.status === "finished" && detail.winner === sideA && detail.endReason === "hp", "detail: finished, a's side won on hp");
  check(detail.rounds.length === endA.rounds, `detail: ${detail.rounds.length} rounds`);
  check(
    detail.rounds.every((r) => r[sideA].correct && !r[sideB].correct && r[sideB].answer !== null && r[sideA].score > 0 && r[sideB].damageTaken > 0),
    "detail: every round a right, b wrong and damaged",
  );
  check(detail.rounds.every((r) => r.question.key && r.question.why.length > 0), "detail: questions carry key and explanation");
  check(
    reveals.every((rv) => detail.rounds.find((d) => d.round === rv.round)?.question.id === rv.questionId),
    "each reveal's questionId is the round's bank question",
  );
  const flagged = await http("POST", `/api/questions/${reveals[0]!.questionId}/report`, b, { reason: "other", matchId });
  check(flagged.status === 200, `the reveal's report flag can file a report (${flagged.status})`);
  const lastRound = detail.rounds.at(-1)!;
  check(lastRound[sideB].hpAfter === 0, "detail: b ends at 0 hp");

  const missedB = await api(MissedListResponseSchema, "GET", "/api/missed?course=agai&status=open", b);
  const distinct = new Set(detail.rounds.map((r) => r.question.id)).size;
  check(missedB.count === distinct, `b has ${missedB.count} open missed questions (expected ${distinct})`);
  const missedA = await api(MissedListResponseSchema, "GET", "/api/missed?course=agai&status=open", a);
  check(missedA.count === 0, "a has no missed questions");
  const first = missedB.items[0];
  if (first) {
    const q = await api(MissedQuestionResponseSchema, "GET", `/api/missed/${first.questionId}`, b);
    check(q.status === "open" && q.timesMissed === 1, "missed question: open, missed once");
    const ans = await api(MissedAnswerResponseSchema, "GET", `/api/missed/${first.questionId}/answer`, b);
    check(ans.lastAnswer !== null, "missed answer: shows b's last answer");
    const retry = await api(MissedRetryResponseSchema, "POST", `/api/missed/${first.questionId}/retry`, b, { answer: ans.key });
    check(retry.correct && retry.status === "learned", "retry with the key: correct, learned");
    const other = await http("GET", `/api/missed/${first.questionId}`, a);
    check(other.status === 404, `a cannot read b's missed question (${other.status})`);
  }

  const board = await api(LeaderboardResponseSchema, "GET", "/api/leaderboards/agai", a);
  const all = [...board.established, ...board.provisional];
  const la = all.find((r) => r.user.id === a.userId);
  const lb = all.find((r) => r.user.id === b.userId);
  check(la !== undefined && lb !== undefined, "leaderboard lists both players");
  check(la?.rating === Math.round(endA.ranked?.after ?? 0) && la?.won === 1, "leaderboard: a's rating and wins");
  check(board.provisional.findIndex((r) => r.user.id === a.userId) < board.provisional.findIndex((r) => r.user.id === b.userId), "leaderboard: a above b");
  ca.close();
  cb.close();
}

async function privateMatch(a: User, b: User): Promise<void> {
  console.log("\nPrivate match by code, Agentic AI: create, join, ready, surrender, rematch");
  const statsOf = async () =>
    (await api(UserProfileResponseSchema, "GET", `/api/users/${a.username}?course=agai`, a)).courses.find((c) => c.courseId === "agai")?.ranked;
  const before = await statsOf();
  const gone = await http("POST", "/api/lobbies", a, { courseId: "eprm", powerups: true, rated: true });
  check(gone.status === 404, `a lobby for Engineering, which left the app, is refused (${gone.status})`);
  const lobby = await api(CreateLobbyResponseSchema, "POST", "/api/lobbies", a, { courseId: "agai", powerups: true, rated: true });
  check(lobby.code.length === 6 && lobby.rated, `lobby created with code ${lobby.code}, rated`);
  const ca = await new MatchClient(a, lobby.matchId).open();
  const lobbySnap = await ca.waitFor("snapshot");
  check(lobbySnap.phase === "lobby" && lobbySnap.joinCode === lobby.code && lobbySnap.opponent === null, "host's snapshot: lobby with the code, nobody joined");

  const bad = await http("POST", "/api/lobbies/join", b, { code: "ZZZZZZ" });
  check(bad.status === 404, `joining an unknown code is refused (${bad.status})`);
  const joined = await api(JoinLobbyResponseSchema, "POST", "/api/lobbies/join", b, { code: lobby.code.toLowerCase() });
  check(joined.matchId === lobby.matchId, "guest joins by code (lower case accepted)");
  const again = await api(JoinLobbyResponseSchema, "POST", "/api/lobbies/join", b, { code: lobby.code });
  check(again.matchId === lobby.matchId, "joining twice is idempotent");
  const meGuest = await api(MeResponseSchema, "GET", "/api/me", b);
  check(meGuest.activeMatchId === lobby.matchId, "/me reports the full lobby to the guest");
  const cb = await new MatchClient(b, lobby.matchId).open();
  await ca.waitFor("lobby", (m) => m.players.length === 2);
  ca.send({ type: "ready" });
  await sleep(300);
  check(ca.of("intro").length === 0, "no intro until both are ready");
  cb.send({ type: "ready" });
  await ca.waitFor("intro");
  await cb.waitFor("intro");
  await ca.waitFor("question", () => true, 30_000);
  ca.send({ type: "surrender" });
  const endA = await ca.waitFor("match_end");
  const endB = await cb.waitFor("match_end");
  check(endA.result === "loss" && endA.reason === "surrender", "host surrenders: loss");
  check(endB.result === "win" && endB.reason === "surrender", "guest: win by surrender");
  check(endA.ranked !== null && endA.ranked.after < endA.ranked.before, "rated private match moves the ranked rating");
  check(endA.rematchUntil !== null, "rematch window offered");
  frameErrors(ca, cb);

  ca.send({ type: "rematch" });
  const offered = await cb.waitFor("rematch", (m) => m.state === "offered");
  check(offered.by === "opponent", "guest sees the rematch offer");
  cb.send({ type: "rematch" });
  const acc = await ca.waitFor("rematch", (m) => m.state === "accepted");
  const accB = await cb.waitFor("rematch", (m) => m.state === "accepted");
  check(acc.matchId !== null && acc.matchId === accB.matchId, "both get the rematch's match id");
  ca.close();
  cb.close();
  if (!acc.matchId) return;

  const ra = await new MatchClient(a, acc.matchId).open();
  const rb = await new MatchClient(b, acc.matchId).open();
  const snap = await ra.waitFor("snapshot");
  check(snap.mode === "private" && snap.courseId === "agai", "rematch is a private Agentic AI match");
  // Both accepted the rematch, so both start ready; Ready is only sent when the lobby asks for it.
  if (!snap.you.ready) ra.send({ type: "ready" });
  const snapB = await rb.waitFor("snapshot");
  if (!snapB.you.ready) rb.send({ type: "ready" });
  await ra.waitFor("intro", () => true, 10_000);
  rb.send({ type: "surrender" });
  const end = await ra.waitFor("match_end");
  check(end.result === "win" && end.reason === "surrender", "rematch ends with the guest's surrender");
  frameErrors(ra, rb);
  ra.close();
  rb.close();
  const r = await statsOf();
  const d = (k: "played" | "won" | "lost" | "surrendered") => (r?.[k] ?? 0) - (before?.[k] ?? 0);
  check(d("played") === 2 && d("won") === 1 && d("lost") === 1 && d("surrendered") === 1, "host's stats: 2 more played, 1 won, 1 lost by surrender");
}

async function botMatch(a: User, bot: "echo" | 1): Promise<void> {
  console.log(`\nBot match against ${bot === "echo" ? "Echo" : "the first ladder bot"}`);
  const before = await api(BotsResponseSchema, "GET", "/api/bots?course=agai", a);
  if (bot === 1) check(before.ladder[0]?.unlocked && !before.ladder[0].beaten && !before.ladder[1]?.unlocked, "ladder: level 1 open, level 2 locked");
  const locked = await http("POST", "/api/bot-matches", a, { courseId: "agai", bot: 3 });
  check(locked.status === 403, `a locked ladder bot is refused (${locked.status})`);
  const { matchId } = await api(CreateBotMatchResponseSchema, "POST", "/api/bot-matches", a, { courseId: "agai", bot });
  const c = await new MatchClient(a, matchId, "right", 100).open();
  const snap = await c.waitFor("snapshot");
  check(snap.mode === "bot" && snap.opponent?.kind === "bot", `opponent is a bot (${snap.opponent?.name})`);
  const end = await c.waitFor("match_end", () => true, MATCH_TIMEOUT_MS);
  check(end.result === "win", `win against the bot (got ${end.result} ${end.reason} after ${end.rounds} rounds)`);
  check(end.ranked === null && end.bot !== null, `bot rating change reported (${end.bot?.before} -> ${end.bot?.after})`);
  check(end.bot !== null && end.bot.after > end.bot.before, "all right answers raise the bot rating");
  check(end.rematchUntil !== null, "bot match offers a rematch");
  check(c.of("reveal").every((r) => r.yourCorrect), "every reveal: right");
  leakScan(c);
  frameErrors(c);
  c.close();
  await sleep(300);
  const after = await api(BotsResponseSchema, "GET", "/api/bots?course=agai", a);
  if (bot === 1) check(after.ladder[0]?.beaten && after.ladder[1]?.unlocked, "ladder: level 1 beaten, level 2 unlocked");
  const home = await api(HomeResponseSchema, "GET", "/api/home?course=agai", a);
  check(home.bot.rating === end.bot?.after, `home bot rating matches match_end (${home.bot.rating})`);
  const detail = await api(MatchDetailResponseSchema, "GET", `/api/matches/${matchId}`, a);
  check(detail.mode === "bot" && detail.players[1].bot !== null && detail.rounds.length === end.rounds, "bot match detail with the bot as side b");
}

async function reconnectMatch(a: User, b: User): Promise<void> {
  console.log("\nRanked match with a disconnect and reconnect mid-question");
  const matchId = await rankedPair(a, b, "agai");
  const ca = await new MatchClient(a, matchId, "right", 1200).open();
  let cb = await new MatchClient(b, matchId, "wrong", 100).open();
  await ca.waitFor("question", (q) => q.round === 2, 60_000);
  cb.close();
  const away = await ca.waitFor("opponent_connection", (m) => !m.connected);
  check(away.forfeitAt !== null, "opponent sees the disconnect with a forfeit time");
  await sleep(300);
  cb = await new MatchClient(b, matchId, "wrong", 100).open();
  const snap = await cb.waitFor("snapshot");
  check(snap.round >= 2 && snap.you.hp < 6000 && snap.opponent !== null, `reconnect snapshot: round ${snap.round}, phase ${snap.phase}, hp ${snap.you.hp}`);
  if (snap.phase === "question") {
    check(snap.question !== null && snap.question.round === snap.round, "snapshot carries the running question");
    check(!/"(key|yourCorrect|opponentCorrect)"/.test(JSON.stringify(snap.question)), "snapshot question has no key");
  }
  const back = await ca.waitFor("opponent_connection", (m) => m.connected);
  check(back.forfeitAt === null, "opponent sees the reconnect");
  const endA = await ca.waitFor("match_end", () => true, MATCH_TIMEOUT_MS);
  const endB = await cb.waitFor("match_end", () => true, 10_000);
  check(endA.result === "win" && endB.result === "loss" && endA.reason === "hp", `match finishes normally after the reconnect (${endA.result} ${endA.reason})`);
  frameErrors(ca, cb);
  ca.close();
  cb.close();
}

async function replacedSocket(a: User): Promise<void> {
  console.log("\nA second socket for the same player replaces the first");
  const { matchId } = await api(CreateBotMatchResponseSchema, "POST", "/api/bot-matches", a, { courseId: "agai", bot: "echo" });
  const first = await new MatchClient(a, matchId).open();
  await first.waitFor("snapshot");
  const second = await new MatchClient(a, matchId).open();
  await second.waitFor("snapshot");
  const framesBefore = first.frames.length;
  for (let i = 0; i < 40 && !first.closed && first.ws.readyState === WebSocket.OPEN; i++) await sleep(50);
  // wrangler dev delivers the close (the socket may sit in CLOSING because
  // the dev server does not finish the TCP teardown towards Node). The vite
  // dev proxy does not forward a close a Durable Object sends on an older
  // socket at all, so under `npx vite` this is a warning, not a failure.
  if (first.closed?.code === 4001 || first.ws.readyState === WebSocket.CLOSING) {
    check(true, `older socket closed by the server (code ${first.closed?.code ?? "none"}, readyState ${first.ws.readyState})`);
  } else {
    console.log(`  WARN  older socket not closed (readyState ${first.ws.readyState}); expected under the vite dev proxy only`);
  }
  second.send({ type: "surrender" });
  const end = await second.waitFor("match_end", () => true, 15_000);
  check(end.result === "loss" && end.reason === "surrender", "surrender ends the bot match");
  check(first.frames.length === framesBefore, "the replaced socket gets nothing more");
  second.close();
}

async function main(): Promise<void> {
  console.log(`Smoke run against ${BASE}`);
  const config = await http("GET", "/api/config", null);
  if (PRODUCTION) must(config.status === 200 && config.json.testMode === false, "server up, test mode off");
  else must(config.status === 200 && config.json.testMode === true, "dev server up, test mode on");
  const unauth = await http("GET", "/api/me", null);
  check(unauth.status === 401, "/me needs a session");

  const a = await signUp("sa");
  const b = await signUp("sb");
  const me = await api(MeResponseSchema, "GET", "/api/me", a);
  check(me.user.username === a.username && !me.needsOnboarding && me.activeMatchId === null, "signed up, no onboarding, no running match");

  console.log(`users: ${a.username} ${a.userId}, ${b.username} ${b.userId}`);

  const courses = await api(CoursesResponseSchema, "GET", "/api/courses", a);
  check(courses.courses.map((c) => c.id).join(",") === "agai", "one course on offer: Agentic AI");
  check(me.prefs.loadout.length === 3 && me.prefs.loadout.every((p) => ["bibi", "shield", "fifty", "fast"].includes(p)), `default loadout uses the four power-ups (${me.prefs.loadout.join(", ")})`);
  const oldLoadout = await http("PUT", "/api/me/prefs", a, { loadout: ["nemesis", "phoenix", "fast"] });
  check(oldLoadout.status === 400, `a loadout with a removed power-up is refused (${oldLoadout.status})`);

  await rankedMatch(a, b);
  if (PRODUCTION) {
    await botMatch(a, 1);
    console.log(failures === 0 ? "\nProduction smoke run passed." : `\nProduction smoke run: ${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
  }
  await privateMatch(a, b);
  await botMatch(a, "echo");
  await botMatch(a, 1);
  await reconnectMatch(a, b);
  await replacedSocket(b);

  console.log(failures === 0 ? "\nSmoke run passed." : `\nSmoke run: ${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error("\nSmoke run stopped:", err instanceof Error ? err.message : err);
  process.exit(1);
});
