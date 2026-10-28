// The answer area in the thumb zone, per question type: True/False side by
// side, single choice and fill-the-blank as one-tap plates, multiple select
// with ticks and Lock in. Code options render as monospace blocks. During the
// reveal the right option fills with the text colour and gets a check, your
// wrong pick gets a red outline and a strike, and small name tags say who
// picked what. The look of every state lives in match.css (data-mark).

import { useEffect, useState } from "react";
import type { AnswerKey, OptionText } from "@shared/game/types";
import type { PlayerView, QuestionView, RevealPayload } from "@shared/protocol";
import { LINES } from "../copy";
import type { MatchUiState } from "../state";
import { CheckIcon, CrossIcon } from "./icons";
import { InlineText } from "./Prompt";

interface Props {
  state: MatchUiState;
  question: QuestionView;
  /** The reveal marks are showing. */
  marked: boolean;
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

/**
 * none: a plain plate. selected: your pick before the reveal. dim: locked and not yours.
 * right: in the key (filled). missed: in the key, not ticked (multiple select, outlined).
 * wrong: your pick, not in the key. rest: everything else during the reveal. gone: removed by 50:50.
 */
type Mark = "none" | "selected" | "dim" | "right" | "missed" | "wrong" | "rest" | "gone";

function idsOf(a: AnswerKey | null | undefined): string[] {
  return a && a.kind === "options" ? a.ids : [];
}

export function AnswerArea({ state, question, marked, onAnswer, picked, onToggle }: Props) {
  const reveal = state.phase === "reveal" && marked ? state.reveal : null;
  const locked = state.phase !== "question" || state.yourAnswer !== null;

  if (question.type === "truefalse") {
    return <TrueFalse state={state} reveal={reveal} locked={locked} onAnswer={onAnswer} />;
  }
  if (question.type === "order" || question.type === "match") {
    return <p className="text-center text-sm text-muted">This question type is not playable yet. It counts as a timeout.</p>;
  }
  return <Options state={state} question={question} reveal={reveal} locked={locked} onAnswer={onAnswer} picked={picked} onToggle={onToggle} />;
}

/** Who picked an option: small name plates in the player colours. */
function Tags({ you, them, opponent }: { you: boolean; them: boolean; opponent: PlayerView | null }) {
  if (!you && !them) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {you && <span className="rq-plate-name bg-you px-2 py-px text-[15px] leading-5 text-bg">You</span>}
      {them && (
        <span className="rq-plate-name max-w-[7.5rem] truncate bg-opponent px-2 py-px text-[15px] leading-5 text-bg">{opponent?.name ?? "Them"}</span>
      )}
    </span>
  );
}

function revealLabel(mark: Mark, you: boolean, them: boolean, opponent: PlayerView | null): string {
  const parts: string[] = [];
  if (mark === "right") parts.push("correct");
  if (mark === "missed") parts.push("correct, not picked");
  if (mark === "wrong") parts.push("wrong");
  if (you) parts.push("your pick");
  if (them) parts.push(`picked by ${opponent?.name ?? "your opponent"}`);
  return parts.join(", ");
}

function MarkIcon({ mark }: { mark: Mark }) {
  if (mark === "right" || mark === "missed") return <CheckIcon size={18} className="shrink-0" />;
  if (mark === "wrong") return <CrossIcon size={18} className="shrink-0 text-wrong" />;
  return <span className="w-[18px] shrink-0" aria-hidden />;
}

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
        let mark: Mark = mine === v ? "selected" : locked ? "dim" : "none";
        if (reveal) mark = key === v ? "right" : mine === v ? "wrong" : "rest";
        const you = reveal !== null && mine === v;
        const them = reveal !== null && theirs === v;
        return (
          <button
            key={String(v)}
            type="button"
            disabled={locked}
            data-mark={mark}
            onClick={() => onAnswer({ kind: "bool", value: v })}
            className={`rq-option relative flex ${reveal ? "h-[72px]" : "h-[min(200px,24dvh)] min-h-28"} flex-col items-center justify-center gap-1 rounded-[3px] px-3`}
          >
            <span className={`rq-option-text rq-display flex items-center gap-2 font-bold ${reveal ? "text-[28px] leading-8" : "text-4xl leading-10"}`}>
              {reveal && (mark === "right" || mark === "wrong") && <MarkIcon mark={mark} />}
              {v ? "True" : "False"}
            </span>
            {!reveal && mine === v && <span className="text-sm leading-5 font-semibold text-you">{LINES.lockedIn}</span>}
            {reveal && <Tags you={you} them={them} opponent={state.opponent} />}
            {reveal && <span className="sr-only">{revealLabel(mark, you, them, state.opponent)}</span>}
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
  // Many or long options get lower plates; during the reveal, when nothing is tapped any more, lower still.
  const dense = question.options.length >= 5 || question.options.reduce((n, o) => n + o.text.length, 0) > 260;
  const rowCls = reveal ? (dense ? "min-h-11 py-1.5" : "min-h-12 py-2") : dense ? "min-h-[52px] py-2" : "min-h-[60px] py-2";
  const textCls = dense ? "text-[15px] leading-[22px]" : "text-[17px] leading-6";

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
    <div className={`flex flex-col ${dense || multi ? "gap-2" : "gap-2.5"}`}>
      {question.options.map((o) => {
        const isHidden = hidden.has(o.id);
        const sel = selectedNow.includes(o.id);
        let mark: Mark = sel ? "selected" : locked ? "dim" : "none";
        if (reveal) {
          const inKey = keyIds.includes(o.id);
          const isMine = mine.includes(o.id);
          mark = inKey ? (multi && !isMine ? "missed" : "right") : isMine ? "wrong" : "rest";
        }
        if (isHidden) mark = "gone";
        const you = reveal !== null && mine.includes(o.id);
        const them = reveal !== null && theirs.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            disabled={locked || isHidden}
            aria-pressed={multi ? sel : undefined}
            aria-hidden={isHidden || undefined}
            data-mark={mark}
            onClick={() => tap(o)}
            className={[
              `rq-option relative flex w-full items-center gap-3 rounded-[3px] pl-4 text-left ${reveal ? "pr-3" : "pr-4"}`,
              rowCls,
              isHidden && !reveal ? "rq-lifeline pointer-events-none" : "",
            ].join(" ")}
          >
            {multi && !reveal && (
              <span className={`rq-tick flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-xs ${sel ? "is-on" : ""}`} aria-hidden>
                {sel && <CheckIcon size={16} />}
              </span>
            )}
            {reveal && <MarkIcon mark={mark} />}
            {code ? (
              <pre className="rq-code rq-option-text min-w-0 flex-1 text-[13px] leading-snug">{o.text}</pre>
            ) : (
              <span className={`rq-option-text min-w-0 flex-1 ${textCls}`}>
                <InlineText text={o.text} />
              </span>
            )}
            {reveal && <Tags you={you} them={them} opponent={state.opponent} />}
            {reveal && mark !== "rest" && mark !== "gone" && <span className="sr-only">{`, ${revealLabel(mark, you, them, state.opponent)}`}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Multiple select's Lock in: the primary action, under the scrolling answer list so it is always in reach. */
export function LockInButton({ state, picked, onAnswer }: { state: MatchUiState; picked: string[]; onAnswer(a: AnswerKey): void }) {
  const locked = state.phase !== "question" || state.yourAnswer !== null;
  return (
    <div className="shrink-0 p-[3px]">
      <button
        type="button"
        disabled={locked || picked.length === 0}
        onClick={() => onAnswer({ kind: "options", ids: picked })}
        className="btn-primary h-[52px] w-full rounded-xs text-2xl leading-7"
      >
        {state.yourAnswer ? LINES.lockedIn : LINES.lockIn}
      </button>
    </div>
  );
}
