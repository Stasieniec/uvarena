// Import planning: compares the exported bank with what D1 holds, counts
// added, changed, rev-bumped, retired and unchanged questions, and writes the
// SQL. Ratings and answer counters are never touched, except that a rev
// change resets the rating to the start rating (the question means something
// else now). Questions are retired, never deleted.
import type { BankFile, BankItem, BankLecture } from "../../src/shared/question-schema";
import { canonicalJson } from "./convert";

export type SqlValue = string | number | boolean | null;
export type DbRow = Record<string, unknown>;

/** Columns the bank owns. Everything else (ratings, counters, created_at) belongs to the game. */
export const QUESTION_COLUMNS = [
  "rev",
  "course_id",
  "lecture_id",
  "status",
  "type",
  "prompt_md",
  "statement_md",
  "code_lang",
  "options_json",
  "targets_json",
  "key_json",
  "shuffle",
  "why_md",
  "why_short",
  "option_why_json",
  "note_url",
  "difficulty",
  "level",
  "topics_json",
  "time_s",
  "words",
  "chance",
  "start_rating",
  "fingerprint",
  "content_hash",
  "source_path",
] as const;
type QuestionColumn = (typeof QUESTION_COLUMNS)[number];

const JSON_COLUMNS = new Set<string>(["options_json", "targets_json", "key_json", "option_why_json", "topics_json"]);

export const LECTURE_COLUMNS = ["course_id", "title", "sort", "note_url"] as const;

/** D1 rejects statements longer than this (100 KB); stay under it. */
export const MAX_STATEMENT_BYTES = 100_000;

export const SELECT_QUESTIONS = `SELECT id, ${QUESTION_COLUMNS.join(", ")} FROM questions`;
export const SELECT_ACTIVE_COURSES = "SELECT id, code FROM courses WHERE active = 1";

export interface CourseFilter {
  /** The bank with only the active courses' lectures and questions. */
  bank: BankFile;
  /** Course codes left out, with what was left out, in code order. */
  skipped: { code: string; lectures: number; questions: number }[];
}

/**
 * Keeps only the courses that are active in D1. The vault can hold quiz files
 * for a course the app does not offer right now; those are skipped, not
 * errors, and come back with the next import once the course is active again.
 */
export function onlyActiveCourses(bank: BankFile, activeCourseIds: readonly string[]): CourseFilter {
  const active = new Set(activeCourseIds);
  const skipped = new Map<string, { code: string; lectures: number; questions: number }>();
  const skip = (courseId: string) => {
    const entry = skipped.get(courseId) ?? { code: courseId.toUpperCase(), lectures: 0, questions: 0 };
    skipped.set(courseId, entry);
    return entry;
  };
  for (const l of bank.lectures) if (!active.has(l.courseId)) skip(l.courseId).lectures += 1;
  for (const q of bank.questions) if (!active.has(q.courseId)) skip(q.courseId).questions += 1;
  return {
    bank: {
      ...bank,
      lectures: bank.lectures.filter((l) => active.has(l.courseId)),
      questions: bank.questions.filter((q) => active.has(q.courseId)),
    },
    skipped: [...skipped.values()].sort((a, b) => a.code.localeCompare(b.code)),
  };
}
export const SELECT_LECTURES = `SELECT id, ${LECTURE_COLUMNS.join(", ")} FROM lectures`;

export function questionRow(q: BankItem): Record<QuestionColumn, SqlValue> {
  return {
    rev: q.rev,
    course_id: q.courseId,
    lecture_id: q.lectureId,
    status: q.status,
    type: q.type,
    prompt_md: q.prompt,
    statement_md: q.statement,
    code_lang: q.codeLang,
    options_json: JSON.stringify(q.options),
    targets_json: q.targets === null ? null : JSON.stringify(q.targets),
    key_json: JSON.stringify(q.key),
    shuffle: q.shuffle ? 1 : 0,
    why_md: q.why,
    why_short: q.whyShort,
    option_why_json: JSON.stringify(q.optionWhy),
    note_url: q.noteUrl,
    difficulty: q.difficulty,
    level: q.level,
    topics_json: JSON.stringify(q.topics),
    time_s: q.timeS,
    words: q.words,
    chance: q.chance,
    start_rating: q.startRating,
    fingerprint: q.fingerprint,
    content_hash: q.contentHash,
    source_path: q.sourcePath,
  };
}

export function lectureRow(l: BankLecture): Record<(typeof LECTURE_COLUMNS)[number], SqlValue> {
  return { course_id: l.courseId, title: l.title, sort: l.sort, note_url: l.noteUrl };
}

export function sqlLiteral(v: SqlValue): string {
  if (v === null) return "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`cannot write ${v} to SQL`);
    return String(v);
  }
  if (v.includes("\0")) throw new Error("text contains a NUL byte");
  return `'${v.replace(/'/g, "''")}'`;
}

/** Same value as far as the importer is concerned: JSON compared by content, numbers numerically. */
function sameValue(column: string, a: unknown, b: SqlValue): boolean {
  if (a === undefined) a = null;
  if (a === null || b === null) return a === b;
  if (JSON_COLUMNS.has(column)) {
    try {
      return canonicalJson(JSON.parse(String(a))) === canonicalJson(JSON.parse(String(b)));
    } catch {
      return String(a) === String(b);
    }
  }
  if (typeof b === "number" || typeof a === "number") return Math.abs(Number(a) - Number(b)) < 1e-9;
  return String(a) === String(b);
}

function differs(row: DbRow, wanted: Record<string, SqlValue>): string[] {
  return Object.keys(wanted).filter((c) => !sameValue(c, row[c], wanted[c]!));
}

export interface ImportPlan {
  added: string[];
  changed: string[];
  revBumped: string[];
  retired: string[];
  unchanged: string[];
  lecturesAdded: string[];
  lecturesChanged: string[];
  statements: string[];
}

export interface PlanInput {
  bank: BankFile;
  dbQuestions: DbRow[];
  dbLectures: DbRow[];
  now: number;
  importId: string;
}

export function planImport({ bank, dbQuestions, dbLectures, now, importId }: PlanInput): ImportPlan {
  const plan: ImportPlan = {
    added: [],
    changed: [],
    revBumped: [],
    retired: [],
    unchanged: [],
    lecturesAdded: [],
    lecturesChanged: [],
    statements: [],
  };

  const dbLectureById = new Map(dbLectures.map((r) => [String(r.id), r]));
  for (const l of bank.lectures) {
    const wanted = lectureRow(l);
    const existing = dbLectureById.get(l.id);
    if (existing && differs(existing, wanted).length === 0) continue;
    (existing ? plan.lecturesChanged : plan.lecturesAdded).push(l.id);
    const cols = ["id", ...LECTURE_COLUMNS];
    const values = [sqlLiteral(l.id), ...LECTURE_COLUMNS.map((c) => sqlLiteral(wanted[c]))];
    plan.statements.push(
      `INSERT INTO lectures (${cols.join(", ")}) VALUES (${values.join(", ")})\n` +
        `  ON CONFLICT(id) DO UPDATE SET ${LECTURE_COLUMNS.map((c) => `${c} = excluded.${c}`).join(", ")};`,
    );
  }

  const dbById = new Map(dbQuestions.map((r) => [String(r.id), r]));
  const bankIds = new Set<string>();
  for (const q of bank.questions) {
    bankIds.add(q.id);
    const wanted = questionRow(q);
    const existing = dbById.get(q.id);
    if (!existing) {
      // A question retired before it ever reached D1 has nothing to keep.
      if (q.status === "retired") continue;
      plan.added.push(q.id);
    } else {
      const diff = differs(existing, wanted);
      if (diff.length === 0) {
        plan.unchanged.push(q.id);
        continue;
      }
      if (Number(existing.rev) !== q.rev) plan.revBumped.push(q.id);
      else if (existing.status !== "retired" && q.status === "retired") plan.retired.push(q.id);
      else plan.changed.push(q.id);
    }
    plan.statements.push(upsertQuestion(q, wanted, now));
  }

  // In D1 but gone from the bank: retire, never delete (matches, answers and
  // missed lists point at them).
  const gone = dbQuestions
    .filter((r) => !bankIds.has(String(r.id)) && r.status !== "retired")
    .map((r) => String(r.id))
    .sort();
  for (let i = 0; i < gone.length; i += 200) {
    const chunk = gone.slice(i, i + 200);
    plan.retired.push(...chunk);
    plan.statements.push(
      `UPDATE questions SET status = 'retired', updated_at = ${now} WHERE status <> 'retired' AND id IN (${chunk.map(sqlLiteral).join(", ")});`,
    );
  }

  plan.statements.push(
    `INSERT INTO question_imports (id, vault_commit, added, changed, rev_bumped, retired, unchanged, imported_at) VALUES (${[
      sqlLiteral(importId),
      sqlLiteral(bank.vaultCommit),
      plan.added.length,
      plan.changed.length,
      plan.revBumped.length,
      plan.retired.length,
      plan.unchanged.length,
      now,
    ].join(", ")});`,
  );

  for (const s of plan.statements) {
    if (Buffer.byteLength(s) > MAX_STATEMENT_BYTES) throw new Error(`An import statement is over ${MAX_STATEMENT_BYTES} bytes: ${s.slice(0, 80)}...`);
  }
  return plan;
}

/**
 * Insert, or update the bank's columns only. rating and rating_n reset to the
 * start rating only when the rev changes; attempts and correct never change.
 * SQLite evaluates every SET expression against the old row, so
 * `questions.rev` below is the stored rev.
 */
function upsertQuestion(q: BankItem, wanted: Record<QuestionColumn, SqlValue>, now: number): string {
  const cols = ["id", ...QUESTION_COLUMNS, "rating", "rating_n", "attempts", "correct", "created_at", "updated_at"];
  const values = [
    sqlLiteral(q.id),
    ...QUESTION_COLUMNS.map((c) => sqlLiteral(wanted[c])),
    sqlLiteral(q.startRating),
    "0",
    "0",
    "0",
    String(now),
    String(now),
  ];
  const sets = [
    "rating = CASE WHEN questions.rev <> excluded.rev THEN excluded.start_rating ELSE questions.rating END",
    "rating_n = CASE WHEN questions.rev <> excluded.rev THEN 0 ELSE questions.rating_n END",
    ...QUESTION_COLUMNS.map((c) => `${c} = excluded.${c}`),
    "updated_at = excluded.updated_at",
  ];
  return `INSERT INTO questions (${cols.join(", ")})\n  VALUES (${values.join(", ")})\n  ON CONFLICT(id) DO UPDATE SET ${sets.join(", ")};`;
}

export function planSql(plan: ImportPlan, header: string): string {
  return `-- ${header}\n${plan.statements.join("\n")}\n`;
}
