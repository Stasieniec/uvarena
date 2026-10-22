// Question bank formats.
//
// 1. The vault YAML file (`docs/quiz/<COURSE>/<lecture>.quiz.yaml` in
//    university-vault), written by people and LLMs: QuizFileSchema.
// 2. The exported JSON bank (`bank/bank.json`, generated, gitignored), read by
//    the importer and by test mode: BankFileSchema. test/fixtures/questions.json
//    uses the same format.
// 3. The fingerprint file (`bank/fingerprints.json`, committed): FingerprintsSchema.
//
// The schemas here enforce structure: required fields, enums, no unknown
// fields, option counts and correct-option counts, a `why` on every wrong
// option, unique ids inside an item, match targets. Content checks (house
// writing rules, length cues, note and section existence, fingerprints) are
// the bank tool's `check` (scripts/bank/).
//
// The YAML must be parsed with the YAML 1.2 core schema, so `no` stays a
// string and type errors surface here as errors.

import { z } from "zod";
import { BLOOM_LEVELS, DIFFICULTIES, QUESTION_TYPES } from "./game/types";
import { AnswerSchema, OptionSchema } from "./protocol";

// ---------------------------------------------------------------------------
// Vault YAML
// ---------------------------------------------------------------------------

/** Course folder codes. Lowercased, they are the course ids in D1. */
export const COURSE_CODES = ["AGAI", "EPRM"] as const;
export const CourseCodeSchema = z.enum(COURSE_CODES);

/** `new` before the tool assigns one, then `<course>-<6 chars>`. Never edited or reused. */
export const QUESTION_ID_PATTERN = /^[a-z0-9]{2,16}-[23456789abcdefghjkmnpqrstuvwxyz]{6}$/;
export const ItemIdSchema = z.union([z.literal("new"), z.string().regex(QUESTION_ID_PATTERN)]);

/** Option, item and pair ids inside one question: short stable letters such as `a`, `b`. */
export const LocalIdSchema = z.string().regex(/^[a-z0-9]{1,8}$/, "Use short lowercase ids such as a, b, c");

const nonEmpty = z.string().trim().min(1);

export const ItemStatusSchema = z.enum(["active", "draft", "retired"]);
export const DifficultySchema = z.enum(DIFFICULTIES);
export const BloomLevelSchema = z.enum(BLOOM_LEVELS);

/** single, multi and cloze options. `correct` defaults to false; `why` is required on wrong options. */
export const YamlOptionSchema = z.strictObject({
  id: LocalIdSchema,
  text: nonEmpty,
  correct: z.boolean().optional(),
  why: nonEmpty.optional(),
});

export const YamlOrderItemSchema = z.strictObject({ id: LocalIdSchema, text: nonEmpty });
export const YamlMatchPairSchema = z.strictObject({ id: LocalIdSchema, text: nonEmpty, target: nonEmpty });

/** Fields every item has. */
const itemBase = {
  id: ItemIdSchema,
  rev: z.number().int().min(1).optional(),
  status: ItemStatusSchema.optional(),
  difficulty: DifficultySchema,
  level: BloomLevelSchema,
  topics: z.array(nonEmpty).min(1),
  /** Heading in the file's note; required when the file has a `note`. */
  section: nonEmpty.optional(),
  /** Language of code in the prompt or options. */
  code: nonEmpty.optional(),
  /** Explanation, at most about 60 words. Its first sentence (max 25 words) is the reveal line. */
  why: nonEmpty,
  /** Seconds; overrides the derived timer. */
  time: z.number().int().min(5).max(120).optional(),
};

export const YamlSingleSchema = z.strictObject({
  ...itemBase,
  type: z.literal("single"),
  prompt: nonEmpty,
  options: z.array(YamlOptionSchema).min(3).max(5),
  shuffle: z.boolean().optional(),
});

export const YamlClozeSchema = z.strictObject({
  ...itemBase,
  type: z.literal("cloze"),
  /** Contains the blank as ___ (three or more underscores). */
  prompt: nonEmpty.regex(/_{3,}/, "A cloze prompt needs a ___ blank"),
  options: z.array(YamlOptionSchema).min(3).max(5),
  shuffle: z.boolean().optional(),
});

export const YamlMultiSchema = z.strictObject({
  ...itemBase,
  type: z.literal("multi"),
  prompt: nonEmpty,
  options: z.array(YamlOptionSchema).min(4).max(6),
  shuffle: z.boolean().optional(),
});

export const YamlTrueFalseSchema = z.strictObject({
  ...itemBase,
  type: z.literal("truefalse"),
  statement: nonEmpty,
  answer: z.boolean(),
});

export const YamlOrderSchema = z.strictObject({
  ...itemBase,
  type: z.literal("order"),
  prompt: nonEmpty,
  /** Written in the correct order; the game shuffles. */
  items: z.array(YamlOrderItemSchema).min(3).max(6),
});

export const YamlMatchSchema = z.strictObject({
  ...itemBase,
  type: z.literal("match"),
  prompt: nonEmpty,
  targets: z.array(nonEmpty).min(2).max(4),
  pairs: z.array(YamlMatchPairSchema).min(3).max(5),
});

function uniqueIds(ids: string[]): string | null {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return null;
}

export const QuizItemSchema = z
  .discriminatedUnion("type", [
    YamlSingleSchema,
    YamlClozeSchema,
    YamlMultiSchema,
    YamlTrueFalseSchema,
    YamlOrderSchema,
    YamlMatchSchema,
  ])
  .superRefine((item, ctx) => {
    if (item.type === "single" || item.type === "cloze" || item.type === "multi") {
      const dup = uniqueIds(item.options.map((o) => o.id));
      if (dup) ctx.addIssue({ code: "custom", path: ["options"], message: `Duplicate option id "${dup}"` });
      const correct = item.options.filter((o) => o.correct === true).length;
      if (item.type === "multi") {
        if (correct < 1 || correct > item.options.length - 1)
          ctx.addIssue({ code: "custom", path: ["options"], message: "multi needs between 1 and k-1 correct options" });
      } else if (correct !== 1) {
        ctx.addIssue({ code: "custom", path: ["options"], message: `${item.type} needs exactly one correct option` });
      }
      item.options.forEach((o, i) => {
        if (o.correct !== true && !o.why)
          ctx.addIssue({ code: "custom", path: ["options", i, "why"], message: "Every wrong option needs a why" });
      });
    }
    if (item.type === "order") {
      const dup = uniqueIds(item.items.map((o) => o.id));
      if (dup) ctx.addIssue({ code: "custom", path: ["items"], message: `Duplicate item id "${dup}"` });
    }
    if (item.type === "match") {
      const dup = uniqueIds(item.pairs.map((o) => o.id));
      if (dup) ctx.addIssue({ code: "custom", path: ["pairs"], message: `Duplicate pair id "${dup}"` });
      const dupTarget = uniqueIds(item.targets);
      if (dupTarget) ctx.addIssue({ code: "custom", path: ["targets"], message: `Duplicate target "${dupTarget}"` });
      item.pairs.forEach((p, i) => {
        if (!item.targets.includes(p.target))
          ctx.addIssue({ code: "custom", path: ["pairs", i, "target"], message: `Unknown target "${p.target}"` });
      });
      for (const t of item.targets) {
        if (!item.pairs.some((p) => p.target === t))
          ctx.addIssue({ code: "custom", path: ["targets"], message: `Target "${t}" is not used by any pair` });
      }
    }
  });

export const QuizFileSchema = z
  .strictObject({
    course: CourseCodeSchema,
    /** Equals the file stem without `.quiz`, e.g. `AGAI-L05`. Becomes the lecture id. */
    lecture: z.string().regex(/^[A-Za-z0-9_.-]+$/),
    /** Shown in the lecture filter, e.g. "L05 LLM agents and ReAct". */
    title: nonEmpty,
    sort: z.number().int().optional(),
    /** Vault note filename stem; must exist when given. Starter files have none. */
    note: nonEmpty.optional(),
    questions: z.array(QuizItemSchema).min(1),
  })
  .superRefine((file, ctx) => {
    if (!file.lecture.startsWith(`${file.course}-`))
      ctx.addIssue({ code: "custom", path: ["lecture"], message: `lecture must start with "${file.course}-"` });
    file.questions.forEach((q, i) => {
      if (file.note && !q.section)
        ctx.addIssue({ code: "custom", path: ["questions", i, "section"], message: "section is required when the file has a note" });
      if (q.id !== "new" && !q.id.startsWith(`${file.course.toLowerCase()}-`))
        ctx.addIssue({ code: "custom", path: ["questions", i, "id"], message: `id must start with "${file.course.toLowerCase()}-"` });
    });
  });

export type QuizItem = z.infer<typeof QuizItemSchema>;
export type QuizFile = z.infer<typeof QuizFileSchema>;

// ---------------------------------------------------------------------------
// Exported JSON bank (bank/bank.json, test/fixtures/questions.json)
// ---------------------------------------------------------------------------
//
// Conversion rules from YAML (the export owns them; listed here so the
// importer, the seed and the tests agree):
// - courseId = course.toLowerCase(); lectureId = lecture.
// - options: single, multi, cloze: [{id, text}]; order: the items in YAML
//   (correct) order; match: the pairs as items. truefalse: [].
// - targets (match only): [{id: "t1", text}, {id: "t2", ...}] in YAML order.
// - key: single and cloze {kind: "options", ids: [correct]}; multi the correct
//   set in option order; truefalse {kind: "bool"}; order {kind: "order", ids
//   in YAML order}; match {kind: "match", map: pair id -> target id}.
// - optionWhy: {optionId: why} for every wrong option (single, multi, cloze).
// - whyShort: first sentence of why, at most QUESTIONS.whyShortMaxWords words.
// - startRating from QUESTIONS.startRating by difficulty.
// - words: word count of prompt or statement plus all option, item, pair and
//   target texts.
// - chance: single and cloze 1/k; truefalse 0.5; multi 1/(2^k - 1); order
//   1/n!; match 1/targets^pairs.
// - noteUrl: NOTES_URL + "/Courses/<COURSE>/Lectures/" + slug(note) + "#" +
//   anchor(section), or null without a note.

export const BankLectureSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  title: z.string(),
  sort: z.number().int(),
  noteUrl: z.string().nullable(),
});

export const BankItemSchema = z.object({
  id: z.string().regex(QUESTION_ID_PATTERN),
  rev: z.number().int().min(1),
  status: z.enum(["active", "retired"]),
  courseId: z.string(),
  lectureId: z.string(),
  type: z.enum(QUESTION_TYPES),
  difficulty: DifficultySchema,
  level: BloomLevelSchema,
  topics: z.array(z.string()),
  prompt: z.string().nullable(),
  statement: z.string().nullable(),
  codeLang: z.string().nullable(),
  options: z.array(OptionSchema),
  targets: z.array(OptionSchema).nullable(),
  key: AnswerSchema,
  shuffle: z.boolean(),
  why: z.string(),
  whyShort: z.string(),
  optionWhy: z.record(z.string(), z.string()),
  noteUrl: z.string().nullable(),
  timeS: z.number().int().nullable(),
  words: z.number().int().nonnegative(),
  chance: z.number().gt(0).lte(1),
  startRating: z.number(),
  /** sha256 of type, option ids and key. A change needs a rev bump. */
  fingerprint: z.string(),
  /** sha256 of all displayed text. */
  contentHash: z.string(),
  /** Vault-relative path of the YAML file. */
  sourcePath: z.string(),
});

export const BankFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.number().int(),
  /** `git rev-parse HEAD` of the vault; null for fixtures. */
  vaultCommit: z.string().nullable(),
  lectures: z.array(BankLectureSchema),
  questions: z.array(BankItemSchema),
});

export type BankLecture = z.infer<typeof BankLectureSchema>;
export type BankItem = z.infer<typeof BankItemSchema>;
export type BankFile = z.infer<typeof BankFileSchema>;

// ---------------------------------------------------------------------------
// bank/fingerprints.json
// ---------------------------------------------------------------------------

export const FingerprintsSchema = z.record(
  z.string().regex(QUESTION_ID_PATTERN),
  z.object({ rev: z.number().int().min(1), fingerprint: z.string() }),
);
export type Fingerprints = z.infer<typeof FingerprintsSchema>;
