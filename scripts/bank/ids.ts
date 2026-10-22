// `ids`: replaces each item-level `id: new` with a fresh `<course>-<6 chars>`.
// Edits the text in place, so comments and formatting survive.
import { randomInt } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import { QUESTIONS } from "../../src/shared/game/config";
import { FingerprintsSchema, QUESTION_ID_PATTERN } from "../../src/shared/question-schema";
import { findQuizFiles, YAML_OPTIONS } from "./load";

export interface IdsResult {
  /** Files changed, with how many ids each got. */
  assigned: { file: string; count: number }[];
  /** Files skipped because they do not parse or have no course. */
  skipped: { file: string; reason: string }[];
}

export function newId(course: string, taken: Set<string>, rand: (n: number) => number = randomInt): string {
  for (;;) {
    let suffix = "";
    for (let i = 0; i < QUESTIONS.idLength; i++) suffix += QUESTIONS.idAlphabet[rand(QUESTIONS.idAlphabet.length)];
    const id = `${course.toLowerCase()}-${suffix}`;
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
}

/** Every id already used: item ids anywhere in the vault's quiz files, plus the fingerprint file. */
export function takenIds(files: string[], fingerprintsPath: string): Set<string> {
  const taken = new Set<string>();
  const anyId = new RegExp(QUESTION_ID_PATTERN.source.slice(1, -1), "g");
  for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(anyId)) taken.add(m[0]);
  if (existsSync(fingerprintsPath)) {
    const parsed = FingerprintsSchema.safeParse(JSON.parse(readFileSync(fingerprintsPath, "utf8")));
    if (parsed.success) for (const id of Object.keys(parsed.data)) taken.add(id);
  }
  return taken;
}

/** Returns the new text and how many ids were assigned, or a reason the file was skipped. */
export function assignIdsInText(src: string, taken: Set<string>, rand?: (n: number) => number): { text: string; count: number } | { skip: string } {
  const doc = parseDocument(src, YAML_OPTIONS);
  if (doc.errors.length > 0) return { skip: `YAML does not parse (${doc.errors[0]!.message.split("\n")[0]})` };
  const root = doc.contents;
  if (!isMap(root)) return { skip: "not a quiz file (no top-level map)" };
  const course = root.get("course");
  if (typeof course !== "string" || !/^[A-Za-z0-9]{2,16}$/.test(course)) return { skip: "no valid course field" };
  const questions = root.get("questions", true);
  if (!isSeq(questions)) return { skip: "no questions list" };

  const edits: { start: number; end: number; id: string }[] = [];
  for (const q of questions.items) {
    if (!isMap(q)) continue;
    const idNode = q.get("id", true);
    if (!isScalar(idNode) || idNode.value !== "new" || !idNode.range) continue;
    edits.push({ start: idNode.range[0], end: idNode.range[1], id: newId(course, taken, rand) });
  }
  let text = src;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) text = text.slice(0, e.start) + e.id + text.slice(e.end);
  return { text, count: edits.length };
}

export function assignIds(vault: string, fingerprintsPath: string, rand?: (n: number) => number): IdsResult {
  const files = findQuizFiles(vault).filter((f) => basename(f).endsWith(".quiz.yaml"));
  const taken = takenIds(files, fingerprintsPath);
  const result: IdsResult = { assigned: [], skipped: [] };
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const out = assignIdsInText(src, taken, rand);
    if ("skip" in out) {
      if (/\bid:\s*["']?new["']?\s*(#.*)?$/m.test(src)) result.skipped.push({ file: f, reason: out.skip });
      continue;
    }
    if (out.count > 0) {
      writeFileSync(f, out.text);
      result.assigned.push({ file: f, count: out.count });
    }
  }
  return result;
}
