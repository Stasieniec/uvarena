import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fingerprint } from "../../../scripts/bank/convert";
import { QuizItemSchema } from "../../../src/shared/question-schema";
import { parse } from "yaml";
import {
  AGAI_FILE,
  agaiHeader,
  check,
  EPRM_FILE,
  errors,
  makeVault,
  messages,
  multi,
  single,
  truefalse,
  warnings,
  writeIn,
} from "./helpers";

const clean = (body: string) => makeVault({ [AGAI_FILE]: agaiHeader() + body });

function expectError(vault: string, pattern: RegExp, line?: number) {
  const r = check(vault);
  const hit = errors(r).find((d) => pattern.test(d.message));
  expect(hit, `no error matching ${pattern}; got ${JSON.stringify(messages(r.diagnostics.list))}`).toBeTruthy();
  if (line !== undefined) expect(hit!.line).toBe(line);
  return r;
}

function expectWarning(vault: string, pattern: RegExp) {
  const r = check(vault);
  const hit = warnings(r).find((d) => pattern.test(d.message));
  expect(hit, `no warning matching ${pattern}; got ${JSON.stringify(messages(r.diagnostics.list))}`).toBeTruthy();
  expect(errors(r)).toEqual([]);
  return r;
}

describe("check: a clean bank", () => {
  it("passes with no errors and no warnings", () => {
    const r = check(clean(single() + truefalse() + multi()));
    expect(messages(r.diagnostics.list)).toEqual([]);
    expect(r.files).toHaveLength(1);
    expect(r.files[0]!.items.every((i) => i.item !== null)).toBe(true);
  });

  it("warns when there are no quiz files", () => {
    const r = check(makeVault({ "README.md": "x" }));
    expect(messages(warnings(r))).toEqual(["0: No quiz files found"]);
  });

  it("formats errors as path:line", () => {
    const vault = clean(single("agai-2a3b4c", { prompt: "What do the slides say?" }));
    const r = check(vault);
    const d = errors(r)[0]!;
    expect(d.file).toBe(join(vault, AGAI_FILE));
    expect(d.line).toBe(10);
    expect(d.where).toBe("question 1, agai-2a3b4c");
  });
});

describe("check: YAML and schema", () => {
  it("parses YAML 1.2 core, so no is a string and an error", () => {
    expectError(clean(truefalse("agai-5d6e7f", "Every game has one.", "no")), /answer: expected boolean, got the string "no" \(write true or false\)/, 11);
  });

  it("rejects duplicate keys", () => {
    expectError(clean(single().replace("    level: remember\n", "    level: remember\n    level: apply\n")), /YAML: .*unique/i);
  });

  it("reports YAML syntax errors with a line", () => {
    const r = expectError(clean(single() + "  - id: [unclosed\n"), /YAML/);
    expect(errors(r)[0]!.line).toBeGreaterThan(0);
  });

  it("reports unknown fields at their line, with the allowed fields", () => {
    expectError(clean(single("agai-2a3b4c", { extra: "    explanation: oops\n" })), /Unknown field "explanation" for a single question \(allowed: id, rev/, 21);
  });

  it("reports a missing field", () => {
    expectError(clean(single().replace("    difficulty: easy\n", "")), /Missing difficulty/);
  });

  it("reports a bad enum", () => {
    expectError(clean(single().replace("difficulty: easy", "difficulty: trivial")), /difficulty must be one of easy, medium, hard/, 7);
  });

  it("reports a bad type", () => {
    expectError(clean(single().replace("type: single", "type: singel")), /type must be one of/);
  });

  it("checks option counts per type", () => {
    const two = single().replace(/      - id: c\n.*\n.*\n/, "");
    expectError(clean(two), /A single question needs at least 3 options/);
    const sevenMulti = multi().replace("    why: A normal", "      - {id: e, text: E, why: w}\n      - {id: f, text: F, why: w}\n      - {id: g, text: G, why: w}\n    why: A normal");
    expectError(clean(sevenMulti), /A multi question needs at most 6 options/);
  });

  it("needs exactly one key for single and cloze", () => {
    expectError(clean(single().replace("        why: That describes a social optimum.\n", "        correct: true\n")), /single needs exactly one correct option/);
  });

  it("needs between 1 and k-1 correct options for multi", () => {
    expectError(clean(multi("agai-8g9h2j", ["a", "b", "c", "d"])), /multi needs between 1 and k-1 correct options/);
  });

  it("needs a why on every wrong option and on the item", () => {
    expectError(clean(single().replace("        why: That describes a social optimum.\n", "")), /Every wrong option needs a why/);
    expectError(clean(single().replace(/    why: No player.*\n/, "")), /Missing why/);
  });

  it("keeps checking other items when one is broken", () => {
    const r = check(clean(truefalse("agai-5d6e7f", "x", "no") + single("agai-2a3b4c", { prompt: "What do the slides say?" })));
    expect(messages(errors(r)).some((m) => /slides/.test(m))).toBe(true);
    expect(messages(errors(r)).some((m) => /boolean/.test(m))).toBe(true);
  });
});

describe("check: ids", () => {
  it("errors once per file on id: new and names the ids command", () => {
    const r = expectError(clean(single("new") + truefalse("new")), /2 question\(s\) still have id: new \(lines 5, 22\)\. Assign ids with: npx tsx .*quiz-bank\.ts ids --vault/);
    expect(errors(r)).toHaveLength(1);
  });

  it("errors on duplicate ids across files", () => {
    const vault = makeVault({
      [AGAI_FILE]: agaiHeader() + single("agai-2a3b4c"),
      "docs/quiz/AGAI/AGAI-starter-agents.quiz.yaml":
        "course: AGAI\nlecture: AGAI-starter-agents\ntitle: Agents\nquestions:\n" + truefalse("agai-2a3b4c"),
    });
    const r = check(vault);
    expect(errors(r).filter((d) => /Duplicate id agai-2a3b4c/.test(d.message))).toHaveLength(2);
  });

  it("errors on an id with another course's prefix", () => {
    expectError(clean(single("eprm-2a3b4c")), /id must start with "agai-"/);
  });

  it("rejects ids the tool could not have made", () => {
    expectError(clean(single("agai-q1")), /id must be "new" \(the tool assigns the real one\)/);
  });
});

describe("check: files, notes, sections, topics", () => {
  it("needs lecture to equal the file name", () => {
    expectError(makeVault({ [AGAI_FILE]: agaiHeader().replace("lecture: AGAI-starter-games", "lecture: AGAI-starter-game") + single() }), /lecture must equal the file name: "AGAI-starter-games"/, 2);
  });

  it("needs course to match the folder", () => {
    expectError(makeVault({ "docs/quiz/EPRM/AGAI-starter-games.quiz.yaml": agaiHeader() + single() }), /course is AGAI but the file is in the EPRM folder/);
  });

  it("skips YAML files that are not named .quiz.yaml", () => {
    const r = check(makeVault({ "docs/quiz/AGAI/notes.yaml": "a: 1\n" }));
    expect(messages(warnings(r))).toContain("0: Skipped: quiz files are named <lecture>.quiz.yaml");
    expect(errors(r)).toEqual([]);
  });

  const note = "---\ntype: lecture\n---\n# EPRM-W02: Distributed processing\n## Spark evaluates lazily\n```\n## not a heading\n```\n## Narrow and **wide** operations\n";
  const eprmItem = (section: string, topics: string) => `course: EPRM
lecture: EPRM-W02
title: W02 Distributed data processing
note: "EPRM-W02 - Distributed Data Processing"
questions:
  - id: eprm-2a3b4c
    type: truefalse
    difficulty: easy
    level: remember
    topics: [${topics}]
    section: "${section}"
    statement: Spark runs a transformation as soon as it is declared.
    answer: false
    why: Transformations wait for an action.
`;
  const withNote = (section: string, topics: string) =>
    makeVault({
      [EPRM_FILE]: eprmItem(section, topics),
      "Courses/EPRM/Lectures/EPRM-W02 - Distributed Data Processing.md": note,
      "Concepts/Lazy Evaluation.md": "---\naliases: [Laziness]\n---\n# Lazy Evaluation\n",
    });

  it("accepts a section that is a heading and topics that are concepts, aliases or headings", () => {
    const r = check(withNote("Spark evaluates lazily", "Lazy Evaluation, laziness, Narrow and wide operations"));
    expect(messages(r.diagnostics.list)).toEqual([]);
  });

  it("errors on a section that is not a heading (code blocks do not count)", () => {
    expectError(withNote("not a heading", "Lazy Evaluation"), /section "not a heading" is not a heading in the note/, 11);
  });

  it("errors on a topic that resolves to nothing", () => {
    expectError(withNote("Spark evaluates lazily", "Lazy Evaluation, Quantum Spark"), /topic "Quantum Spark" is neither a concept note/);
  });

  it("finds a note in Book Notes or Exercises as well as Lectures", () => {
    const r = check(
      makeVault({
        [EPRM_FILE]: eprmItem("Spark evaluates lazily", "Lazy Evaluation"),
        "Courses/EPRM/Book Notes/EPRM-W02 - Distributed Data Processing.md": note,
        "Concepts/Lazy Evaluation.md": "# Lazy Evaluation\n",
      }),
    );
    expect(messages(r.diagnostics.list)).toEqual([]);
    expect(r.files[0]!.header?.noteFolder).toBe("Book Notes");
  });

  it("errors on a missing note", () => {
    expectError(makeVault({ [EPRM_FILE]: eprmItem("x", "y") }), /note "EPRM-W02 - Distributed Data Processing" not found/, 4);
  });

  it("needs a section on every item when the file has a note", () => {
    const vault = withNote("Spark evaluates lazily", "Lazy Evaluation");
    writeIn(vault, EPRM_FILE, eprmItem("Spark evaluates lazily", "Lazy Evaluation").replace(/    section: .*\n/, ""));
    expectError(vault, /section is required when the file has a note/, 6);
  });
});

describe("check: writing rules", () => {
  it("errors on em-dashes and emoji anywhere, comments included", () => {
    expectError(clean(`  # good ${String.fromCharCode(0x2014)} bad\n` + single()), /Em-dash/, 5);
    expectError(clean(single("agai-2a3b4c", { why: "Nice \u{1F600}" })), /Emoji/, 21);
  });

  it("errors on talk about the source", () => {
    expectError(clean(single("agai-2a3b4c", { prompt: "What does this lecture call a best response?" })), /Says "this lecture"/);
    expectError(clean(single("agai-2a3b4c", { why: "As the slides show, nobody deviates." })), /Says "the slides"/);
  });

  it("errors on above and below as positions, not as ordinary words", () => {
    expectError(clean(single("agai-2a3b4c", { prompt: "Which of the options below is a best response?" })), /Says "options below"/);
    const r = check(clean(single("agai-2a3b4c", { b: "It keeps payoffs below the threshold." })));
    expect(errors(r)).toEqual([]);
  });

  it("errors on all of the above, both, and options that name other options", () => {
    expectError(clean(single("agai-2a3b4c", { c: "All of the above" })), /refers to the option set/);
    expectError(clean(single("agai-2a3b4c", { c: "Both" })), /refers to other options/);
    expectError(clean(single("agai-2a3b4c", { c: "A and B" })), /names other options/);
    expectError(clean(single("agai-2a3b4c", { c: "Same as option b" })), /names other options/);
  });

  it("does not mistake players named A and B for option references", () => {
    const r = check(clean(single("agai-2a3b4c", { c: "Player A defects while player B cooperates." })));
    expect(errors(r)).toEqual([]);
  });

  it("errors on two options with the same text", () => {
    expectError(clean(single("agai-2a3b4c", { c: "It maximises the total payoff of everyone." })), /Same text as option "b"/);
  });

  it("needs NOT, EXCEPT and LEAST in bold", () => {
    expectError(clean(single("agai-2a3b4c", { prompt: "Which is NOT true of an equilibrium?" })), /Write NOT in bold: \*\*NOT\*\*/);
    const ok = check(clean(single("agai-2a3b4c", { prompt: "Which is **NOT** true of a Nash equilibrium strategy?" })));
    expect(errors(ok)).toEqual([]);
    expectWarning(clean(single("agai-2a3b4c", { prompt: "Which is not true of a Nash equilibrium strategy?" })), /Negative stem "not"/);
    const atLeast = check(clean(single("agai-2a3b4c", { prompt: "Which game has at least one pure equilibrium?" })));
    expect(warnings(atLeast).filter((d) => /Negative stem/.test(d.message))).toEqual([]);
  });
});

describe("check: warnings", () => {
  it("warns when the key is much longer than every distractor", () => {
    expectWarning(clean(single("agai-2a3b4c", { a: "It is a best response to whatever the other players are doing at that point." })), /length cue/);
  });

  it("warns on absolute words in distractors only", () => {
    expectWarning(clean(single("agai-2a3b4c", { b: "It always maximises the total payoff.", c: "It never loses to any alternative." })), /appear only in distractors/);
  });

  it("warns on absolute words in the key only", () => {
    expectWarning(clean(single("agai-2a3b4c", { a: "It is always a best response." })), /appear only in the key/);
  });

  it("warns when only the key repeats a stem word", () => {
    expectWarning(clean(single("agai-2a3b4c", { prompt: "In a Nash equilibrium, what is each player's strategy?", a: "A best response to other players." })), /repeats "player"/);
  });

  it("warns on long prompts, options and explanations", () => {
    const long = Array.from({ length: 55 }, (_, i) => `word${i}`).join(" ");
    expectWarning(clean(single("agai-2a3b4c", { prompt: `${long}?` })), /Prompt is 55 words/);
    expectWarning(clean(single("agai-2a3b4c", { b: long.split(" ").slice(0, 30).join(" ") })), /Option is 30 words/);
    expectWarning(clean(single("agai-2a3b4c", { why: `${long}.` })), /why is 55 words/);
    expectWarning(clean(single("agai-2a3b4c", { why: `${long.split(" ").slice(0, 30).join(" ")}. Short.` })), /first sentence of why is 30 words/);
  });

  it("warns on code too big for a phone", () => {
    const code = `  - id: eprm-2a3b4c
    type: single
    code: python
    difficulty: medium
    level: apply
    topics: [Unit Testing]
    prompt: Which test is isolated?
    options:
      - id: a
        text: |
          def test_a():
              assert f(1) == 2
        correct: true
      - id: b
        text: |
          def test_b():
              assert f(get_value_from_the_real_network_service()) == 2
        why: It calls the network.
      - id: c
        text: |
          def test_c():
              assert True
        why: It checks nothing.
    why: Only the first is isolated and checks a value.
`;
    const vault = makeVault({ [EPRM_FILE]: "course: EPRM\nlecture: EPRM-W02\ntitle: W02\nquestions:\n" + code });
    expectWarning(vault, /Code is too big for a phone: 1 line\(s\) over 45 characters/);
  });

  it("warns on a cloze blank after a or an", () => {
    const cloze = `  - id: agai-2a3b4c
    type: cloze
    difficulty: easy
    level: remember
    topics: [Agents]
    prompt: An agent that maximises expected utility is called an ___ agent.
    options:
      - {id: a, text: rational, correct: true}
      - {id: b, text: reflex, why: A reflex agent maps percepts to actions.}
      - {id: c, text: learning, why: Learning is about improving over time.}
    why: Rationality means maximising expected utility.
`;
    expectWarning(clean(cloze), /gives the answer's first sound away/);
  });

  it("warns on hard items at a low level", () => {
    expectWarning(clean(single().replace("difficulty: easy", "difficulty: hard")), /level apply or analyze, not remember/);
  });

  it("errors on exact duplicates and warns on near-duplicates", () => {
    expectError(clean(single("agai-2a3b4c") + single("agai-3b4c5d")), /Duplicate of the question at docs\/quiz\/AGAI\/AGAI-starter-games\.quiz\.yaml:5/);
    expectWarning(clean(single("agai-2a3b4c") + single("agai-3b4c5d", { c: "Something else entirely here." })), /Same prompt as the question/);
    expectWarning(
      clean(
        single("agai-2a3b4c", { prompt: "Which property defines each player strategy in a mixed Nash equilibrium of a finite normal-form game?" }) +
          single("agai-3b4c5d", { prompt: "Which property defines every player strategy in a mixed Nash equilibrium of a finite normal-form game?", c: "Other." }),
      ),
      /Nearly the same prompt/,
    );
  });

  it("warns on per-file balance", () => {
    const tfs = Array.from({ length: 8 }, (_, i) => truefalse(`agai-${"23456789"[i]}aaaaa`, `Statement number ${"abcdefgh"[i]} about games holds.`)).join("");
    const r = check(clean(tfs));
    expect(errors(r)).toEqual([]);
    const w = messages(warnings(r));
    expect(w.some((m) => /100% of the questions are true\/false/.test(m))).toBe(true);
    expect(w.some((m) => /100% medium/.test(m))).toBe(true);
  });

  it("warns when every multi item has the same number of correct options", () => {
    expectWarning(clean(multi("agai-2a3b4c") + multi("agai-3b4c5d").replace("Which properties", "Which parts") + multi("agai-4c5d6e").replace("Which properties", "Which elements")), /every multi question has 2 correct option/);
  });

  it("turns rule errors into warnings for drafts", () => {
    const r = check(clean(single("agai-2a3b4c", { prompt: "What do the slides call it?", extra: "    status: draft\n" })));
    expect(errors(r)).toEqual([]);
    expect(messages(warnings(r)).some((m) => /the slides.*\(draft, so not blocking\)/.test(m))).toBe(true);
  });
});

describe("check: fingerprints", () => {
  const item = (yaml: string) => QuizItemSchema.parse((parse(agaiHeader() + yaml) as { questions: unknown[] }).questions[0]);

  function withFingerprints(body: string, fp: Record<string, { rev: number; fingerprint: string }>) {
    const vault = clean(body);
    writeFileSync(join(vault, "fingerprints.json"), JSON.stringify(fp));
    return vault;
  }

  it("accepts text edits with the same fingerprint", () => {
    const fp = { "agai-2a3b4c": { rev: 1, fingerprint: fingerprint(item(single())) } };
    const r = check(withFingerprints(single("agai-2a3b4c", { a: "It is a best reply to the others." }), fp));
    expect(errors(r)).toEqual([]);
  });

  it("errors when the key changes without a rev bump", () => {
    const fp = { "agai-2a3b4c": { rev: 1, fingerprint: fingerprint(item(single())) } };
    const moved = single()
      .replace("        correct: true\n", "        why: Moved.\n")
      .replace("        why: That describes a social optimum.\n", "        correct: true\n");
    expectError(withFingerprints(moved, fp), /meaning changed: set rev: 2/, 5);
    const bumped = moved.replace("    type: single\n", "    type: single\n    rev: 2\n");
    expect(errors(check(withFingerprints(bumped, fp)))).toEqual([]);
  });

  it("errors when rev goes down", () => {
    const fp = { "agai-2a3b4c": { rev: 3, fingerprint: fingerprint(item(single())) } };
    expectError(withFingerprints(single(), fp), /rev is 1 but 3 was already exported/);
  });

  it("errors when an exported id disappears, and accepts it retired", () => {
    const fp = { "agai-9z9z9z": { rev: 1, fingerprint: "x" }, "agai-2a3b4c": { rev: 1, fingerprint: fingerprint(item(single())) } };
    expectError(withFingerprints(single(), fp), /agai-9z9z9z was exported before but is no longer in the vault/);
    const retired = single().replace("    type: single\n", "    status: retired\n    type: single\n");
    expect(errors(check(withFingerprints(retired, { "agai-2a3b4c": fp["agai-2a3b4c"] })))).toEqual([]);
  });

  it("errors on a broken fingerprint file", () => {
    const vault = clean(single());
    writeFileSync(join(vault, "fingerprints.json"), "{ nope");
    expectError(vault, /Invalid fingerprint file/);
  });
});
