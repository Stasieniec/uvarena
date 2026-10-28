// The question, set directly above the options as one block (no card), and
// the reveal's teaching lines under the answers.

import type { QuestionView, RevealPayload } from "@shared/protocol";
import { LINES } from "../copy";
import type { MatchUiState } from "../state";
import { FlagIcon } from "./icons";
import { InlineText, Prompt } from "./Prompt";

/** Prompt length from which the question text steps down a size, so long prompts leave room for the answers. */
const LONG_PROMPT = 150;
const VERY_LONG_PROMPT = 260;

export function QuestionPrompt({ state, question }: { state: MatchUiState; question: QuestionView }) {
  const reveal = state.phase === "reveal" ? state.reveal : null;
  const fill = clozeFill(question, state, reveal);
  const isTf = question.type === "truefalse";
  const text = (isTf ? question.statement : question.prompt) ?? "";
  const optionChars = question.options.reduce((n, o) => n + o.text.length, 0);
  // A crowded question (long prompt, or many long options) gets smaller text, never a clipped block.
  const crowded = text.length + optionChars > 420 || question.options.length >= 5;
  const long = text.length > LONG_PROMPT || question.codeLang !== null || crowded;
  const size = isTf
    ? text.length > 110
      ? "text-[22px] leading-[30px]"
      : "text-2xl leading-8"
    : text.length > VERY_LONG_PROMPT
      ? "text-[15px] leading-[22px]"
      : long
        ? "text-[17px] leading-6"
        : "text-[22px] leading-[30px]";
  // The prompt has been read by the reveal: a crowded one steps down to make room for the answers and the explanation.
  const shown = reveal && (crowded || long) && !isTf ? "text-[15px] leading-[22px]" : size;

  return (
    <div role="heading" aria-level={1} className={`shrink-0 font-medium text-pretty ${shown}`}>
      <Prompt text={text} fill={fill} />
    </div>
  );
}

function clozeFill(q: QuestionView, s: MatchUiState, reveal: RevealPayload | null) {
  if (q.type !== "cloze") return undefined;
  const byId = (id: string | undefined) => q.options.find((o) => o.id === id);
  if (reveal && reveal.key.kind === "options") {
    const o = byId(reveal.key.ids[0]);
    return o ? (
      <span className="font-semibold text-text">
        <InlineText text={o.text} />
      </span>
    ) : undefined;
  }
  if (s.yourAnswer?.kind === "options") {
    const o = byId(s.yourAnswer.ids[0]);
    return o ? (
      <span className="text-you">
        <InlineText text={o.text} />
      </span>
    ) : undefined;
  }
  return undefined;
}

/**
 * The reveal's teaching lines: the Bibi fizzle, the one-line explanation,
 * "Saved to missed questions" and the report flag. It sits under the answers
 * and keeps its full height; the answer list above it scrolls instead.
 */
export function RevealBand({
  reveal,
  reported,
  onReport,
}: {
  reveal: RevealPayload;
  reported: boolean;
  onReport?(questionId: string): void;
}) {
  const fizzled =
    (reveal.bibi === "you" && reveal.damageToOpponent === 0) || (reveal.bibi === "opponent" && reveal.damageToYou === 0);
  return (
    <div className="rq-fade flex shrink-0 flex-col gap-0.5">
      {fizzled && <p className="rq-display text-[17px] leading-6 font-bold text-gold">{LINES.bibiFizzle}</p>}
      <p className="text-[15px] leading-[22px] text-pretty">{reveal.whyShort}</p>
      {(reveal.savedToMissed || onReport) && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm leading-5 text-muted">{reveal.savedToMissed ? LINES.savedToMissed : ""}</span>
          {onReport && (
            <button
              type="button"
              disabled={reported}
              onClick={() => onReport(reveal.questionId)}
              aria-label={reported ? LINES.reportedQuestion : "Report this question"}
              className="-my-1 flex h-11 shrink-0 items-center gap-1.5 pl-3 text-sm text-muted hover:text-text disabled:opacity-60"
            >
              <FlagIcon size={14} />
              {reported ? LINES.reportedQuestion : LINES.reportQuestion}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
