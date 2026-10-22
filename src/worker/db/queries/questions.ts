// Questions outside a match: the public view (never the key), answer checking
// for missed-question retries, and course and lecture lookups.
import { and, eq, inArray } from "drizzle-orm";
import type { QuestionPublic } from "../../../shared/api-schemas";
import { QUESTIONS } from "../../../shared/game/config";
import type { AnswerKey, OptionText, QuestionType } from "../../../shared/game/types";
import { courses, lectures, questions } from "../schema";
import type { Db } from "./db";

export type QuestionRow = typeof questions.$inferSelect;

/** Fisher-Yates with crypto randomness (per request, not seeded). */
export function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  if (out.length < 2) return out;
  const rand = new Uint32Array(out.length);
  crypto.getRandomValues(rand);
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand[i]! % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * The question without its key. With opts.shuffle, options are shuffled when
 * the item allows it, and order items always (their stored order is the
 * answer). Without it they keep the authored order (match detail, which
 * carries the key anyway).
 */
export function toQuestionPublic(row: QuestionRow, lectureTitle: string, opts: { shuffle: boolean }): QuestionPublic {
  const options: OptionText[] = (row.optionsJson ?? []).map((o) => ({ id: o.id, text: o.text }));
  return {
    id: row.id,
    rev: row.rev,
    courseId: row.courseId,
    lectureId: row.lectureId,
    lectureTitle,
    type: row.type,
    prompt: row.promptMd ?? null,
    statement: row.statementMd ?? null,
    codeLang: row.codeLang ?? null,
    options: opts.shuffle && (row.shuffle || row.type === "order") ? shuffled(options) : options,
    targets: row.targetsJson ? row.targetsJson.map((t) => ({ id: t.id, text: t.text })) : null,
  };
}

/** Preview line for the missed list: first QUESTIONS.missedPreviewChars characters, whitespace collapsed. */
export function preview(row: Pick<QuestionRow, "promptMd" | "statementMd">): string {
  const text = (row.promptMd ?? row.statementMd ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= QUESTIONS.missedPreviewChars) return text;
  return `${text.slice(0, QUESTIONS.missedPreviewChars - 3).trimEnd()}...`;
}

/** Answer kind each question type takes. */
const KIND_BY_TYPE: Record<QuestionType, AnswerKey["kind"]> = {
  single: "options",
  cloze: "options",
  multi: "options",
  truefalse: "bool",
  order: "order",
  match: "match",
};

/**
 * Whether an answer (stable ids) fits the question: right kind, known ids,
 * one option for single and cloze, distinct ids, a full permutation for
 * order, every item mapped to a known target for match.
 */
export function answerFits(row: QuestionRow, answer: AnswerKey): boolean {
  if (KIND_BY_TYPE[row.type] !== answer.kind) return false;
  const optionIds = new Set((row.optionsJson ?? []).map((o) => o.id));
  switch (answer.kind) {
    case "bool":
      return true;
    case "options": {
      if (new Set(answer.ids).size !== answer.ids.length) return false;
      if (!answer.ids.every((id) => optionIds.has(id))) return false;
      return row.type === "multi" ? answer.ids.length >= 1 : answer.ids.length === 1;
    }
    case "order":
      return answer.ids.length === optionIds.size && new Set(answer.ids).size === optionIds.size && answer.ids.every((id) => optionIds.has(id));
    case "match": {
      const targetIds = new Set((row.targetsJson ?? []).map((t) => t.id));
      const keys = Object.keys(answer.map);
      return keys.length === optionIds.size && keys.every((k) => optionIds.has(k) && targetIds.has(answer.map[k]!));
    }
  }
}

/** Correct means: options, exact set equality; bool, equal; order, identical sequence; match, identical map. */
export function answersEqual(key: AnswerKey, answer: AnswerKey): boolean {
  if (key.kind !== answer.kind) return false;
  switch (key.kind) {
    case "bool":
      return key.value === (answer as Extract<AnswerKey, { kind: "bool" }>).value;
    case "options": {
      const a = new Set((answer as Extract<AnswerKey, { kind: "options" }>).ids);
      return a.size === key.ids.length && key.ids.every((id) => a.has(id));
    }
    case "order": {
      const ids = (answer as Extract<AnswerKey, { kind: "order" }>).ids;
      return ids.length === key.ids.length && key.ids.every((id, i) => ids[i] === id);
    }
    case "match": {
      const map = (answer as Extract<AnswerKey, { kind: "match" }>).map;
      const keys = Object.keys(key.map);
      return Object.keys(map).length === keys.length && keys.every((k) => map[k] === key.map[k]);
    }
  }
}

export async function getQuestion(db: Db, id: string): Promise<QuestionRow | null> {
  const rows = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function lectureTitles(db: Db, ids: Iterable<string>): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const map = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 50) {
    const rows = await db
      .select({ id: lectures.id, title: lectures.title })
      .from(lectures)
      .where(inArray(lectures.id, unique.slice(i, i + 50)));
    for (const r of rows) map.set(r.id, r.title);
  }
  return map;
}

/** An active course, or null. */
export async function getActiveCourse(db: Db, courseId: string) {
  const rows = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.active, true)))
    .limit(1);
  return rows[0] ?? null;
}

/** Lecture ids of a course that exist (for validating lecture filters). */
export async function existingLectureIds(db: Db, courseId: string, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: lectures.id })
    .from(lectures)
    .where(and(eq(lectures.courseId, courseId), inArray(lectures.id, [...new Set(ids)])));
  return new Set(rows.map((r) => r.id));
}
