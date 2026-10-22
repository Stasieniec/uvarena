// Stopgap for a protocol gap: QuestionMessageSchema extends QuestionViewSchema,
// so the message's `type: "question"` overwrites the question type, and the
// live `question` frame does not say whether it is single choice or multiple
// select. (The snapshot's `question.type` is intact.) Until the protocol
// carries the question type in its own field, the type is inferred:
//   no options                        -> truefalse
//   a ___ blank in the prompt         -> cloze
//   timer matches multi's timer       -> multi (base timer plus reading bonus,
//                                        at time scale 1 or the test scale)
//   otherwise                         -> single
// Item timer overrides can fool the last rule. Pure, tested in Node.

import { READING_BONUS, TEST_MODE, TIMER_MS_BY_TYPE, scaleMs } from "@shared/game/config";
import type { QuestionType } from "@shared/game/types";

interface QuestionLike {
  prompt: string | null;
  statement: string | null;
  options: { text: string }[];
  timerMs: number;
}

function words(s: string | null): number {
  return s ? (s.match(/\S+/g)?.length ?? 0) : 0;
}

export function readingBonusMs(wordCount: number): number {
  const extra = Math.max(0, wordCount - READING_BONUS.freeWords);
  return Math.min(READING_BONUS.maxMs, Math.ceil(extra / READING_BONUS.wordsPerStep) * READING_BONUS.msPerStep);
}

export function inferQuestionType(q: QuestionLike): QuestionType {
  if (q.options.length === 0) return "truefalse";
  if (q.prompt && /_{3,}/.test(q.prompt)) return "cloze";
  const count = words(q.prompt ?? q.statement) + q.options.reduce((n, o) => n + words(o.text), 0);
  const bonus = readingBonusMs(count);
  const near = (type: QuestionType, scale: number) => {
    // Word counts can differ a little from the importer's, so allow one bonus step either way.
    const tolerance = scaleMs(READING_BONUS.msPerStep, scale);
    return Math.abs(scaleMs(TIMER_MS_BY_TYPE[type] + bonus, scale) - q.timerMs) <= tolerance;
  };
  for (const scale of [1, TEST_MODE.timeScale]) {
    const multi = near("multi", scale);
    const single = near("single", scale);
    if (multi && !single) return "multi";
    if (single) return "single";
  }
  return "single";
}
