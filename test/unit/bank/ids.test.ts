import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assignIds, assignIdsInText, newId } from "../../../scripts/bank/ids";
import { QUESTION_ID_PATTERN } from "../../../src/shared/question-schema";
import { AGAI_FILE, agaiHeader, check, errors, makeVault, single, truefalse } from "./helpers";

const fileWithNew = `# Games, starter set
course: AGAI
lecture: AGAI-starter-games
title: Games
questions:

  # first one: keep this comment
  - id: new   # trailing comment stays
    type: truefalse
    difficulty: easy
    level: remember
    topics: [Nash Equilibrium]
    statement: >-
      Every finite game has a pure equilibrium.
    answer: false
    why: Matching pennies has none.

  - id: "new"
    type: single
    difficulty: easy
    level: remember
    topics: [Nash Equilibrium]
    prompt: In a Nash equilibrium, what holds for each strategy?
    options:
      - id: new
        text: It is a best response to the others.
        correct: true
      - {id: b, text: It maximises the total payoff of everyone., why: That is a social optimum.}
      - {id: c, text: It strictly dominates every alternative., why: Not needed.}
    why: No player gains by deviating alone.
`;

describe("ids", () => {
  it("replaces item-level id: new and nothing else, keeping comments and formatting", () => {
    const out = assignIdsInText(fileWithNew, new Set());
    if ("skip" in out) throw new Error(out.skip);
    expect(out.count).toBe(2);
    const before = fileWithNew.split("\n");
    const after = out.text.split("\n");
    expect(after).toHaveLength(before.length);
    const changed = before.map((l, i) => i).filter((i) => before[i] !== after[i]);
    expect(changed).toEqual([7, 17]);
    expect(after[7]).toMatch(/^ {2}- id: agai-[23456789abcdefghjkmnpqrstuvwxyz]{6} {3}# trailing comment stays$/);
    expect(after[17]).toMatch(/^ {2}- id: agai-[a-z0-9]{6}$/);
    // The option id "new" is an option id, not an item id.
    expect(out.text).toContain("      - id: new\n");
  });

  it("makes ids that match the schema pattern and avoids taken ones", () => {
    const taken = new Set(["agai-222222"]);
    const seq = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
    let i = 0;
    const id = newId("AGAI", taken, () => seq[i++]!);
    expect(id).toBe("agai-333333");
    expect(QUESTION_ID_PATTERN.test(id)).toBe(true);
    expect(taken.has("agai-333333")).toBe(true);
  });

  it("assigns unique ids across the vault and the fingerprint file, and the result passes check", () => {
    const vault = makeVault({
      [AGAI_FILE]: agaiHeader() + single("new") + truefalse("new"),
      "docs/quiz/EPRM/EPRM-W01.quiz.yaml": `course: EPRM\nlecture: EPRM-W01\ntitle: W01\nquestions:\n${truefalse("new", "Unit tests should call the real network.")}`,
    });
    const fp = join(vault, "fingerprints.json");
    writeFileSync(fp, JSON.stringify({ "agai-zzzzzz": { rev: 1, fingerprint: "x" } }));
    // A generator that would hit the fingerprint id first.
    const result = assignIds(vault, fp);
    expect(result.assigned.map((a) => a.count).sort()).toEqual([1, 2]);
    const ids = [...readFileSync(join(vault, AGAI_FILE), "utf8").matchAll(/^ {2}- id: (\S+)/gm)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => id!.startsWith("agai-"))).toBe(true);
    expect(readFileSync(join(vault, "docs/quiz/EPRM/EPRM-W01.quiz.yaml"), "utf8")).toMatch(/- id: eprm-[a-z0-9]{6}/);
    expect(errors(check(vault, fp)).filter((d) => !/exported before/.test(d.message))).toEqual([]);
  });

  it("never reuses an id from the fingerprint file", () => {
    const vault = makeVault({ [AGAI_FILE]: agaiHeader() + single("new") });
    const fp = join(vault, "fingerprints.json");
    writeFileSync(fp, JSON.stringify({ "agai-222222": { rev: 1, fingerprint: "x" } }));
    const rolls = [0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2];
    let i = 0;
    assignIds(vault, fp, () => rolls[i++]!);
    expect(readFileSync(join(vault, AGAI_FILE), "utf8")).toContain("- id: agai-444444");
  });

  it("is stable: a second run and later text edits keep every id", () => {
    const vault = makeVault({ [AGAI_FILE]: agaiHeader() + single("new") + truefalse("new") });
    const fp = join(vault, "fingerprints.json");
    assignIds(vault, fp);
    const first = readFileSync(join(vault, AGAI_FILE), "utf8");
    expect(assignIds(vault, fp).assigned).toEqual([]);
    expect(readFileSync(join(vault, AGAI_FILE), "utf8")).toBe(first);
    const edited = first.replace("what holds for each strategy", "what is true of each strategy");
    writeFileSync(join(vault, AGAI_FILE), edited + truefalse("new", "Another statement about mixed strategies."));
    assignIds(vault, fp);
    const after = readFileSync(join(vault, AGAI_FILE), "utf8");
    const ids = (s: string) => [...s.matchAll(/^ {2}- id: (\S+)/gm)].map((m) => m[1]);
    expect(ids(after).slice(0, 2)).toEqual(ids(first));
    expect(ids(after)[2]).toMatch(/^agai-/);
  });

  it("skips files that do not parse and reports them", () => {
    const vault = makeVault({ [AGAI_FILE]: agaiHeader() + "  - id: new\n    type: [oops\n" });
    const result = assignIds(vault, join(vault, "fingerprints.json"));
    expect(result.assigned).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toMatch(/YAML does not parse/);
  });
});
