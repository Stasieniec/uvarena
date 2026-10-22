// Answer helpers for questions shown outside a match (missed questions, match
// detail). Option ids here are stable ids. True/false questions have no
// options; they use the pseudo ids "true" and "false".
import type { AnswerKey, QuestionType } from "@shared/game/types";

export const TRUE_ID = "true";
export const FALSE_ID = "false";

/** The option ids an answer picks (true/false as pseudo ids). */
export function answerIds(answer: AnswerKey | null | undefined): string[] {
  if (!answer) return [];
  switch (answer.kind) {
    case "options":
      return answer.ids;
    case "bool":
      return [answer.value ? TRUE_ID : FALSE_ID];
    default:
      return [];
  }
}

/** Builds the answer body from picked ids for the types the UI renders. */
export function buildAnswer(type: QuestionType, picked: readonly string[]): AnswerKey | null {
  if (picked.length === 0) return null;
  if (type === "truefalse") return { kind: "bool", value: picked[0] === TRUE_ID };
  if (type === "single" || type === "cloze") return { kind: "options", ids: [picked[0]!] };
  if (type === "multi") return { kind: "options", ids: [...picked] };
  return null;
}

/** Exact match: multi-select is all or nothing. */
export function sameAnswer(a: AnswerKey | null | undefined, b: AnswerKey | null | undefined): boolean {
  if (!a || !b) return false;
  const x = [...answerIds(a)].sort();
  const y = [...answerIds(b)].sort();
  return x.length === y.length && x.every((id, i) => id === y[i]);
}

/** Next selection after tapping an option. Single-answer types replace, multi toggles. */
export function togglePick(type: QuestionType, picked: readonly string[], id: string): string[] {
  if (type !== "multi") return [id];
  return picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id];
}

/** Types the missed-question screens can show and retry. */
export function isRenderable(type: QuestionType): boolean {
  return type === "single" || type === "multi" || type === "truefalse" || type === "cloze";
}

/** Rows sorted by a remembered id order; ids it does not know go last, in their own order. */
export function stableOrder<T extends { id: string }>(rows: readonly T[], order: readonly string[]): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return rows
    .map((r, i) => ({ r, k: rank.get(r.id) ?? order.length + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.r);
}
