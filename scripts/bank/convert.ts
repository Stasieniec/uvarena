// YAML item -> exported bank item, following the conversion rules in
// src/shared/question-schema.ts.
import { createHash } from "node:crypto";
import { QUESTIONS } from "../../src/shared/game/config";
import type { AnswerKey } from "../../src/shared/game/types";
import type { BankItem, BankLecture, QuizItem } from "../../src/shared/question-schema";
import { headingAnchor, noteSlug } from "./vault";

/** What a file says about its lecture, already validated. */
export interface FileHeader {
  course: string;
  lecture: string;
  title: string;
  sort?: number;
  note?: string;
  /** Course subfolder of the note ("Lectures" when absent). */
  noteFolder?: string;
}

/** JSON with sorted object keys, so hashes do not depend on key order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return v;
  });
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/** Option, order item or match pair ids, in YAML order. */
export function choiceIds(item: QuizItem): string[] {
  switch (item.type) {
    case "single":
    case "multi":
    case "cloze":
      return item.options.map((o) => o.id);
    case "order":
      return item.items.map((o) => o.id);
    case "match":
      return item.pairs.map((p) => p.id);
    case "truefalse":
      return [];
  }
}

export function targetId(index: number): string {
  return `t${index + 1}`;
}

export function answerKey(item: QuizItem): AnswerKey {
  switch (item.type) {
    case "single":
    case "multi":
    case "cloze":
      return { kind: "options", ids: item.options.filter((o) => o.correct === true).map((o) => o.id) };
    case "truefalse":
      return { kind: "bool", value: item.answer };
    case "order":
      return { kind: "order", ids: item.items.map((o) => o.id) };
    case "match":
      return {
        kind: "match",
        map: Object.fromEntries(item.pairs.map((p) => [p.id, targetId(item.targets.indexOf(p.target))])),
      };
  }
}

/**
 * sha256 of type, option ids and key: what an answer means. Text edits keep it;
 * a different key, or options added, removed or re-lettered, change it.
 * Same shape as the fixture bank's fingerprints.
 */
export function fingerprint(item: QuizItem): string {
  return sha256({ type: item.type, ids: choiceIds(item), key: answerKey(item) });
}

/** Every text a player sees for this item. */
export function displayedTexts(item: QuizItem): string[] {
  switch (item.type) {
    case "single":
    case "multi":
    case "cloze":
      return [item.prompt, ...item.options.map((o) => o.text)];
    case "truefalse":
      return [item.statement];
    case "order":
      return [item.prompt, ...item.items.map((o) => o.text)];
    case "match":
      return [item.prompt, ...item.pairs.map((p) => p.text), ...item.targets];
  }
}

export function optionWhy(item: QuizItem): Record<string, string> {
  if (item.type !== "single" && item.type !== "multi" && item.type !== "cloze") return {};
  const out: Record<string, string> = {};
  for (const o of item.options) if (o.correct !== true && o.why) out[o.id] = o.why.trim();
  return out;
}

/** sha256 of all displayed text, the explanations and the code language. */
export function contentHash(item: QuizItem): string {
  return sha256({ texts: displayedTexts(item), why: item.why.trim(), optionWhy: optionWhy(item), code: item.code ?? null });
}

export function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

const ABBREVIATIONS = /\b(?:e\.g|i\.e|etc|vs|cf|approx|incl|resp|Fig|Eq|Dr|Mr|Ms|No)\.$/i;

/** The first sentence of `why`. Abbreviations such as "e.g." do not end it. */
export function firstSentence(why: string): string {
  const text = why.trim().replace(/\s+/g, " ");
  const re = /[.!?](?=\s)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const head = text.slice(0, m.index + 1);
    if (ABBREVIATIONS.test(head)) continue;
    if (/\d\.$/.test(head) && /^\s\d/.test(text.slice(m.index + 1))) continue;
    return head;
  }
  return text;
}

/** First sentence of `why`, cut to QUESTIONS.whyShortMaxWords words. */
export function whyShort(why: string): string {
  const words = firstSentence(why).split(" ");
  if (words.length <= QUESTIONS.whyShortMaxWords) return words.join(" ");
  return `${words.slice(0, QUESTIONS.whyShortMaxWords).join(" ").replace(/[,;:]$/, "")}...`;
}

function factorial(n: number): number {
  return n <= 1 ? 1 : n * factorial(n - 1);
}

export function chance(item: QuizItem): number {
  switch (item.type) {
    case "single":
    case "cloze":
      return 1 / item.options.length;
    case "truefalse":
      return 0.5;
    case "multi":
      return 1 / (2 ** item.options.length - 1);
    case "order":
      return 1 / factorial(item.items.length);
    case "match":
      return 1 / item.targets.length ** item.pairs.length;
  }
}

/** Default lecture sort: the number in an `L05` or `W02` suffix, else after the numbered lectures. */
export function defaultSort(lecture: string): number {
  const m = /-(?:L|W)(\d+)/i.exec(lecture);
  return m ? Number(m[1]) : 1000;
}

export function lectureNoteUrl(base: string, course: string, note: string | undefined, folder = "Lectures"): string | null {
  if (!note) return null;
  return `${base}/Courses/${course}/${noteSlug(folder)}/${noteSlug(note)}`;
}

export function itemNoteUrl(
  base: string,
  course: string,
  note: string | undefined,
  section: string | undefined,
  folder = "Lectures",
): string | null {
  const url = lectureNoteUrl(base, course, note, folder);
  if (!url) return null;
  return section ? `${url}#${headingAnchor(section)}` : url;
}

export function toBankLecture(header: FileHeader, notesBase: string): BankLecture {
  return {
    id: header.lecture,
    courseId: header.course.toLowerCase(),
    title: header.title.trim(),
    sort: header.sort ?? defaultSort(header.lecture),
    noteUrl: lectureNoteUrl(notesBase, header.course, header.note, header.noteFolder),
  };
}

const trimOrNull = (s: string | undefined) => (s === undefined ? null : s.trim());

/** Converts one checked item (with an assigned id, not a draft). */
export function toBankItem(item: QuizItem, header: FileHeader, sourcePath: string, notesBase: string): BankItem {
  if (item.id === "new") throw new Error(`question in ${sourcePath} has no id yet`);
  if (item.status === "draft") throw new Error(`draft ${item.id} is not exported`);
  const prompt = item.type === "truefalse" ? null : item.prompt.trim();
  const statement = item.type === "truefalse" ? item.statement.trim() : null;
  let options: { id: string; text: string }[] = [];
  let targets: { id: string; text: string }[] | null = null;
  let shuffle = true;
  switch (item.type) {
    case "single":
    case "multi":
    case "cloze":
      options = item.options.map((o) => ({ id: o.id, text: item.code ? o.text.replace(/\s+$/, "") : o.text.trim() }));
      shuffle = item.shuffle ?? true;
      break;
    case "order":
      options = item.items.map((o) => ({ id: o.id, text: o.text.trim() }));
      break;
    case "match":
      options = item.pairs.map((p) => ({ id: p.id, text: p.text.trim() }));
      targets = item.targets.map((t, i) => ({ id: targetId(i), text: t.trim() }));
      break;
    case "truefalse":
      break;
  }
  const texts = displayedTexts(item);
  return {
    id: item.id,
    rev: item.rev ?? 1,
    status: item.status === "retired" ? "retired" : "active",
    courseId: header.course.toLowerCase(),
    lectureId: header.lecture,
    type: item.type,
    difficulty: item.difficulty,
    level: item.level,
    topics: item.topics.map((t) => t.trim()),
    prompt,
    statement,
    codeLang: trimOrNull(item.code),
    options,
    targets,
    key: answerKey(item),
    shuffle,
    why: item.why.trim(),
    whyShort: whyShort(item.why),
    optionWhy: optionWhy(item),
    noteUrl: itemNoteUrl(notesBase, header.course, header.note, item.section, header.noteFolder),
    timeS: item.time ?? null,
    words: texts.reduce((n, t) => n + countWords(t), 0),
    chance: chance(item),
    startRating: QUESTIONS.startRating[item.difficulty],
    fingerprint: fingerprint(item),
    contentHash: contentHash(item),
    sourcePath,
  };
}
