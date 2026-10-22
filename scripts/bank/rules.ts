// Content rules on schema-valid items: the "Checked by the script" list in
// docs/research/questions-and-courses.md, beyond what the zod schema enforces.
import type { QuizItem } from "../../src/shared/question-schema";
import { QUESTIONS } from "../../src/shared/game/config";
import { countWords, firstSentence } from "./convert";
import type { Severity } from "./diagnostics";
import { headingAnchor } from "./vault";

/** Reports a problem at a path inside the item (relative to the item). */
export type Report = (severity: Severity, path: readonly PropertyKey[], message: string) => void;

export const LIMITS = {
  promptWords: 50,
  optionWords: 25,
  whyWords: 60,
  codeLines: 8,
  codeLineChars: 45,
  /** The key is a length giveaway when longer than the longest distractor by this factor. */
  keyLengthFactor: 1.25,
  /** Near-duplicate stems: word-set Jaccard similarity at or above this. */
  nearDuplicate: 0.8,
  nearDuplicateMinWords: 6,
} as const;

/** Writing rules for any displayed text. Em-dashes and emoji are checked per raw line, in check.ts. */
export function writingProblems(text: string): string[] {
  const out: string[] = [];
  const source = /\b(the lectures?|this lecture|the slides?|the deck|this note)\b/i.exec(text);
  if (source) {
    out.push(`Says "${source[0]}": questions are played mixed across the course, so name the idea instead`);
  }
  const position =
    /\b(?:the|see|as|shown|listed|mentioned|given|described|stated|options?|code|snippet|example|table|figure|question|statement)\s+(?:above|below)\b/i.exec(
      text,
    ) ?? /\b(?:above|below)\s+(?:options?|code|snippet|example|list|statements?|questions?|answers?)\b/i.exec(text);
  if (position) out.push(`Says "${position[0]}": options are shuffled and nothing is above or below in the game`);
  return out;
}

const ABSOLUTE = /\b(always|never|only|all|none|completely)\b/i;
const STOP = new Set(
  "about above after again against along also among another because before being below between both cannot could does doing during each either every first from further have having here into itself just least less more most much must neither other others over same should since some such than that their them then there these they this those through under until very what when where which while whom whose with within without would your".split(
    " ",
  ),
);

function stem(word: string): string {
  return word.replace(/(ing|ed|es|s)$/, "");
}

export function contentWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of stripCode(text).toLowerCase().match(/[a-z][a-z-]{4,}/g) ?? []) if (!STOP.has(w)) out.add(stem(w));
  return out;
}

/** Text without fenced code blocks and inline code spans. */
export function stripCode(text: string): string {
  return text.replace(/```[\s\S]*?(```|$)/g, " ").replace(/`[^`\n]*`/g, " ");
}

/** Lines of code: fenced blocks in markdown text. */
export function fencedCodeLines(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) out.push(...m[1]!.replace(/\n$/, "").split("\n"));
  return out;
}

function codeProblems(lines: string[]): string | null {
  const long = lines.filter((l) => l.length > LIMITS.codeLineChars).length;
  const parts: string[] = [];
  if (lines.length > LIMITS.codeLines) parts.push(`${lines.length} lines (keep it to ${LIMITS.codeLines})`);
  if (long > 0) parts.push(`${long} line(s) over ${LIMITS.codeLineChars} characters`);
  return parts.length ? `Code is too big for a phone: ${parts.join(", ")}` : null;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[*_`"'.,;:!?()[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Option texts that refer to other options or to the option set. */
export function optionReferenceProblem(text: string, optionIds: string[]): string | null {
  const t = norm(text);
  if (/\b(all|none|any|both|neither|either) of (the )?(above|below|these|those|them|the options|the others|the answers)\b/.test(t)) {
    return `Option "${text.trim()}" refers to the option set; write a real answer instead`;
  }
  if (/^(both|neither|all|none)( (are|is) (correct|true|right|wrong|false))?$/.test(t)) {
    return `Option "${text.trim()}" refers to other options; write a real answer instead`;
  }
  const letters = optionIds.filter((id) => /^[a-z]$/.test(id)).join("");
  if (letters) {
    const L = `[${letters}]`;
    const listOnly = new RegExp(`^(both |only |neither |either )?(options? )?${L}( ?(and|or|nor|&) (options? )?${L})*( only)?$`);
    const named = new RegExp(`\\boptions? ${L}\\b`);
    if (listOnly.test(t) || named.test(t)) {
      return `Option "${text.trim()}" names other options; options are shuffled and unlettered in the game`;
    }
  }
  return null;
}

const withCode = (item: QuizItem) => item.code !== undefined;

/** Item-level content rules. `note` is set when the file has a note and it exists. */
export function checkItem(
  item: QuizItem,
  report: Report,
  ctx: { note?: { anchors: Set<string>; headings: string[] } | null; hasNote: boolean; concepts: () => Set<string> },
): void {
  // Writing rules on every displayed text.
  const texts: [PropertyKey[], string][] = [[["why"], item.why]];
  if (item.type === "truefalse") texts.push([["statement"], item.statement]);
  else texts.push([["prompt"], item.prompt]);
  if (item.type === "single" || item.type === "multi" || item.type === "cloze") {
    item.options.forEach((o, i) => {
      texts.push([["options", i, "text"], o.text]);
      if (o.why) texts.push([["options", i, "why"], o.why]);
    });
  }
  if (item.type === "order") item.items.forEach((o, i) => texts.push([["items", i, "text"], o.text]));
  if (item.type === "match") {
    item.pairs.forEach((p, i) => texts.push([["pairs", i, "text"], p.text]));
    item.targets.forEach((t, i) => texts.push([["targets", i], t]));
  }
  const optionIds = "options" in item ? item.options.map((o) => o.id) : [];
  for (const [path, text] of texts) {
    // "All of the above" gets the option rule's message only.
    if (path[0] === "options" && path[2] === "text" && !withCode(item) && optionReferenceProblem(text, optionIds)) continue;
    for (const p of writingProblems(text)) report("error", path, p);
  }

  // Negation in the stem.
  const stemText = item.type === "truefalse" ? null : item.prompt;
  if (stemText) {
    const plain = stripCode(stemText);
    const unbolded = plain.replace(/\*\*(NOT|EXCEPT|LEAST)\*\*/g, "");
    const caps = /\b(NOT|EXCEPT|LEAST)\b/.exec(unbolded);
    if (caps) report("error", ["prompt"], `Write ${caps[1]} in bold: **${caps[1]}**`);
    const lower = /\b(?:[Ww]hich|[Ww]hat)\b[^?]*?\b(not|except|least)\b/.exec(plain.replace(/\bat least\b|\bnot only\b|\bleast squares\b/gi, ""));
    if (lower) {
      report("warning", ["prompt"], `Negative stem "${lower[1]}": write **${lower[1]!.toUpperCase()}** (capitalised and bold), or rephrase positively`);
    }
  }

  // Lengths.
  if (stemText !== null) {
    const words = countWords(stripCode(stemText));
    if (words > LIMITS.promptWords) report("warning", ["prompt"], `Prompt is ${words} words; keep it under about ${LIMITS.promptWords}`);
    const code = codeProblems(fencedCodeLines(stemText));
    if (code) report("warning", ["prompt"], code);
  } else if (item.type === "truefalse") {
    const words = countWords(item.statement);
    if (words > LIMITS.promptWords) report("warning", ["statement"], `Statement is ${words} words; keep it under about ${LIMITS.promptWords}`);
  }
  const whyWords = countWords(item.why);
  if (whyWords > LIMITS.whyWords) report("warning", ["why"], `why is ${whyWords} words; keep it to about ${LIMITS.whyWords}`);
  const firstWords = countWords(firstSentence(item.why));
  if (firstWords > QUESTIONS.whyShortMaxWords) {
    report("warning", ["why"], `The first sentence of why is ${firstWords} words; the reveal line shows only the first ${QUESTIONS.whyShortMaxWords}`);
  }

  if (item.type === "cloze" && /\b(a|an)\s+_{3,}/i.test(item.prompt)) {
    report("warning", ["prompt"], `"a ___" or "an ___" gives the answer's first sound away; put the article inside each option`);
  }

  if (item.difficulty === "hard" && (item.level === "remember" || item.level === "understand")) {
    report("warning", ["level"], `A hard item should be hard because of reasoning: level apply or analyze, not ${item.level}`);
  }

  if (item.type === "single" || item.type === "multi" || item.type === "cloze") checkOptions(item, report);

  // Section and topics resolve against the note.
  if (ctx.hasNote && ctx.note) {
    if (item.section && !ctx.note.anchors.has(headingAnchor(item.section))) {
      report("error", ["section"], `section "${item.section}" is not a heading in the note`);
    }
    const concepts = ctx.concepts();
    const headings = new Set(ctx.note.headings.map((h) => h.toLowerCase()));
    item.topics.forEach((t, i) => {
      const k = t.trim().toLowerCase();
      if (!concepts.has(k) && !headings.has(k)) {
        report("error", ["topics", i], `topic "${t}" is neither a concept note (Concepts/) nor a heading in the note`);
      }
    });
  } else if (!ctx.hasNote && item.section) {
    report("warning", ["section"], "section is ignored: the file has no note");
  }
}

function checkOptions(item: Extract<QuizItem, { options: unknown }>, report: Report): void {
  const ids = item.options.map((o) => o.id);
  const seen = new Map<string, number>();
  item.options.forEach((o, i) => {
    const key = norm(o.text);
    const prev = seen.get(key);
    if (prev !== undefined) report("error", ["options", i, "text"], `Same text as option "${item.options[prev]!.id}": the key is ambiguous`);
    else seen.set(key, i);
    if (!withCode(item)) {
      const ref = optionReferenceProblem(o.text, ids);
      if (ref) report("error", ["options", i, "text"], ref);
      const words = countWords(o.text);
      if (words > LIMITS.optionWords) report("warning", ["options", i, "text"], `Option is ${words} words; keep it under about ${LIMITS.optionWords}`);
    } else {
      const code = codeProblems(o.text.replace(/\n+$/, "").split("\n"));
      if (code) report("warning", ["options", i, "text"], code);
    }
    if (o.correct === true && o.why) {
      report("warning", ["options", i, "why"], "A why on the correct option is never shown; put it in the item's why");
    }
  });
  if (withCode(item)) return;

  const correct = item.options.filter((o) => o.correct === true);
  const wrong = item.options.filter((o) => o.correct !== true);

  if (item.type !== "multi" && correct.length === 1) {
    const key = correct[0]!;
    const longest = Math.max(...wrong.map((o) => o.text.trim().length));
    if (key.text.trim().length > longest * LIMITS.keyLengthFactor) {
      const idx = item.options.indexOf(key);
      report("warning", ["options", idx, "text"], "The key is much longer than every distractor (a length cue); trim it or lengthen the distractors");
    }
    // Clang association: a distinctive stem word only the key repeats.
    const stemWords = contentWords(item.prompt);
    const keyWords = contentWords(key.text);
    const wrongWords = new Set(wrong.flatMap((o) => [...contentWords(o.text)]));
    const clang = [...keyWords].filter((w) => stemWords.has(w) && !wrongWords.has(w));
    if (clang.length > 0) {
      const idx = item.options.indexOf(key);
      report("warning", ["options", idx, "text"], `The key repeats "${clang[0]}" from the prompt and no distractor does (a word-match cue)`);
    }
  }

  // Absolute words on one side only.
  const abs = (o: { text: string }) => ABSOLUTE.test(o.text);
  const correctAbs = correct.filter(abs).length;
  const wrongAbs = wrong.filter(abs).length;
  if (correctAbs === 0 && wrongAbs >= 2) {
    report("warning", ["options"], "Absolute words (always, never, only, all, none, completely) appear only in distractors, which flags them as wrong");
  } else if (correctAbs > 0 && wrongAbs === 0) {
    report("warning", ["options"], "Absolute words (always, never, only, all, none, completely) appear only in the key, which flags it");
  }
}
