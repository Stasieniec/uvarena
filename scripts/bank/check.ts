// `check`: validates every quiz file in the vault. Errors block export;
// warnings are listed for review.
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { z } from "zod";
import {
  COURSE_CODES,
  FingerprintsSchema,
  QuizFileSchema,
  QuizItemSchema,
  YamlClozeSchema,
  YamlMatchSchema,
  YamlMultiSchema,
  YamlOrderSchema,
  YamlSingleSchema,
  YamlTrueFalseSchema,
  type Fingerprints,
  type QuizItem,
} from "../../src/shared/question-schema";
import { fingerprint, type FileHeader } from "./convert";
import { Diagnostics, formatDiagnostic, type Severity } from "./diagnostics";
import { findQuizFiles, lineAt, loadFile, type LoadedFile } from "./load";
import { CLI_PATH, NOTE_FOLDERS, QUIZ_DIR } from "./paths";
import { checkItem, contentWords, LIMITS, stripCode } from "./rules";
import { Vault } from "./vault";

export interface CheckOptions {
  vault: string;
  fingerprintsPath: string;
}

export interface CheckedItem {
  index: number;
  line: number;
  /** The raw `id` value when it is a string. */
  id: string | null;
  /** Set when the item passed the schema. */
  item: QuizItem | null;
}

export interface CheckedFile {
  file: LoadedFile;
  /** Set when the file-level fields passed the schema. */
  header: FileHeader | null;
  items: CheckedItem[];
}

export interface CheckResult {
  diagnostics: Diagnostics;
  files: CheckedFile[];
  fingerprints: Fingerprints;
}

const TYPE_FIELDS: Record<string, string[]> = {
  single: Object.keys(YamlSingleSchema.shape),
  multi: Object.keys(YamlMultiSchema.shape),
  cloze: Object.keys(YamlClozeSchema.shape),
  truefalse: Object.keys(YamlTrueFalseSchema.shape),
  order: Object.keys(YamlOrderSchema.shape),
  match: Object.keys(YamlMatchSchema.shape),
};
const FILE_FIELDS = ["course", "lecture", "title", "sort", "note", "questions"];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function pathLabel(path: readonly PropertyKey[]): string {
  let out = "";
  for (const seg of path) out += typeof seg === "number" ? `[${seg}]` : out ? `.${String(seg)}` : String(seg);
  return out;
}

function itemWhere(index: number, id: string | null): string {
  return id && id !== "new" ? `question ${index + 1}, ${id}` : `question ${index + 1}`;
}

/**
 * A readable message for a zod issue. `type` is the raw item type when the
 * issue is inside an item; `labelFrom` drops that many leading path segments
 * from the field name (2 for `questions[i]`); `input` is the raw value at the path.
 */
function issueMessages(
  issue: z.core.$ZodIssue,
  type: string | undefined,
  labelFrom: number,
  root: unknown,
): { path: PropertyKey[]; message: string }[] {
  const path = [...issue.path];
  const field = pathLabel(path.slice(labelFrom)) || "file";
  switch (issue.code) {
    case "unrecognized_keys": {
      const allowed = type && TYPE_FIELDS[type] ? TYPE_FIELDS[type]! : path.length === 0 ? FILE_FIELDS : null;
      return issue.keys.map((k) => ({
        path: [...path, k],
        message: `Unknown field "${k}"${type ? ` for a ${type} question` : ""}${allowed ? ` (allowed: ${allowed.join(", ")})` : ""}`,
      }));
    }
    case "invalid_type":
      if (/received undefined$/.test(issue.message)) return [{ path, message: `Missing ${field}` }];
      return [
        {
          path,
          message: `${field}: expected ${issue.expected}, got ${describe(valueAt(root, path))}${issue.expected === "boolean" ? " (write true or false)" : ""}`,
        },
      ];
    case "invalid_union":
      if (path[path.length - 1] === "type") return [{ path, message: `type must be one of single, multi, truefalse, cloze, order, match` }];
      return [{ path, message: `${field}: ${issue.message}` }];
    case "invalid_value":
      if (valueAt(root, path) === undefined) return [{ path, message: `Missing ${field}` }];
      return [{ path, message: `${field} must be one of ${issue.values.map(String).join(", ")}` }];
    case "invalid_format":
      if (path[path.length - 1] === "id" && path.length === 3) {
        return [{ path, message: `id must be "new" (the tool assigns the real one) or an id the tool assigned` }];
      }
      return [{ path, message: `${field}: ${issue.message}` }];
    case "too_small":
    case "too_big": {
      const n = issue.code === "too_small" ? issue.minimum : issue.maximum;
      if (issue.origin === "array") {
        const what = type ? `A ${type} question` : field;
        const bound = issue.code === "too_small" ? "at least" : "at most";
        return [{ path, message: `${what} needs ${bound} ${String(n)} ${String(path[path.length - 1])}` }];
      }
      if (issue.origin === "string") return [{ path, message: `${field} is empty` }];
      return [{ path, message: `${field}: ${issue.message}` }];
    }
    default:
      return [{ path, message: issue.message }];
  }
}

function valueAt(root: unknown, path: readonly PropertyKey[]): unknown {
  let v: unknown = root;
  for (const seg of path) {
    if (v === null || typeof v !== "object") return undefined;
    v = (v as Record<PropertyKey, unknown>)[seg];
  }
  return v;
}

function describe(v: unknown): string {
  if (v === null) return "nothing (null)";
  if (typeof v === "string") return `the string "${v.length > 20 ? `${v.slice(0, 20)}...` : v}"`;
  if (Array.isArray(v)) return "a list";
  return typeof v;
}

const EM_DASH = "\u2014";
const EMOJI = /\p{Extended_Pictographic}/u;

export function checkVault(opts: CheckOptions): CheckResult {
  const diags = new Diagnostics();
  const vault = new Vault(opts.vault);
  const files: CheckedFile[] = [];

  if (!existsSync(opts.vault)) {
    diags.error(opts.vault, 0, "Vault folder not found");
    return { diagnostics: diags, files, fingerprints: {} };
  }

  const quizFiles = findQuizFiles(opts.vault);
  if (quizFiles.length === 0) diags.warn(join(opts.vault, QUIZ_DIR), 0, "No quiz files found");
  for (const abs of quizFiles) {
    const name = basename(abs);
    if (!name.endsWith(".quiz.yaml")) {
      diags.warn(abs, 0, "Skipped: quiz files are named <lecture>.quiz.yaml");
      continue;
    }
    files.push(checkFile(abs, name.slice(0, -".quiz.yaml".length), opts.vault, vault, diags));
  }

  const fingerprints = loadFingerprints(opts.fingerprintsPath, diags);
  checkIds(files, fingerprints, opts, diags);
  checkDuplicates(files, diags);
  for (const f of files) checkBalance(f, diags);
  return { diagnostics: diags, files, fingerprints };
}

function checkFile(abs: string, stem: string, vaultRoot: string, vault: Vault, diags: Diagnostics): CheckedFile {
  const file = loadFile(vaultRoot, abs);
  const result: CheckedFile = { file, header: null, items: [] };

  // House writing rules on every raw line, comments included (same as lint:copy).
  file.lines.forEach((line, i) => {
    if (line.includes(EM_DASH)) diags.error(abs, i + 1, "Em-dash: use a comma, a colon or a new sentence");
    if (EMOJI.test(line)) diags.error(abs, i + 1, "Emoji: remove it");
  });

  if (!(COURSE_CODES as readonly string[]).includes(file.folder)) {
    diags.error(abs, 0, `Quiz files go in ${QUIZ_DIR}/<COURSE>/ with COURSE one of ${COURSE_CODES.join(", ")}`);
  }

  for (const e of file.yamlErrors) diags.error(abs, e.line, e.message);
  if (file.data === undefined) return result;
  if (!isRecord(file.data)) {
    diags.error(abs, 1, "The file must be a map with course, lecture, title and questions");
    return result;
  }
  const data = file.data;
  const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
  const rawType = (i: number) => {
    const q = rawQuestions[i];
    return isRecord(q) && typeof q.type === "string" ? q.type : undefined;
  };
  const rawId = (i: number) => {
    const q = rawQuestions[i];
    return isRecord(q) && typeof q.id === "string" ? q.id : null;
  };
  const where = (path: readonly PropertyKey[]) =>
    path[0] === "questions" && typeof path[1] === "number" ? itemWhere(path[1], rawId(path[1])) : undefined;

  // Schema: the whole file, then every item on its own (so one broken item
  // does not hide the rules zod runs only on a valid parent).
  const fileIssues = QuizFileSchema.safeParse(data).error?.issues ?? [];
  let headerOk = true;
  for (const issue of fileIssues) {
    const inItem = issue.path[0] === "questions" && typeof issue.path[1] === "number";
    if (!inItem) headerOk = false;
    const type = inItem ? rawType(issue.path[1] as number) : undefined;
    for (const m of issueMessages(issue, type, inItem ? 2 : 0, data)) diags.error(abs, lineAt(file, m.path), m.message, where(m.path));
  }

  const course = typeof data.course === "string" ? data.course : "";
  const lecture = typeof data.lecture === "string" ? data.lecture : "";
  const note = typeof data.note === "string" ? data.note : undefined;

  // File-level rules. The schema has the same ones but runs them only when the
  // rest of the file is valid; the messages match, so duplicates collapse.
  if (course && file.folder && course !== file.folder) {
    diags.error(abs, lineAt(file, ["course"]), `course is ${course} but the file is in the ${file.folder} folder`);
  }
  if (lecture && lecture !== stem) diags.error(abs, lineAt(file, ["lecture"]), `lecture must equal the file name: "${stem}"`);
  if (course && lecture && !lecture.startsWith(`${course}-`)) {
    diags.error(abs, lineAt(file, ["lecture"]), `lecture must start with "${course}-"`);
  }
  let noteInfo = null;
  if (note && (COURSE_CODES as readonly string[]).includes(course)) {
    noteInfo = vault.note(course, note);
    if (!noteInfo) {
      const where = NOTE_FOLDERS.map((f) => `Courses/${course}/${f}/${note}.md`).join(", ");
      diags.error(abs, lineAt(file, ["note"]), `note "${note}" not found: expected one of ${where} in the vault`);
    }
  }

  if (headerOk && typeof data.title === "string") {
    result.header = {
      course,
      lecture,
      title: data.title,
      sort: typeof data.sort === "number" ? data.sort : undefined,
      note,
      noteFolder: noteInfo?.folder,
    };
  }

  rawQuestions.forEach((raw, index) => {
    const id = rawId(index);
    const itemPath = ["questions", index];
    const checked: CheckedItem = { index, line: lineAt(file, itemPath), id, item: null };
    result.items.push(checked);
    if (!isRecord(raw)) return;
    if (note && !raw.section) {
      diags.error(abs, checked.line, "section is required when the file has a note", itemWhere(index, id));
    }
    if (course && id && id !== "new" && !id.startsWith(`${course.toLowerCase()}-`)) {
      diags.error(abs, lineAt(file, [...itemPath, "id"]), `id must start with "${course.toLowerCase()}-"`, itemWhere(index, id));
    }
    const parsed = QuizItemSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        for (const m of issueMessages(issue, rawType(index), 0, raw)) {
          diags.error(abs, lineAt(file, [...itemPath, ...m.path]), m.message, itemWhere(index, id));
        }
      }
      return;
    }
    const item = parsed.data;
    checked.item = item;
    const status = item.status ?? "active";
    const report = (severity: Severity, path: readonly PropertyKey[], message: string) => {
      const line = lineAt(file, [...itemPath, ...path]);
      if (severity === "error" && status !== "active") diags.warn(abs, line, `${message} (${status}, so not blocking)`, itemWhere(index, id));
      else diags.add({ severity, file: abs, line, message, where: itemWhere(index, id) });
    };
    checkItem(item, report, { note: noteInfo, hasNote: note !== undefined, concepts: () => vault.concepts() });
  });

  return result;
}

function loadFingerprints(path: string, diags: Diagnostics): Fingerprints {
  if (!existsSync(path)) return {};
  try {
    const parsed = FingerprintsSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (parsed.success) return parsed.data;
    diags.error(path, 0, `Invalid fingerprint file: ${parsed.error.issues[0]?.message ?? "unknown problem"}`);
  } catch (e) {
    diags.error(path, 0, `Invalid fingerprint file: ${(e as Error).message}`);
  }
  return {};
}

function checkIds(files: CheckedFile[], fingerprints: Fingerprints, opts: CheckOptions, diags: Diagnostics): void {
  const seen = new Map<string, { file: CheckedFile; item: CheckedItem }[]>();
  for (const f of files) {
    const unassigned: number[] = [];
    for (const it of f.items) {
      if (it.id === "new") unassigned.push(it.line);
      else if (it.id) seen.set(it.id, [...(seen.get(it.id) ?? []), { file: f, item: it }]);
    }
    if (unassigned.length > 0) {
      const lines = unassigned.slice(0, 8).join(", ") + (unassigned.length > 8 ? ", ..." : "");
      diags.error(
        f.file.abs,
        unassigned[0]!,
        `${unassigned.length} question(s) still have id: new (lines ${lines}). Assign ids with: npx tsx ${CLI_PATH} ids --vault ${opts.vault}`,
      );
    }
  }

  for (const [id, uses] of seen) {
    if (uses.length < 2) continue;
    for (const u of uses) {
      const others = uses.filter((o) => o !== u).map((o) => `${o.file.file.rel}:${o.item.line}`);
      diags.error(u.file.file.abs, u.item.line, `Duplicate id ${id}, also at ${others.join(", ")}. Set one of them to id: new`, itemWhere(u.item.index, id));
    }
  }

  // Fingerprints from the last export: meaning changes need a rev bump, and
  // exported ids never disappear.
  for (const [id, uses] of seen) {
    const stored = fingerprints[id];
    const u = uses[0]!;
    const item = u.item.item;
    if (!stored || !item || item.status === "draft") continue;
    const rev = item.rev ?? 1;
    const line = lineAt(u.file.file, ["questions", u.item.index, "rev"]);
    if (rev < stored.rev) {
      diags.error(u.file.file.abs, line, `rev is ${rev} but ${stored.rev} was already exported; revs never go down`, itemWhere(u.item.index, id));
    } else if (rev === stored.rev && fingerprint(item) !== stored.fingerprint) {
      diags.error(
        u.file.file.abs,
        line,
        `The key or the option ids changed since the last export, so the meaning changed: set rev: ${stored.rev + 1} (resets the item's rating) or undo the change`,
        itemWhere(u.item.index, id),
      );
    }
  }
  for (const id of Object.keys(fingerprints).sort()) {
    if (!seen.has(id)) {
      diags.error(
        opts.fingerprintsPath,
        0,
        `${id} was exported before but is no longer in the vault. Put the question back with status: retired (ids are never deleted or reused)`,
      );
    }
  }
}

interface StemEntry {
  file: CheckedFile;
  it: CheckedItem;
  item: QuizItem;
  stem: string;
  words: Set<string>;
  optionsSig: string;
}

function normText(s: string): string {
  return stripCode(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function checkDuplicates(files: CheckedFile[], diags: Diagnostics): void {
  const entries: StemEntry[] = [];
  for (const f of files) {
    for (const it of f.items) {
      const item = it.item;
      if (!item || item.status === "retired") continue;
      const stemText = item.type === "truefalse" ? item.statement : item.prompt;
      const optionTexts =
        item.type === "single" || item.type === "multi" || item.type === "cloze"
          ? item.options.map((o) => normText(o.text)).sort()
          : item.type === "truefalse"
            ? [String(item.answer)]
            : [];
      entries.push({
        file: f,
        it,
        item,
        stem: normText(stemText),
        words: contentWords(stemText),
        optionsSig: `${item.type}|${optionTexts.join("|")}`,
      });
    }
  }
  for (let j = 1; j < entries.length; j++) {
    const b = entries[j]!;
    for (let i = 0; i < j; i++) {
      const a = entries[i]!;
      const at = `${a.file.file.rel}:${a.it.line}`;
      const whereB = itemWhere(b.it.index, b.it.id);
      if (a.stem === b.stem) {
        if (a.optionsSig === b.optionsSig) diags.error(b.file.file.abs, b.it.line, `Duplicate of the question at ${at}`, whereB);
        else diags.warn(b.file.file.abs, b.it.line, `Same prompt as the question at ${at}; make sure they ask different things`, whereB);
        break;
      }
      if (a.words.size >= LIMITS.nearDuplicateMinWords && b.words.size >= LIMITS.nearDuplicateMinWords) {
        let shared = 0;
        for (const w of a.words) if (b.words.has(w)) shared++;
        const jaccard = shared / (a.words.size + b.words.size - shared);
        if (jaccard >= LIMITS.nearDuplicate) {
          diags.warn(b.file.file.abs, b.it.line, `Nearly the same prompt as the question at ${at}`, whereB);
          break;
        }
      }
    }
  }
}

const DIFFICULTY_TARGET = { easy: 0.3, medium: 0.45, hard: 0.25 } as const;
const BALANCE = {
  /** Share checks only make sense from this many active items in a file. */
  minItems: 8,
  /** A difficulty share this far from its target is flagged. */
  difficultyTolerance: 0.2,
  /** True/false share above this is flagged (target about 15 to 20%). */
  maxTrueFalse: 0.3,
  /** One key position holding more than this share of single/cloze keys is flagged. */
  maxKeyPosition: 0.5,
  minKeyItems: 4,
  minMultiItems: 3,
} as const;

function checkBalance(f: CheckedFile, diags: Diagnostics): void {
  const items = f.items.map((i) => i.item).filter((i): i is QuizItem => i !== null && (i.status ?? "active") === "active");
  const abs = f.file.abs;
  if (items.length >= BALANCE.minItems) {
    const n = items.length;
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    const tf = items.filter((i) => i.type === "truefalse").length / n;
    if (tf > BALANCE.maxTrueFalse) diags.warn(abs, 0, `Balance: ${pct(tf)} of the questions are true/false (target about 15 to 20%)`);
    for (const d of ["easy", "medium", "hard"] as const) {
      const share = items.filter((i) => i.difficulty === d).length / n;
      if (Math.abs(share - DIFFICULTY_TARGET[d]) > BALANCE.difficultyTolerance) {
        diags.warn(abs, 0, `Balance: ${pct(share)} ${d} (target about ${pct(DIFFICULTY_TARGET[d])}; mix 30/45/25 easy/medium/hard)`);
      }
    }
    const aboveRemember = items.filter((i) => i.level !== "remember").length / n;
    if (aboveRemember < 0.5) diags.warn(abs, 0, `Balance: only ${pct(aboveRemember)} of the questions are above level remember (target at least half)`);
  }

  const multis = items.filter((i): i is Extract<QuizItem, { type: "multi" }> => i.type === "multi");
  if (multis.length >= BALANCE.minMultiItems) {
    const counts = new Set(multis.map((m) => m.options.filter((o) => o.correct === true).length));
    if (counts.size === 1) {
      diags.warn(abs, 0, `Balance: every multi question has ${[...counts][0]} correct option(s); vary it so the count gives nothing away`);
    }
  }

  const keyed = items.filter((i): i is Extract<QuizItem, { type: "single" | "cloze" }> => i.type === "single" || i.type === "cloze");
  if (keyed.length >= BALANCE.minKeyItems) {
    const positions = new Map<number, number>();
    for (const k of keyed) {
      const p = k.options.findIndex((o) => o.correct === true);
      positions.set(p, (positions.get(p) ?? 0) + 1);
    }
    for (const [p, count] of positions) {
      if (count / keyed.length > BALANCE.maxKeyPosition) {
        diags.warn(abs, 0, `Balance: the key is option ${p + 1} in ${count} of ${keyed.length} single/cloze questions; vary where the key sits`);
      }
    }
  }
}

/** Prints diagnostics and a summary line. Returns true when there are no errors anywhere in the vault. */
export function printCheck(result: CheckResult, opts: { course: string | null; warnings: boolean }): boolean {
  const inCourse = (file: string) => !opts.course || file.includes(`/${opts.course}/`) || !file.includes("/docs/quiz/");
  const shown = result.diagnostics.sorted().filter((d) => inCourse(d.file) && (opts.warnings || d.severity === "error"));
  for (const d of shown) console.log(formatDiagnostic(d));
  const files = result.files.filter((f) => inCourse(f.file.abs));
  const questions = files.reduce((n, f) => n + f.items.length, 0);
  const errors = result.diagnostics.errors.filter((d) => inCourse(d.file)).length;
  const warnings = result.diagnostics.warnings.filter((d) => inCourse(d.file)).length;
  const scope = opts.course ? ` in ${opts.course}` : "";
  console.log(`check: ${files.length} file(s), ${questions} question(s)${scope}: ${errors} error(s), ${warnings} warning(s)`);
  return result.diagnostics.errors.length === 0;
}
