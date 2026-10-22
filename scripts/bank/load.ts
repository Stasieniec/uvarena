// Finding and parsing quiz files. YAML is parsed with the 1.2 core schema in
// strict mode, so `no` stays a string and duplicate keys are errors.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Document, type Node } from "yaml";
import { QUIZ_DIR } from "./paths";

export interface LoadedFile {
  /** Absolute path. */
  abs: string;
  /** Vault-relative path with forward slashes, e.g. docs/quiz/AGAI/AGAI-L05.quiz.yaml. */
  rel: string;
  /** Course folder name, e.g. AGAI. */
  folder: string;
  src: string;
  lines: string[];
  doc: Document;
  lineCounter: LineCounter;
  /** Parse errors and warnings, with lines. Empty when the YAML is well formed. */
  yamlErrors: { line: number; message: string }[];
  /** The plain JS value, or undefined when the YAML did not parse. */
  data: unknown;
}

export const YAML_OPTIONS = { schema: "core", version: "1.2", strict: true, uniqueKeys: true, prettyErrors: false } as const;

/** Every *.yaml / *.yml under <vault>/docs/quiz, sorted. */
export function findQuizFiles(vault: string): string[] {
  const root = join(vault, QUIZ_DIR);
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      if (entry.startsWith(".")) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.ya?ml$/.test(entry)) out.push(path);
    }
  };
  walk(root);
  return out;
}

export function loadFile(vault: string, abs: string): LoadedFile {
  const src = readFileSync(abs, "utf8");
  const rel = relative(vault, abs).split("\\").join("/");
  const parts = rel.split("/");
  const folder = parts.length >= 4 ? parts[2]! : "";
  const lineCounter = new LineCounter();
  const doc = parseDocument(src, { ...YAML_OPTIONS, lineCounter });
  const lineOf = (pos: number) => lineCounter.linePos(pos).line;
  const yamlErrors = [...doc.errors, ...doc.warnings].map((e) => ({
    line: lineOf(e.pos[0]),
    message: `YAML: ${e.message.split("\n")[0]}`,
  }));
  let data: unknown;
  if (doc.errors.length === 0) {
    try {
      data = doc.toJS({ maxAliasCount: 100 });
    } catch (e) {
      yamlErrors.push({ line: 1, message: `YAML: ${(e as Error).message}` });
    }
  }
  return { abs, rel, folder, src, lines: src.split("\n"), doc, lineCounter, yamlErrors, data };
}

/**
 * The 1-based line of the node at `path`, or of its nearest existing parent
 * when the path does not exist (for example a missing required field).
 */
export function lineAt(file: LoadedFile, path: readonly PropertyKey[]): number {
  let node: unknown = file.doc.contents;
  let best = rangeLine(file, node);
  for (const seg of path) {
    if (isMap(node)) {
      // Point at the key: a value can start on a later line (block scalars, nested lists).
      const pair = node.items.find((p) => isScalar(p.key) && p.key.value === seg);
      if (!pair) return best;
      best = rangeLine(file, pair.key) || best;
      node = pair.value;
    } else if (isSeq(node) && typeof seg === "number" && node.items[seg] !== undefined) {
      node = node.items[seg];
      best = rangeLine(file, node) || best;
    } else {
      return best;
    }
    if (node === null || node === undefined) return best;
  }
  return best;
}

function rangeLine(file: LoadedFile, node: unknown): number {
  const range = (node as Node | null | undefined)?.range;
  if (!range) return 0;
  return file.lineCounter.linePos(range[0]).line;
}
