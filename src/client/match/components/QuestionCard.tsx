// The question card: draining timer bar synced to the server clock, the
// prompt, and during the reveal the verdicts and the one-line explanation.

import { useRef } from "react";
import type { QuestionView, RevealPayload } from "@shared/protocol";
import type { MatchClock } from "../clock";
import { LINES, TYPE_LABEL } from "../copy";
import { fmtSeconds } from "../format";
import { FX } from "../fx";
import type { MatchUiState } from "../state";
import { useFrame } from "./hooks";
import { FlagIcon } from "../../components/icons";
import { CheckIcon, CrossIcon } from "./icons";
import { InlineText, Prompt } from "./Prompt";

interface Props {
  state: MatchUiState;
  question: QuestionView;
  clock: MatchClock;
  /** The reveal line is visible (after the hit lands). */
  showRevealLine: boolean;
  onTick(secondsLeft: number): void;
  /** Questions reported from this match (stable ids). */
  reported?: ReadonlySet<string>;
  /** The reveal's report flag. Absent: no flag (the dev preview). */
  onReport?(questionId: string): void;
}

export function QuestionCard({ state, question, clock, showRevealLine, onTick, reported, onReport }: Props) {
  const reveal = state.phase === "reveal" ? state.reveal : null;
  const fill = clozeFill(question, state, reveal);
  const isTf = question.type === "truefalse";
  const text = (isTf ? question.statement : question.prompt) ?? "";
  const long = text.length > 150 || question.codeLang !== null;
  const size = isTf ? (text.length > 110 ? "text-xl" : "text-2xl") : long ? "text-[17px]" : "text-xl";

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_8px_30px_-12px_rgba(0,0,0,0.7)]">
      {state.phase === "question" && <TimerBar state={state} question={question} clock={clock} onTick={onTick} />}
      {reveal && <RevealHeader reveal={reveal} />}
      {state.phase === "question" && (
        <div className="flex items-center justify-between px-4 pt-3.5 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
          <span>{TYPE_LABEL[question.type]}</span>
        </div>
      )}
      <div className={`px-4 pt-1.5 pb-4 leading-snug font-semibold ${size}`}>
        <Prompt text={text} fill={fill} />
      </div>
      {reveal && (
        <RevealFooter reveal={reveal} visible={showRevealLine} reported={reported?.has(reveal.questionId) ?? false} onReport={onReport} />
      )}
    </section>
  );
}

function clozeFill(q: QuestionView, s: MatchUiState, reveal: RevealPayload | null) {
  if (q.type !== "cloze") return undefined;
  const byId = (id: string | undefined) => q.options.find((o) => o.id === id);
  if (reveal && reveal.key.kind === "options") {
    const o = byId(reveal.key.ids[0]);
    return o ? (
      <span className="text-correct">
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

function TimerBar({ state, question, clock, onTick }: Omit<Props, "showRevealLine">) {
  const barRef = useRef<HTMLDivElement>(null);
  const secRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const lastSec = useRef<number | null>(null);
  const answered = state.yourAnswer !== null;

  useFrame(clock, true, (now) => {
    const end = answered ? (state.countdownEnd ?? question.deadline) : (state.yourDeadline ?? question.deadline);
    const remaining = Math.max(0, end - now);
    const frac = Math.max(0, Math.min(1, remaining / question.timerMs));
    const sec = Math.ceil(remaining / 1000);
    const urgent = !answered && sec <= FX.tickFromS;
    const color = answered ? "var(--color-opponent)" : urgent ? "var(--color-wrong)" : "var(--color-you)";
    if (barRef.current) {
      barRef.current.style.transform = `scaleX(${frac})`;
      barRef.current.style.background = color;
      barRef.current.style.boxShadow = `0 0 12px ${color}`;
    }
    if (secRef.current) {
      secRef.current.textContent = answered && state.countdownEnd === null ? "" : String(sec);
      secRef.current.style.color = answered ? "var(--color-opponent)" : urgent ? "var(--color-wrong)" : "var(--color-text)";
    }
    if (labelRef.current) {
      const label = state.answerRejected
        ? LINES.tooLate
        : answered
          ? LINES.waiting
          : remaining <= 0
            ? LINES.timeUp
            : "";
      if (labelRef.current.textContent !== label) labelRef.current.textContent = label;
    }
    if (!answered && sec !== lastSec.current) {
      if (lastSec.current !== null && sec > 0 && sec <= FX.tickFromS) onTick(sec);
      lastSec.current = sec;
    }
  });

  return (
    <>
      <div className="absolute inset-x-0 top-0 h-1.5 bg-black/40">
        <div ref={barRef} className="h-full origin-left transition-[background-color] duration-200" style={{ transform: "scaleX(1)" }} />
      </div>
      <div className="absolute top-2.5 right-3.5 flex items-baseline gap-2">
        <span ref={labelRef} className="text-[11px] font-semibold text-muted" />
        <span ref={secRef} className="min-w-[1.5ch] text-right text-2xl font-bold tabular-nums" />
      </div>
    </>
  );
}

function Verdict({ who, correct, ms, answered }: { who: string; correct: boolean; ms: number | null; answered: boolean }) {
  const cls = correct ? "text-correct" : "text-wrong";
  return (
    <span className="flex items-center gap-1">
      <span className="text-muted">{who}</span>
      {correct ? <CheckIcon size={15} className={cls} /> : <CrossIcon size={14} className={cls} />}
      <span className={`font-semibold ${cls}`}>{correct ? "Right" : answered ? "Wrong" : LINES.timeUp}</span>
      {ms !== null && answered && <span className="text-muted tabular-nums">{fmtSeconds(ms)}</span>}
    </span>
  );
}

function RevealHeader({ reveal }: { reveal: RevealPayload }) {
  return (
    <div className="rq-rise flex items-center justify-between gap-2 border-b border-border/70 bg-black/20 px-4 py-2 text-[13px]">
      <Verdict who="You" correct={reveal.yourCorrect} ms={reveal.yourMs} answered={reveal.yourAnswer !== null} />
      <Verdict who="Them" correct={reveal.opponentCorrect} ms={reveal.opponentMs} answered={reveal.opponentAnswer !== null} />
    </div>
  );
}

function RevealFooter({
  reveal,
  visible,
  reported,
  onReport,
}: {
  reveal: RevealPayload;
  visible: boolean;
  reported: boolean;
  onReport?(questionId: string): void;
}) {
  if (!visible) return <div className="h-2" />;
  const fizzled =
    (reveal.zeus === "you" && reveal.damageToOpponent === 0) || (reveal.zeus === "opponent" && reveal.damageToYou === 0);
  return (
    <div className="rq-rise border-t border-border/70 px-4 pt-2.5 pb-3.5">
      {fizzled && <p className="rq-display mb-1.5 text-sm font-bold text-zeus/80">{LINES.zeusFizzle}</p>}
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[14px] leading-snug text-text/85">{reveal.whyShort}</p>
        {onReport && (
          <button
            type="button"
            disabled={reported}
            onClick={() => onReport(reveal.questionId)}
            aria-label={reported ? LINES.reportedQuestion : "Report this question"}
            className="-my-1 flex min-h-9 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-muted hover:text-text disabled:opacity-60"
          >
            <FlagIcon size={14} />
            {reported ? LINES.reportedQuestion : LINES.reportQuestion}
          </button>
        )}
      </div>
      {reveal.savedToMissed && (
        <span className="mt-2 inline-block rounded-full bg-wrong/15 px-2.5 py-0.5 text-[11px] font-semibold text-wrong ring-1 ring-wrong/30">
          {LINES.savedToMissed}
        </span>
      )}
    </div>
  );
}
