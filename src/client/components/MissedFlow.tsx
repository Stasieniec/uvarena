// One missed question: the question with nothing marked, then Retry (untimed)
// or Just show me, then the answer view: the right answer filled, your pick
// outlined red with YOU, Why and Why not, Read in the notes, and Mark as
// learned with a 5 second undo. A "Retry these" run starts straight in the
// untimed retry.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MissedAnswerResponse, MissedQuestionResponse, MissedRetryResponse, MissedStatus } from "@shared/api-schemas";
import { LIMITS } from "@shared/game/config";
import type { AnswerKey } from "@shared/game/types";
import { apiRequest, errorMessage } from "../lib/api";
import { answerIds, buildAnswer, isRenderable, stableOrder, togglePick } from "../lib/answers";
import { formatAgo } from "../lib/format";
import { qk } from "../lib/queries";
import { Icon } from "./after/ui";
import { OptionList, QuestionText, markOptions, optionRows, type OptionMark } from "./QuestionView";
import { FormError, Primary, Sheet, Toast, cx, secondaryClass, textButtonClass } from "./ui";

/** How long the Undo after "Marked as learned" stays up. */
export const UNDO_MS = 5000;

type Revealed =
  | { mode: "retry"; picked: AnswerKey; result: MissedRetryResponse }
  | { mode: "show"; result: MissedAnswerResponse };

function useInvalidateMissed() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.missedAll });
    void qc.invalidateQueries({ queryKey: ["home"] });
  };
}

const REASONS = [
  { v: "wrong_answer", l: "The answer is wrong" },
  { v: "ambiguous", l: "More than one answer fits" },
  { v: "typo", l: "Typo or formatting" },
  { v: "other", l: "Something else" },
] as const;

function ReportSheet({ open, onClose, questionId }: { open: boolean; onClose: () => void; questionId: string }) {
  const [reason, setReason] = useState<(typeof REASONS)[number]["v"]>("wrong_answer");
  const [note, setNote] = useState("");
  const send = useMutation({
    mutationFn: () => apiRequest("report", { params: { id: questionId }, body: { reason, note: note.trim() || undefined } }),
  });
  useEffect(() => {
    if (open) send.reset();
    // Reset only when the sheet opens.
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Report this question">
      {send.isSuccess ? (
        <div className="flex flex-col gap-4 py-2">
          <p className="m-0 text-[15px] leading-[22px] text-muted">Thanks. It goes on the list for the next batch.</p>
          <button type="button" className={cx(secondaryClass, "h-12")} onClick={onClose}>
            Close
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Reason">
          {REASONS.map((r) => (
            <button
              key={r.v}
              type="button"
              role="radio"
              aria-checked={reason === r.v}
              onClick={() => setReason(r.v)}
              className={cx(
                "flex min-h-12 items-center rounded-xs px-4 text-left text-base",
                reason === r.v ? "bg-plate font-semibold shadow-[inset_0_0_0_2px_var(--color-text)]" : "shadow-[inset_0_0_0_1px_var(--color-line)]",
              )}
            >
              {r.l}
            </button>
          ))}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, LIMITS.reportNoteMax))}
            placeholder="What is wrong? (optional)"
            aria-label="What is wrong"
            rows={3}
            className="mt-2 w-full rounded-xs bg-plate px-3 py-3 text-base shadow-[inset_0_0_0_1px_var(--color-line)] outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_2px_var(--color-text)]"
          />
          <FormError message={send.error ? errorMessage(send.error) : null} />
          <Primary className="mt-2" height={52} onClick={() => send.mutate()} busy={send.isPending}>
            Send report
          </Primary>
        </div>
      )}
    </Sheet>
  );
}

/** "Why not Reward": the bank's reason for each wrong option you picked. */
function WhyNot({ data, pickedIds, rows }: { data: { key: AnswerKey; optionWhy: Record<string, string> }; pickedIds: string[]; rows: { id: string; text: string }[] }) {
  const keyIds = answerIds(data.key);
  const items = pickedIds
    .filter((id) => !keyIds.includes(id))
    .map((id) => ({ id, text: rows.find((r) => r.id === id)?.text ?? id, why: data.optionWhy[id] }))
    .filter((x) => x.why);
  return (
    <>
      {items.map((x) => (
        <section key={x.id} className="flex flex-col gap-1">
          <h3 className="m-0 text-[15px] leading-5 font-semibold">Why not {x.text}</h3>
          <p className="m-0 text-[15px] leading-[22px]">{x.why}</p>
        </section>
      ))}
    </>
  );
}

/** Lecture on the left, a short note on the right, 14 muted. */
function MetaLine({ lecture, right }: { lecture: string; right: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm leading-5 text-muted">
      <span className="min-w-0 truncate">{lecture}</span>
      <span className="flex shrink-0 items-center gap-1.5">{right}</span>
    </div>
  );
}

export function MissedFlow({
  data,
  footer,
  onAnswered,
  startInRetry = false,
}: {
  data: MissedQuestionResponse;
  /** The primary action under the answer view in a "Retry these" run (Next or Finish). */
  footer?: ReactNode;
  /** Called once per question when the answer view opens. */
  onAnswered?: (correct: boolean | null) => void;
  /** Skip the first view and go straight to the untimed retry ("Retry these"). */
  startInRetry?: boolean;
}) {
  const q = data.question;
  const invalidate = useInvalidateMissed();
  const [stage, setStage] = useState<"ask" | "retry">(startInRetry ? "retry" : "ask");
  const [picked, setPicked] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [status, setStatus] = useState<MissedStatus>(data.status);
  const [undo, setUndo] = useState<{ previous: MissedStatus } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  // The answer view replaces the question view: start it from the top.
  useEffect(() => {
    if (!revealed) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [revealed]);

  const showUndo = (previous: MissedStatus) => {
    clearTimeout(undoTimer.current);
    setUndo({ previous });
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  };

  const retry = useMutation({
    mutationFn: (answer: AnswerKey) => apiRequest("missedRetry", { params: { questionId: q.id }, body: { answer } }),
    onSuccess: (result, answer) => {
      setRevealed({ mode: "retry", picked: answer, result });
      onAnswered?.(result.correct);
      if (result.status !== status) {
        const prev = status;
        setStatus(result.status);
        if (result.status === "learned") showUndo(prev);
        invalidate();
      }
    },
  });

  const show = useMutation({
    mutationFn: () => apiRequest("missedAnswer", { params: { questionId: q.id } }),
    onSuccess: (result) => {
      setRevealed({ mode: "show", result });
      onAnswered?.(null);
    },
  });

  const setStatusMut = useMutation({
    mutationFn: (next: MissedStatus) => apiRequest("missedStatus", { params: { questionId: q.id }, body: { status: next } }),
    onSuccess: (res, next) => {
      setStatus(res.status);
      invalidate();
      if (next === "learned") showUndo("open");
      else setUndo(null);
    },
  });

  const submit = (ids: string[]) => {
    const answer = buildAnswer(q.type, ids);
    if (answer) retry.mutate(answer);
  };

  const onPick = (id: string) => {
    const next = togglePick(q.type, picked, id);
    setPicked(next);
    if (q.type !== "multi") submit(next);
  };

  // The server shuffles options on every fetch; keep the order this view first showed, so nothing jumps after a retry or an undo.
  const firstOrder = useRef<{ id: string; order: string[] } | null>(null);
  if (firstOrder.current?.id !== q.id) firstOrder.current = { id: q.id, order: q.options.map((o) => o.id) };
  const rows = stableOrder(optionRows(q), firstOrder.current.order);
  const question = { ...q, options: q.type === "truefalse" ? q.options : rows };

  if (!isRenderable(q.type)) {
    return <p className="m-0 py-6 text-[15px] text-muted">This question type cannot be shown here yet.</p>;
  }

  const error = retry.error ?? show.error ?? setStatusMut.error;
  const missedLine = `missed ${data.timesMissed}x`;
  const justShowMe = (
    <button type="button" className={textButtonClass} onClick={() => show.mutate()} disabled={show.isPending}>
      Just show me
    </button>
  );

  // Answer view.
  if (revealed) {
    const keyIds = answerIds(revealed.result.key);
    const pickedIds = revealed.mode === "retry" ? answerIds(revealed.picked) : answerIds(revealed.result.lastAnswer);
    const marks = markOptions(rows, keyIds, pickedIds, q.type === "multi");
    const learnedAction =
      status === "open" ? (
        footer ? (
          <button type="button" className={cx(secondaryClass, "h-12 w-full")} onClick={() => setStatusMut.mutate("learned")} disabled={setStatusMut.isPending}>
            <Icon name="check" size={18} stroke={2.4} />
            Mark as learned
          </button>
        ) : (
          <Primary onClick={() => setStatusMut.mutate("learned")} busy={setStatusMut.isPending}>
            <Icon name="check" size={20} stroke={2.4} />
            Mark as learned
          </Primary>
        )
      ) : !undo ? (
        <button type="button" className={cx(textButtonClass, "w-full")} onClick={() => setStatusMut.mutate("open")} disabled={setStatusMut.isPending}>
          Move back to To review
        </button>
      ) : null;

    return (
      <div ref={top} className="flex flex-1 scroll-mt-14 flex-col gap-3.5">
        <MetaLine lecture={q.lectureTitle} right={missedLine} />
        <QuestionText question={q} variant="plain" />
        <OptionList question={question} marks={marks} pickedLabel={pickedIds} />

        {revealed.mode === "retry" ? (
          <p className={cx("m-0 font-display text-2xl leading-7 font-bold", revealed.result.correct ? "text-text" : "text-wrong")}>
            {revealed.result.correct ? "Right." : "Still wrong."}
          </p>
        ) : revealed.result.lastAnswer === null ? (
          <p className="m-0 text-sm leading-5 text-muted">In the match, the timer ran out.</p>
        ) : null}

        <section className="flex flex-col gap-1">
          <h3 className="m-0 text-[15px] leading-5 font-semibold">Why</h3>
          <p className="m-0 text-[15px] leading-[22px] whitespace-pre-line">{revealed.result.why}</p>
        </section>
        <WhyNot data={revealed.result} pickedIds={pickedIds} rows={rows} />

        {revealed.result.noteUrl ? (
          <a href={revealed.result.noteUrl} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center gap-2 self-start text-base font-semibold text-text">
            <Icon name="book" size={18} />
            Read in the notes
            <Icon name="ext" size={14} stroke={2} className="text-muted" />
          </a>
        ) : null}

        <FormError message={error ? errorMessage(error) : null} />
        <span className="min-h-2 flex-1" />
        <div className="flex flex-col gap-2">
          {/* Undo sits where the button was, so it never covers Next. */}
          {undo ? (
            <Toast
              placement="inline"
              message="Marked as learned"
              action="Undo"
              onAction={() => {
                clearTimeout(undoTimer.current);
                setUndo(null);
                setStatusMut.mutate(undo.previous);
              }}
            />
          ) : (
            learnedAction
          )}
          {footer}
          <button type="button" onClick={() => setReportOpen(true)} className="flex h-11 items-center justify-center gap-2 text-sm text-muted hover:text-text">
            <Icon name="flag" size={16} />
            Report this question
          </button>
        </div>

        <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} questionId={q.id} />
      </div>
    );
  }

  // Question view: first look ("ask") or the untimed retry.
  const retrying = stage === "retry";
  const marks: Record<string, OptionMark> = {};
  if (retrying) for (const id of picked) marks[id] = "picked";

  return (
    <div ref={top} className="flex flex-1 flex-col gap-4">
      {retrying ? <span className="flex-1" /> : null}
      <MetaLine
        lecture={q.lectureTitle}
        right={
          retrying ? (
            <>
              <Icon name="clock" size={14} />
              Untimed
            </>
          ) : (
            `${missedLine} · ${formatAgo(data.lastMissedAt)}`
          )
        }
      />
      <section aria-label="Question" className="shrink-0 overflow-hidden rounded-[3px] bg-plate px-4 py-[18px]">
        {q.type === "multi" ? <p className="m-0 mb-2 text-[15px] leading-5 font-semibold">Select all that apply</p> : null}
        <QuestionText question={q} />
      </section>
      <OptionList question={question} marks={marks} onPick={retrying ? onPick : undefined} disabled={retry.isPending} tall={retrying} />
      <FormError message={error ? errorMessage(error) : null} />

      {retrying ? (
        <>
          {q.type === "multi" ? (
            <Primary height={52} onClick={() => submit(picked)} disabled={picked.length === 0} busy={retry.isPending}>
              Lock in
            </Primary>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm leading-5 text-muted">Ratings do not move here.</span>
            {justShowMe}
          </div>
        </>
      ) : (
        <>
          <span className="flex-1" />
          <div className="flex flex-col gap-1">
            <Primary onClick={() => setStage("retry")}>
              <Icon name="retry" size={20} stroke={2.4} />
              Retry
            </Primary>
            <button type="button" className={cx(textButtonClass, "w-full")} onClick={() => show.mutate()} disabled={show.isPending}>
              Just show me
            </button>
          </div>
        </>
      )}
    </div>
  );
}
