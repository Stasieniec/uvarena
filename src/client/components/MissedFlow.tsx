// One missed question: the question with nothing marked, then Retry (untimed)
// or Just show me, then the answer view with the explanation, why your pick
// was wrong, the notes link, and Mark as learned with a 5 second undo.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MissedAnswerResponse, MissedQuestionResponse, MissedRetryResponse, MissedStatus } from "@shared/api-schemas";
import { LIMITS } from "@shared/game/config";
import type { AnswerKey } from "@shared/game/types";
import { apiRequest, errorMessage } from "../lib/api";
import { answerIds, buildAnswer, isRenderable, stableOrder, togglePick } from "../lib/answers";
import { formatAgo } from "../lib/format";
import { qk } from "../lib/queries";
import { ExternalIcon, FlagIcon } from "./icons";
import { OptionList, QuestionText, markOptions, optionRows, type OptionMark } from "./QuestionView";
import { Button, FormError, Sheet, Toast, cx } from "./ui";

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

function ReportSheet({ open, onClose, questionId }: { open: boolean; onClose: () => void; questionId: string }) {
  const [reason, setReason] = useState<"wrong_answer" | "ambiguous" | "typo" | "other">("wrong_answer");
  const [note, setNote] = useState("");
  const send = useMutation({
    mutationFn: () => apiRequest("report", { params: { id: questionId }, body: { reason, note: note.trim() || undefined } }),
  });
  useEffect(() => {
    if (open) send.reset();
    // Reset only when the sheet opens.
  }, [open]);
  const reasons = [
    { v: "wrong_answer", l: "The answer is wrong" },
    { v: "ambiguous", l: "More than one answer fits" },
    { v: "typo", l: "Typo or formatting" },
    { v: "other", l: "Something else" },
  ] as const;
  return (
    <Sheet open={open} onClose={onClose} title="Report this question">
      {send.isSuccess ? (
        <div className="flex flex-col gap-4 py-2">
          <p className="text-muted">Thanks. It goes on the list for the next batch.</p>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {reasons.map((r) => (
            <button
              key={r.v}
              type="button"
              role="radio"
              aria-checked={reason === r.v}
              onClick={() => setReason(r.v)}
              className={cx("flex min-h-tap items-center rounded-xl border px-4 text-left", reason === r.v ? "border-you bg-you/10" : "border-border")}
            >
              {r.l}
            </button>
          ))}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, LIMITS.reportNoteMax))}
            placeholder="What is wrong? (optional)"
            rows={3}
            className="mt-2 w-full rounded-xl border border-border bg-bg px-4 py-3 text-base focus:border-you/60 focus:outline-none"
          />
          <FormError message={send.error ? errorMessage(send.error) : null} />
          <Button className="mt-2" onClick={() => send.mutate()} loading={send.isPending}>
            Send report
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function WhyWrong({ data, pickedIds, rows }: { data: { key: AnswerKey; optionWhy: Record<string, string> }; pickedIds: string[]; rows: { id: string; text: string }[] }) {
  const keyIds = answerIds(data.key);
  const wrongPicks = pickedIds.filter((id) => !keyIds.includes(id));
  const items = wrongPicks.map((id) => ({ id, text: rows.find((r) => r.id === id)?.text ?? id, why: data.optionWhy[id] })).filter((x) => x.why);
  if (items.length === 0) return null;
  return (
    <section className="rounded-2xl border border-wrong/30 bg-wrong/5 p-4">
      <h3 className="mb-2 text-xs font-semibold tracking-[0.14em] text-wrong uppercase">Why your pick was wrong</h3>
      <ul className="flex flex-col gap-3">
        {items.map((x) => (
          <li key={x.id}>
            <p className="text-sm font-semibold">{x.text}</p>
            <p className="text-sm text-muted">{x.why}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MissedFlow({
  data,
  footer,
  onAnswered,
}: {
  data: MissedQuestionResponse;
  /** Extra actions under the answer view (Next in a "Retry these" run). */
  footer?: ReactNode;
  /** Called once per question when the answer view opens. */
  onAnswered?: (correct: boolean | null) => void;
}) {
  const q = data.question;
  const invalidate = useInvalidateMissed();
  const [stage, setStage] = useState<"ask" | "retry">("ask");
  const [picked, setPicked] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [status, setStatus] = useState<MissedStatus>(data.status);
  const [undo, setUndo] = useState<{ previous: MissedStatus } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const answerView = useRef<HTMLDivElement>(null);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  // Bring the answer view into sight once it opens; the options above stay marked.
  useEffect(() => {
    if (!revealed) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    answerView.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
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

  if (!isRenderable(q.type)) {
    return <p className="rounded-2xl border border-border bg-surface p-4 text-muted">This question type cannot be shown here yet.</p>;
  }

  // Marks: nothing in "ask", picks in "retry", the full key after reveal.
  let marks: Record<string, OptionMark> = {};
  let pickedIds: string[] = [];
  let fill: string | null = null;
  if (revealed) {
    const keyIds = answerIds(revealed.result.key);
    pickedIds = revealed.mode === "retry" ? answerIds(revealed.picked) : answerIds(revealed.result.lastAnswer);
    marks = markOptions(rows, keyIds, pickedIds, q.type === "multi");
    if (q.type === "cloze") fill = rows.find((r) => keyIds.includes(r.id))?.text ?? null;
  } else if (stage === "retry") {
    for (const id of picked) marks[id] = "picked";
  }

  const error = retry.error ?? show.error ?? setStatusMut.error;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="truncate font-medium text-text/80">{q.lectureTitle}</span>
        <span>·</span>
        <span className="shrink-0">
          missed {data.timesMissed}x · {formatAgo(data.lastMissedAt)}
        </span>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        {q.type === "multi" ? <p className="mb-2 text-xs font-semibold tracking-wider text-zeus uppercase">Select all that apply</p> : null}
        <QuestionText question={q} fill={fill} />
      </div>

      <OptionList
        question={{ ...q, options: q.type === "truefalse" ? q.options : rows }}
        marks={marks}
        onPick={stage === "retry" && !revealed ? onPick : undefined}
        disabled={retry.isPending}
        pickedLabel={revealed ? pickedIds : undefined}
      />

      {!revealed && stage === "ask" ? (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setStage("retry")}>Retry</Button>
          <Button variant="secondary" onClick={() => show.mutate()} loading={show.isPending}>
            Just show me
          </Button>
        </div>
      ) : null}

      {!revealed && stage === "retry" ? (
        <div className="flex flex-col gap-2">
          <p className="text-center text-sm text-muted">Untimed. Nothing here touches your rating.</p>
          {q.type === "multi" ? (
            <Button onClick={() => submit(picked)} disabled={picked.length === 0} loading={retry.isPending}>
              Lock in
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => show.mutate()} loading={show.isPending}>
            Just show me
          </Button>
        </div>
      ) : null}

      <FormError message={error ? errorMessage(error) : null} />

      {revealed ? (
        <div ref={answerView} className="pop-in flex scroll-mt-16 flex-col gap-4">
          {revealed.mode === "retry" ? (
            <p className={cx("font-display text-2xl font-bold", revealed.result.correct ? "text-correct" : "text-wrong")}>
              {revealed.result.correct ? "Right." : "Still wrong."}
            </p>
          ) : revealed.result.lastAnswer === null ? (
            <p className="text-sm text-muted">In the match, the timer ran out.</p>
          ) : null}

          <section className="rounded-2xl border border-correct/30 bg-correct/5 p-4">
            <h3 className="mb-2 text-xs font-semibold tracking-[0.14em] text-correct uppercase">Explanation</h3>
            <p className="leading-relaxed whitespace-pre-line">{revealed.result.why}</p>
          </section>

          <WhyWrong data={revealed.result} pickedIds={pickedIds} rows={rows} />

          {revealed.result.noteUrl ? (
            <a href={revealed.result.noteUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-tap items-center justify-center gap-2 rounded-xl border border-border px-4 font-medium text-you hover:bg-you/5">
              Read in the notes
              <ExternalIcon size={18} />
            </a>
          ) : null}

          {status === "open" ? (
            <Button variant="secondary" onClick={() => setStatusMut.mutate("learned")} loading={setStatusMut.isPending}>
              Mark as learned
            </Button>
          ) : !undo ? (
            <Button variant="ghost" onClick={() => setStatusMut.mutate("open")} loading={setStatusMut.isPending}>
              Move back to To review
            </Button>
          ) : null}

          {footer}

          <button type="button" onClick={() => setReportOpen(true)} className="flex min-h-tap items-center justify-center gap-2 text-sm text-muted hover:text-text">
            <FlagIcon size={16} />
            Report this question
          </button>
        </div>
      ) : null}

      {undo ? (
        <Toast
          message="Marked as learned"
          action="Undo"
          onAction={() => {
            clearTimeout(undoTimer.current);
            setUndo(null);
            setStatusMut.mutate(undo.previous);
          }}
        />
      ) : null}
      <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} questionId={q.id} />
    </div>
  );
}
