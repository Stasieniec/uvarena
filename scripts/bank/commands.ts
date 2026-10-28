// `export` and `import`.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { BankFileSchema, type BankFile, type BankItem, type BankLecture, type Fingerprints } from "../../src/shared/question-schema";
import { checkVault, printCheck, type CheckResult } from "./check";
import { toBankItem, toBankLecture } from "./convert";
import { d1ExecFile, d1Query, type D1Target } from "./d1";
import { displayPath } from "./diagnostics";
import { notesUrl } from "./paths";
import { onlyActiveCourses, planImport, planSql, SELECT_ACTIVE_COURSES, SELECT_LECTURES, SELECT_QUESTIONS, type ImportPlan } from "./sql";

export interface ExportArgs {
  vault: string;
  fingerprints: string;
  out: string;
  course: string | null;
  warnings: boolean;
}

export interface ImportArgs extends ExportArgs {
  sql: string;
  target: "local" | "remote";
  persistTo?: string;
  dryRun: boolean;
}

export function vaultCommit(vault: string): string | null {
  const res = spawnSync("git", ["-C", vault, "rev-parse", "HEAD"], { encoding: "utf8" });
  return res.status === 0 ? res.stdout.trim() || null : null;
}

/** True when docs/quiz has uncommitted changes, so HEAD does not describe the export. */
function quizDirty(vault: string): boolean {
  const res = spawnSync("git", ["-C", vault, "status", "--porcelain", "--", "docs/quiz"], { encoding: "utf8" });
  return res.status === 0 && res.stdout.trim().length > 0;
}

/** Builds the bank from a check result with no errors. Drafts are left out; retired items are kept. */
export function buildBank(result: CheckResult, commit: string | null, now: number): BankFile {
  const base = notesUrl();
  const lectures: BankLecture[] = [];
  const questions: BankItem[] = [];
  for (const f of result.files) {
    if (!f.header) throw new Error(`${f.file.rel} has no valid header`);
    lectures.push(toBankLecture(f.header, base));
    for (const it of f.items) {
      if (!it.item) throw new Error(`${f.file.rel}: question ${it.index + 1} did not pass the schema`);
      if (it.item.status === "draft") continue;
      questions.push(toBankItem(it.item, f.header, f.file.rel, base));
    }
  }
  lectures.sort((a, b) => a.courseId.localeCompare(b.courseId) || a.sort - b.sort || a.id.localeCompare(b.id));
  return BankFileSchema.parse({ version: 1, generatedAt: now, vaultCommit: commit, lectures, questions });
}

/** Adds or updates an entry for every exported question; entries are never removed. */
export function mergeFingerprints(existing: Fingerprints, bank: BankFile): Fingerprints {
  const merged: Fingerprints = { ...existing };
  for (const q of bank.questions) merged[q.id] = { rev: q.rev, fingerprint: q.fingerprint };
  return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
}

function writeJson(path: string, value: unknown): boolean {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (existsSync(path) && readFileSync(path, "utf8") === text) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return true;
}

/** check, then bank.json and fingerprints.json. Returns the bank, or null on errors. */
export async function runExport(args: ExportArgs): Promise<BankFile | null> {
  const result = checkVault({ vault: args.vault, fingerprintsPath: args.fingerprints });
  if (!printCheck(result, args)) {
    console.error("export: fix the errors above first; nothing was written");
    return null;
  }
  const bank = buildBank(result, vaultCommit(args.vault), Date.now());
  if (bank.vaultCommit && quizDirty(args.vault)) {
    console.log(`export: note: the vault's docs/quiz has uncommitted changes, so vault commit ${bank.vaultCommit.slice(0, 8)} does not fully describe this export`);
  }
  writeJson(args.out, bank);
  const fpChanged = writeJson(args.fingerprints, mergeFingerprints(result.fingerprints, bank));
  const retired = bank.questions.filter((q) => q.status === "retired").length;
  console.log(
    `export: ${bank.lectures.length} lecture(s), ${bank.questions.length - retired} active and ${retired} retired question(s) -> ${displayPath(args.out)}`,
  );
  if (fpChanged) console.log(`export: updated ${displayPath(args.fingerprints)}; commit it with the game repo`);
  return bank;
}

export function summary(plan: ImportPlan): string {
  return (
    `added ${plan.added.length}, changed ${plan.changed.length}, rev-bumped ${plan.revBumped.length}, ` +
    `retired ${plan.retired.length}, unchanged ${plan.unchanged.length}` +
    ` (lectures: ${plan.lecturesAdded.length} added, ${plan.lecturesChanged.length} changed)`
  );
}

export async function runImport(args: ImportArgs): Promise<ImportPlan | null> {
  const exported = await runExport(args);
  if (!exported) return null;
  const target: D1Target = args.target === "remote" ? { kind: "remote" } : { kind: "local", persistTo: args.persistTo };
  const activeIds = d1Query(target, SELECT_ACTIVE_COURSES).map((r) => String(r.id));
  const { bank, skipped } = onlyActiveCourses(exported, activeIds);
  for (const s of skipped) {
    console.log(`import: skipped ${s.code}, not an active course in D1 (${s.lectures} lecture(s), ${s.questions} question(s))`);
  }
  const dbQuestions = d1Query(target, SELECT_QUESTIONS);
  const dbLectures = d1Query(target, SELECT_LECTURES);
  const now = Date.now();
  const plan = planImport({ bank, dbQuestions, dbLectures, now, importId: randomUUID() });
  mkdirSync(dirname(args.sql), { recursive: true });
  writeFileSync(args.sql, planSql(plan, `quiz bank import, vault ${bank.vaultCommit ?? "unknown"}, ${new Date(now).toISOString()}`));
  if (args.dryRun) {
    console.log(`import (dry run, ${args.target}): would apply: ${summary(plan)}. SQL in ${displayPath(args.sql)}`);
    return plan;
  }
  d1ExecFile(target, args.sql);
  console.log(`import (${args.target}): ${summary(plan)}`);
  return plan;
}
