// Fixture vaults for the bank tool tests: a temp folder with quiz files,
// notes and concept notes written from strings.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach } from "vitest";
import { checkVault, type CheckResult } from "../../../scripts/bank/check";
import type { Diagnostic } from "../../../scripts/bank/diagnostics";

const made: string[] = [];

afterEach(() => {
  while (made.length) rmSync(made.pop()!, { recursive: true, force: true });
});

/** Writes `files` (vault-relative path -> content) into a new temp vault. */
export function makeVault(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "bank-vault-"));
  made.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

export function writeIn(root: string, rel: string, content: string): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export function check(vault: string, fingerprintsPath = join(vault, "fingerprints.json")): CheckResult {
  return checkVault({ vault, fingerprintsPath });
}

export function errors(r: CheckResult): Diagnostic[] {
  return r.diagnostics.errors;
}

export function warnings(r: CheckResult): Diagnostic[] {
  return r.diagnostics.warnings;
}

export function messages(list: Diagnostic[]): string[] {
  return list.map((d) => `${d.line}: ${d.message}`);
}

export const AGAI_FILE = "docs/quiz/AGAI/AGAI-starter-games.quiz.yaml";
export const EPRM_FILE = "docs/quiz/EPRM/EPRM-W02.quiz.yaml";

export function agaiHeader(extra = ""): string {
  return `course: AGAI\nlecture: AGAI-starter-games\ntitle: Games\n${extra}questions:\n`;
}

/** A single-choice item that passes every rule. Indented as a list entry under `questions:`. */
export function single(id = "agai-2a3b4c", over: Partial<Record<"prompt" | "a" | "b" | "c" | "extra" | "why", string>> = {}): string {
  return `  - id: ${id}
    type: single
    difficulty: easy
    level: remember
    topics: [Nash Equilibrium]
    prompt: ${over.prompt ?? "In a Nash equilibrium, what holds for each strategy?"}
    options:
      - id: a
        text: ${over.a ?? "It is a best response to the others."}
        correct: true
      - id: b
        text: ${over.b ?? "It maximises the total payoff of everyone."}
        why: That describes a social optimum.
      - id: c
        text: ${over.c ?? "It strictly dominates every alternative."}
        why: Equilibrium strategies need not be dominant.
${over.extra ?? ""}    why: ${over.why ?? "No player gains by deviating alone."}
`;
}

export function truefalse(id = "agai-5d6e7f", statement = "Every finite game has a pure equilibrium.", answer = "false"): string {
  return `  - id: ${id}
    type: truefalse
    difficulty: medium
    level: understand
    topics: [Nash Equilibrium]
    statement: ${statement}
    answer: ${answer}
    why: Matching pennies has a mixed equilibrium and no pure one.
`;
}

export function multi(id = "agai-8g9h2j", correct = ["a", "b"]): string {
  const opt = (letter: string, text: string) =>
    correct.includes(letter)
      ? `      - id: ${letter}\n        text: ${text}\n        correct: true\n`
      : `      - id: ${letter}\n        text: ${text}\n        why: Not part of the definition.\n`;
  return `  - id: ${id}
    type: multi
    difficulty: medium
    level: understand
    topics: [Game Theory]
    prompt: Which properties does a normal-form game specify?
    options:
${opt("a", "The players")}${opt("b", "Each player's actions")}${opt("c", "The order of moves over time")}${opt("d", "The players' private histories")}    why: A normal-form game lists players, actions and payoffs, with simultaneous moves.
`;
}
