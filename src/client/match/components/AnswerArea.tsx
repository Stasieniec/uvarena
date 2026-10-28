// The answer area in the thumb zone, per question type: True/False side by
// side, single choice and fill-the-blank as one-tap buttons, multiple select
// with toggles and Lock in. Code options render as monospace blocks. During
// the reveal the right option turns green, a wrong pick red, and the
// opponent's pick gets an orange dot.

import { useEffect, useState } from "react";
import type { AnswerKey, OptionText } from "@shared/game/types";
import type { QuestionView, RevealPayload } from "@shared/protocol";
import { LINES } from "../copy";
import type { MatchUiState } from "../state";
import { CheckIcon, CrossIcon } from "./icons";
import { InlineText } from "./Prompt";

interface Props {
  state: MatchUiState;
  question: QuestionView;
  /** Answers flip a moment into the reveal. */
  flipped: boolean;
  onAnswer(answer: AnswerKey): void;
  /** Multiple select: the options ticked so far (owned by the duel, so Lock in can sit outside the scrolling list). */
  picked: string[];
  onToggle(id: string): void;
}

/** Multiple-select ticks for the current question; a new question clears them. */
export function useMultiPick(round: number | null): [string[], (id: string) => void] {
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setPicked([]), [round]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return [picked, toggle];
}

type Mark = "none" | "selected" | "right" | "wrong" | "missed";

function idsOf(a: AnswerKey | null | undefined): string[] {
  return a && a.kind === "options" ? a.ids : [];
}

export function AnswerArea({ state, question, flipped, onAnswer, picked, onToggle }: Props) {
  const reveal = state.phase === "reveal" && flipped ? state.reveal : null;
  const locked = state.phase !== "question" || state.yourAnswer !== null;

  if (question.type === "truefalse") {
    return <TrueFalse state={state} reveal={reveal} locked={locked} onAnswer={onAnswer} />;
  }
  if (question.type === "order" || question.type === "match") {
    return <p className="px-2 text-center text-sm text-muted">This question type is not playable yet. It counts as a timeout.</p>;
  }
  return <Options state={state} question={question} reveal={reveal} locked={locked} onAnswer={onAnswer} picked={picked} onToggle={onToggle} />;
}

/** The opponent's pick: a small orange tag on the top edge of the option, inside its width. */
function OpponentDot() {
  return (
    <span
      className="absolute -top-2 right-3 flex items-center gap-1 rounded-full bg-opponent px-1.5 py-px text-[10px] leading-tight font-bold text-bg ring-2 ring-bg"
      title="Opponent's pick"
      aria-label="Opponent's pick"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-bg/70" aria-hidden />
      Them
    </span>
  );
}

const MARK_CLS: Record<Mark, string> = {
  none: "bg-surface-2 ring-white/12",
  selected: "bg-[color-mix(in_srgb,var(--color-you)_22%,var(--color-surface-2))] ring-you ring-2",
  right: "bg-[color-mix(in_srgb,var(--color-correct)_26%,var(--color-surface-2))] ring-correct ring-2",
  wrong: "bg-[color-mix(in_srgb,var(--color-wrong)_26%,var(--color-surface-2))] ring-wrong ring-2",
  missed: "bg-surface-2 ring-0 outline-2 outline-dashed -outline-offset-2 outline-correct",
};

function TrueFalse({
  state,
  reveal,
  locked,
  onAnswer,
}: {
  state: MatchUiState;
  reveal: RevealPayload | null;
  locked: boolean;
  onAnswer(a: AnswerKey): void;
}) {
  const mine = state.yourAnswer?.kind === "bool" ? state.yourAnswer.value : null;
  const key = reveal?.key.kind === "bool" ? reveal.key.value : null;
  const theirs = reveal?.opponentAnswer?.kind === "bool" ? reveal.opponentAnswer.value : null;
  return (
    <div className="grid grid-cols-2 gap-3">
      {[true, false].map((v) => {
        let mark: Mark = mine === v ? "selected" : "none";
        if (reveal) mark = key === v ? "right" : mine === v ? "wrong" : "none";
        const dim = locked && !reveal && mine !== v;
        return (
          <button
            key={String(v)}
            type="button"
            disabled={locked}
            onClick={() => onAnswer({ kind: "bool", value: v })}
            className={`relative flex ${reveal ? "h-20" : "h-28"} flex-col items-center justify-center gap-1 rounded-2xl text-2xl font-bold ring-1 transition-[transform,opacity] duration-150 active:scale-[0.97] ${MARK_CLS[mark]} ${reveal ? "rq-flip" : ""} ${dim ? "opacity-40" : ""}`}
          >
            {v ? "True" : "False"}
            {reveal && key === v && <CheckIcon className="text-correct" />}
            {reveal && mine === v && key !== v && <CrossIcon className="text-wrong" />}
            {!reveal && mine === v && <span className="text-[11px] font-semibold tracking-wide text-you uppercase">{LINES.lockedIn}</span>}
            {reveal && theirs === v && <OpponentDot />}
          </button>
        );
      })}
    </div>
  );
}

function Options({
  state,
  question,
  reveal,
  locked,
  onAnswer,
  picked,
  onToggle,
}: {
  state: MatchUiState;
  question: QuestionView;
  reveal: RevealPayload | null;
  locked: boolean;
  onAnswer(a: AnswerKey): void;
  picked: string[];
  onToggle(id: string): void;
}) {
  const multi = question.type === "multi";

  const mine = idsOf(state.yourAnswer);
  const keyIds = idsOf(reveal?.key);
  const theirs = idsOf(reveal?.opponentAnswer);
  const hidden = new Set(state.hidden);
  const code = question.codeLang !== null || question.options.some((o) => o.text.includes("\n"));
  // Many or long options get tighter rows; during the reveal, when nothing is tapped any more, tighter still.
  const dense = question.options.length >= 5 || question.options.reduce((n, o) => n + o.text.length, 0) > 260;
  const rowCls = reveal
    ? dense
      ? "min-h-10 gap-2 px-3 py-1"
      : "min-h-11 gap-2.5 px-3 py-1.5"
    : dense
      ? "min-h-12 gap-2.5 px-3 py-1.5"
      : "min-h-14 gap-3 px-3.5 py-2.5";
  const textCls = reveal && dense ? "text-[13.5px] leading-[1.3]" : reveal || dense ? "text-[14.5px] leading-[1.3]" : "text-[16px] leading-snug";

  const tap = (o: OptionText) => {
    if (locked || hidden.has(o.id)) return;
    if (!multi) {
      onAnswer({ kind: "options", ids: [o.id] });
      return;
    }
    onToggle(o.id);
  };

  const selectedNow = reveal || state.yourAnswer ? mine : picked;

  return (
    <div className={`flex flex-col ${reveal ? "gap-2.5" : "gap-2"}`}>
      {question.options.map((o) => {
        const isHidden = hidden.has(o.id);
        const sel = selectedNow.includes(o.id);
        let mark: Mark = sel ? "selected" : "none";
        if (reveal) {
          const inKey = keyIds.includes(o.id);
          const isMine = mine.includes(o.id);
          mark = inKey ? (multi && !isMine ? "missed" : "right") : isMine ? "wrong" : "none";
        }
        const dim = !reveal && locked && !sel;
        return (
          <button
            key={o.id}
            type="button"
            disabled={locked || isHidden}
            aria-pressed={multi ? sel : undefined}
            aria-hidden={isHidden || undefined}
            onClick={() => tap(o)}
            className={[
              "relative flex w-full items-center rounded-xl text-left ring-1 transition-[transform,opacity] duration-150 active:scale-[0.985]",
              rowCls,
              MARK_CLS[mark],
              reveal ? "rq-flip" : "",
              dim ? "opacity-40" : "",
              isHidden && !reveal ? "rq-lifeline pointer-events-none" : "",
              isHidden && reveal ? "opacity-20" : "",
            ].join(" ")}
          >
            {multi && (
              <span
                className={`flex ${reveal ? "h-5 w-5" : "h-6 w-6"} shrink-0 items-center justify-center rounded-md ring-2 ${sel ? "bg-you text-bg ring-you" : "ring-white/30"}`}
                aria-hidden
              >
                {sel && <CheckIcon size={16} />}
              </span>
            )}
            {code ? (
              <pre className="rq-code min-w-0 flex-1 text-[13px] leading-snug">{o.text}</pre>
            ) : (
              <span className={`min-w-0 flex-1 font-medium ${textCls}`}>
                <InlineText text={o.text} />
              </span>
            )}
            {reveal && keyIds.includes(o.id) && <CheckIcon className="shrink-0 text-correct" />}
            {reveal && mine.includes(o.id) && !keyIds.includes(o.id) && <CrossIcon className="shrink-0 text-wrong" />}
            {reveal && theirs.includes(o.id) && <OpponentDot />}
          </button>
        );
      })}
    </div>
  );
}

/** Multiple select's Lock in, under the scrolling answer list so it is always in reach. */
export function LockInButton({ state, picked, onAnswer }: { state: MatchUiState; picked: string[]; onAnswer(a: AnswerKey): void }) {
  const locked = state.phase !== "question" || state.yourAnswer !== null;
  return (
    <button
      type="button"
      disabled={locked || picked.length === 0}
      onClick={() => onAnswer({ kind: "options", ids: picked })}
      className={`h-13 shrink-0 rounded-xl text-lg font-bold transition-[transform,opacity] active:scale-[0.98] ${
        state.yourAnswer
          ? "bg-surface text-you ring-1 ring-you/50"
          : picked.length === 0
            ? "bg-surface-2 text-muted"
            : "bg-you text-bg shadow-[0_0_24px_-4px_var(--color-you)]"
      }`}
    >
      {state.yourAnswer ? LINES.lockedIn : LINES.lockIn}
    </button>
  );
}
