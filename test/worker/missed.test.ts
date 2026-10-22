// Missed questions (ownership, filters, no key before answering, retry,
// learned and undo) and question reports.
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import {
  MissedAnswerResponseSchema,
  MissedListResponseSchema,
  MissedQuestionResponseSchema,
  MissedRetryResponseSchema,
} from "@shared/api-schemas";
import { call, insertMissed, json, now, seed, signUp, type Session } from "./helpers";

let owner: Session;
let other: Session;

beforeAll(async () => {
  await seed();
  owner = await signUp("missowner");
  other = await signUp("missother");
  await insertMissed(owner.userId, "agai-rrxcbz", { times_missed: 2, last_missed_at: now() - 1000, last_answer_json: JSON.stringify({ kind: "options", ids: ["b"] }) });
  await insertMissed(owner.userId, "agai-ymyte5", { last_missed_at: now() - 2000 });
  await insertMissed(owner.userId, "agai-qu8w9s", { last_missed_at: now() - 3000 });
  await insertMissed(owner.userId, "agai-gk4rzq", { status: "learned", learned_at: now(), last_missed_at: now() - 4000 });
});

describe("GET /missed", () => {
  it("lists the caller's open questions, newest first, with previews and count", async () => {
    const body = MissedListResponseSchema.parse(await json(await call("/api/missed?course=agai", { cookie: owner })));
    expect(body.count).toBe(3);
    expect(body.items.map((i) => i.questionId)).toEqual(["agai-rrxcbz", "agai-ymyte5", "agai-qu8w9s"]);
    expect(body.items[0]).toMatchObject({ lectureTitle: "Fixture: games", type: "single", timesMissed: 2 });
    expect(body.items[0]!.preview).toBe("In a Nash equilibrium, what is true of each player's strategy?");
    expect(body.nextBefore).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/"key"|"why"/);
  });

  it("filters by status and lecture, and never shows another player's rows", async () => {
    const learned = MissedListResponseSchema.parse(await json(await call("/api/missed?course=agai&status=learned", { cookie: owner })));
    expect(learned.items.map((i) => i.questionId)).toEqual(["agai-gk4rzq"]);
    const lecture = await env.DB.prepare("SELECT lecture_id FROM questions WHERE id = 'agai-ymyte5'").first<string>("lecture_id");
    const byLecture = MissedListResponseSchema.parse(await json(await call(`/api/missed?course=agai&lecture=${lecture}`, { cookie: owner })));
    expect(byLecture.items.every((i) => i.lectureId === lecture)).toBe(true);
    const theirs = MissedListResponseSchema.parse(await json(await call("/api/missed?course=agai", { cookie: other })));
    expect(theirs).toEqual({ count: 0, items: [], nextBefore: null });
    expect((await call("/api/missed?course=agai&status=bogus", { cookie: owner })).status).toBe(400);
  });
});

describe("one missed question", () => {
  it("shows the question without its key, then the answer on request", async () => {
    const res = await call("/api/missed/agai-rrxcbz", { cookie: owner });
    const raw = await res.clone().text();
    const body = MissedQuestionResponseSchema.parse(await json(res));
    expect(raw).not.toMatch(/"key"|"why"|optionWhy|correct/);
    expect(body.question.options.map((o) => o.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(body).toMatchObject({ status: "open", timesMissed: 2, retries: 0 });

    const answer = MissedAnswerResponseSchema.parse(await json(await call("/api/missed/agai-rrxcbz/answer", { cookie: owner })));
    expect(answer.key).toEqual({ kind: "options", ids: ["a"] });
    expect(answer.lastAnswer).toEqual({ kind: "options", ids: ["b"] });
    expect(answer.optionWhy.b).toBeTruthy();
    expect(answer.noteUrl).toBeNull();
  });

  it("is 404 for someone without a row, and for unknown ids", async () => {
    for (const path of ["/api/missed/agai-rrxcbz", "/api/missed/agai-rrxcbz/answer"]) {
      expect((await call(path, { cookie: other })).status).toBe(404);
    }
    expect((await call("/api/missed/agai-rrxcbz/retry", { cookie: other, json: { answer: { kind: "options", ids: ["a"] } } })).status).toBe(404);
    expect((await call("/api/missed/agai-rrxcbz/status", { cookie: other, json: { status: "learned" } })).status).toBe(404);
    expect((await call("/api/missed/not-an-id", { cookie: owner })).status).toBe(404);
    expect((await call("/api/missed/agai-222222", { cookie: owner })).status).toBe(404);
  });

  it("retries: wrong keeps it open, right marks it learned; nothing else moves", async () => {
    const before = await env.DB.prepare("SELECT rating, attempts FROM questions WHERE id = 'agai-qu8w9s'").first();
    const wrong = MissedRetryResponseSchema.parse(await json(await call("/api/missed/agai-qu8w9s/retry", { cookie: owner, json: { answer: { kind: "options", ids: ["a"] } } })));
    expect(wrong).toMatchObject({ correct: false, status: "open", key: { kind: "options", ids: ["a", "b"] } });
    const right = MissedRetryResponseSchema.parse(await json(await call("/api/missed/agai-qu8w9s/retry", { cookie: owner, json: { answer: { kind: "options", ids: ["b", "a"] } } })));
    expect(right).toMatchObject({ correct: true, status: "learned" });
    const row = await env.DB.prepare("SELECT status, retries, retry_correct, learned_at FROM missed_questions WHERE user_id = ? AND question_id = 'agai-qu8w9s'").bind(owner.userId).first();
    expect(row).toMatchObject({ status: "learned", retries: 2, retry_correct: 1 });
    expect(row?.learned_at).toBeTypeOf("number");
    expect(await env.DB.prepare("SELECT rating, attempts FROM questions WHERE id = 'agai-qu8w9s'").first()).toEqual(before);
  });

  it("refuses answers that do not fit the question", async () => {
    const retry = (answer: unknown) => call("/api/missed/agai-ymyte5/retry", { cookie: owner, json: { answer } });
    expect((await retry({ kind: "options", ids: ["a"] })).status).toBe(400); // truefalse takes a bool
    expect((await retry({ kind: "bool" })).status).toBe(400);
    const single = (answer: unknown) => call("/api/missed/agai-rrxcbz/retry", { cookie: owner, json: { answer } });
    expect((await single({ kind: "options", ids: ["a", "b"] })).status).toBe(400);
    expect((await single({ kind: "options", ids: ["z"] })).status).toBe(400);
    const ok = MissedRetryResponseSchema.parse(await json(await retry({ kind: "bool", value: true })));
    expect(ok.correct).toBe(true);
  });

  it("marks learned and undoes it", async () => {
    expect(await json(await call("/api/missed/agai-rrxcbz/status", { cookie: owner, json: { status: "learned" } }))).toEqual({ status: "learned" });
    expect(await json(await call("/api/missed/agai-rrxcbz/status", { cookie: owner, json: { status: "open" } }))).toEqual({ status: "open" });
    const row = await env.DB.prepare("SELECT status, learned_at FROM missed_questions WHERE user_id = ? AND question_id = 'agai-rrxcbz'").bind(owner.userId).first();
    expect(row).toEqual({ status: "open", learned_at: null });
    expect((await call("/api/missed/agai-rrxcbz/status", { cookie: owner, json: { status: "gone" } })).status).toBe(400);
  });
});

describe("POST /questions/:id/report", () => {
  it("records a report once per question, revision and reason", async () => {
    const send = (body: unknown) => call("/api/questions/agai-rrxcbz/report", { cookie: other, json: body });
    expect(await json(await send({ reason: "ambiguous", note: "Two options fit." }))).toEqual({ ok: true });
    expect(await json(await send({ reason: "ambiguous" }))).toEqual({ ok: true });
    expect(await json(await send({ reason: "typo", matchId: "match_abcdefgh" }))).toEqual({ ok: true });
    const rows = await env.DB.prepare("SELECT reason, note, question_rev FROM question_reports WHERE user_id = ? ORDER BY created_at").bind(other.userId).all();
    expect(rows.results).toEqual([
      { reason: "ambiguous", note: "Two options fit.", question_rev: 1 },
      { reason: "typo", note: null, question_rev: 1 },
    ]);
  });

  it("validates the reason, note length and question", async () => {
    const send = (id: string, body: unknown) => call(`/api/questions/${id}/report`, { cookie: other, json: body });
    expect((await send("agai-rrxcbz", { reason: "boring" })).status).toBe(400);
    expect((await send("agai-rrxcbz", { reason: "other", note: "x".repeat(501) })).status).toBe(400);
    expect((await send("agai-222222", { reason: "other" })).status).toBe(404);
    expect((await call("/api/questions/agai-rrxcbz/report", { json: { reason: "other" } })).status).toBe(401);
  });
});
