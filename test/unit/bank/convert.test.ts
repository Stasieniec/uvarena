import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  answerKey,
  chance,
  contentHash,
  defaultSort,
  fingerprint,
  firstSentence,
  itemNoteUrl,
  toBankItem,
  whyShort,
} from "../../../scripts/bank/convert";
import { headingAnchor, noteHeadings, noteSlug } from "../../../scripts/bank/vault";
import { BankFileSchema, BankItemSchema, QuizItemSchema, type QuizItem } from "../../../src/shared/question-schema";
import { agaiHeader, multi, single, truefalse } from "./helpers";

const item = (yaml: string): QuizItem => QuizItemSchema.parse((parse(agaiHeader() + yaml) as { questions: unknown[] }).questions[0]);
const header = { course: "AGAI", lecture: "AGAI-starter-games", title: "Games" };

const order = item(`  - id: agai-2a3b4c
    type: order
    difficulty: medium
    level: understand
    topics: [ReAct]
    prompt: Put the ReAct loop in order.
    items:
      - {id: a, text: Thought}
      - {id: b, text: Action}
      - {id: c, text: Observation}
    why: Reasoning, then acting, then reading the result.
`);
const match = item(`  - id: agai-3b4c5d
    type: match
    difficulty: medium
    level: understand
    topics: [Games]
    prompt: Match each game to its property.
    targets: [Dominant strategy, No pure equilibrium]
    pairs:
      - {id: a, text: "Prisoner's dilemma", target: Dominant strategy}
      - {id: b, text: Matching pennies, target: No pure equilibrium}
      - {id: c, text: Rock paper scissors, target: No pure equilibrium}
    why: Defecting dominates; the other two cycle.
`);

describe("convert", () => {
  it("builds the key for every type", () => {
    expect(answerKey(item(single()))).toEqual({ kind: "options", ids: ["a"] });
    expect(answerKey(item(multi("agai-8g9h2j", ["a", "c"])))).toEqual({ kind: "options", ids: ["a", "c"] });
    expect(answerKey(item(truefalse()))).toEqual({ kind: "bool", value: false });
    expect(answerKey(order)).toEqual({ kind: "order", ids: ["a", "b", "c"] });
    expect(answerKey(match)).toEqual({ kind: "match", map: { a: "t1", b: "t2", c: "t2" } });
  });

  it("computes chance per type", () => {
    expect(chance(item(single()))).toBeCloseTo(1 / 3);
    expect(chance(item(multi()))).toBeCloseTo(1 / 15);
    expect(chance(item(truefalse()))).toBe(0.5);
    expect(chance(order)).toBeCloseTo(1 / 6);
    expect(chance(match)).toBeCloseTo(1 / 8);
  });

  it("keeps the fingerprint on text edits and changes it when the meaning changes", () => {
    const base = fingerprint(item(single()));
    expect(fingerprint(item(single("agai-2a3b4c", { a: "Reworded key.", prompt: "Reworded prompt?", why: "New why." })))).toBe(base);
    expect(contentHash(item(single("agai-2a3b4c", { a: "Reworded key." })))).not.toBe(contentHash(item(single())));
    const moved = single()
      .replace("        correct: true\n", "        why: Moved.\n")
      .replace("        why: That describes a social optimum.\n", "        correct: true\n");
    expect(fingerprint(item(moved))).not.toBe(base);
    expect(fingerprint(item(single().replace("- id: c", "- id: d")))).not.toBe(base);
    expect(fingerprint(item(truefalse()))).not.toBe(fingerprint(item(truefalse("agai-5d6e7f", "x", "true"))));
  });

  it("uses the same fingerprint shape as the fixture bank", () => {
    const fixture = BankFileSchema.parse(JSON.parse(readFileSync(new URL("../../fixtures/questions.json", import.meta.url), "utf8")));
    const q = fixture.questions.find((x) => x.type === "single")!;
    const yaml = `  - id: ${q.id}
    type: single
    difficulty: ${q.difficulty}
    level: ${q.level}
    topics: [x]
    prompt: p
    options:
${q.options.map((o) => `      - id: ${o.id}\n        text: t\n${q.key.kind === "options" && q.key.ids.includes(o.id) ? "        correct: true\n" : "        why: w\n"}`).join("")}    why: w
`;
    expect(fingerprint(item(yaml))).toBe(q.fingerprint);
  });

  it("takes the first sentence of why for the reveal line, past abbreviations, cut at 25 words", () => {
    expect(firstSentence("Spark waits, e.g. for count. Then it runs.")).toBe("Spark waits, e.g. for count.");
    expect(firstSentence("Version 2.5 is fine. Yes.")).toBe("Version 2.5 is fine.");
    expect(whyShort("Short one. Second.")).toBe("Short one.");
    const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ") + ".";
    const cut = whyShort(long);
    expect(cut.split(" ")).toHaveLength(25);
    expect(cut.endsWith("...")).toBe(true);
  });

  it("builds note URLs with the site's slug and heading anchors", () => {
    expect(noteSlug("EPRM-W05 - Telemetry and CI-CD")).toBe("EPRM-W05---Telemetry-and-CI-CD");
    expect(headingAnchor("PhilSci-L01: Introduction and Logical Empiricism")).toBe("philsci-l01-introduction-and-logical-empiricism");
    expect(headingAnchor("What separates science from everything else?")).toBe("what-separates-science-from-everything-else");
    expect(itemNoteUrl("https://notes.example", "EPRM", "EPRM-W02 - Distributed Data", "Spark evaluates lazily")).toBe(
      "https://notes.example/Courses/EPRM/Lectures/EPRM-W02---Distributed-Data#spark-evaluates-lazily",
    );
    expect(itemNoteUrl("https://notes.example", "EPRM", undefined, "x")).toBeNull();
  });

  it("reads headings outside code fences only", () => {
    expect(noteHeadings("# A\n```\n# B\n```\n## C [[D|d]] `e`\n")).toEqual(["A", "C d e"]);
  });

  it("sorts numbered lectures by number and starters after them", () => {
    expect(defaultSort("AGAI-L05")).toBe(5);
    expect(defaultSort("EPRM-W02")).toBe(2);
    expect(defaultSort("AGAI-starter-games")).toBe(1000);
  });

  it("produces bank items that match the bank schema", () => {
    for (const q of [item(single()), item(multi()), item(truefalse()), order, match]) {
      const b = toBankItem(q, header, "docs/quiz/AGAI/AGAI-starter-games.quiz.yaml", "https://notes.example");
      expect(BankItemSchema.parse(b)).toEqual(b);
    }
    const s = toBankItem(item(single()), header, "src", "https://n");
    expect(s.optionWhy).toEqual({ b: "That describes a social optimum.", c: "Equilibrium strategies need not be dominant." });
    expect(s.startRating).toBe(1300);
    expect(s.words).toBe(9 + 8 + 7 + 5);
    const m = toBankItem(match, header, "src", "https://n");
    expect(m.targets).toEqual([
      { id: "t1", text: "Dominant strategy" },
      { id: "t2", text: "No pure equilibrium" },
    ]);
    expect(toBankItem(item(truefalse()), header, "src", "https://n").options).toEqual([]);
  });

  it("refuses to convert unassigned ids and drafts", () => {
    expect(() => toBankItem(item(single("new")), header, "src", "https://n")).toThrow(/no id/);
    expect(() => toBankItem(item(single("agai-2a3b4c", { extra: "    status: draft\n" })), header, "src", "https://n")).toThrow(/draft/);
  });
});
