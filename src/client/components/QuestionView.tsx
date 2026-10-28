// A question outside a match: the text (NOT in red capitals, the cloze gap
// highlighted) and its options, either pickable or marked after answering.
import type { ReactNode } from "react";
import type { QuestionPublic } from "@shared/api-schemas";
import { FALSE_ID, TRUE_ID } from "../lib/answers";
import { CheckIcon, XIcon } from "./icons";
import { cx } from "./ui";

/** Splits text so every standalone NOT is bold red. */
export function emphasiseNot(text: string): ReactNode[] {
  return text.split(/\b(NOT)\b/).map((part, i) =>
    part === "NOT" ? (
      <strong key={i} className="font-extrabold text-wrong">
        NOT
      </strong>
    ) : (
      part
    ),
  );
}

export function QuestionText({ question, fill }: { question: Pick<QuestionPublic, "type" | "prompt" | "statement">; fill?: string | null }) {
  const text = question.type === "truefalse" ? (question.statement ?? question.prompt ?? "") : (question.prompt ?? question.statement ?? "");
  if (question.type === "cloze" && text.includes("___")) {
    const parts = text.split(/_{3,}/);
    return (
      <p className="text-lg leading-relaxed font-medium whitespace-pre-line">
        {parts.map((p, i) => (
          <span key={i}>
            {emphasiseNot(p)}
            {i < parts.length - 1 ? (
              <span
                className={cx(
                  "mx-0.5 inline-block min-w-16 rounded-md border-b-2 px-2 text-center",
                  fill ? "border-correct bg-correct/10 text-correct" : "border-gold bg-gold/10 text-transparent",
                )}
              >
                {fill ?? "blank"}
              </span>
            ) : null}
          </span>
        ))}
      </p>
    );
  }
  return (
    <p className={cx("leading-relaxed font-medium whitespace-pre-line", question.type === "truefalse" ? "text-xl" : "text-lg")}>{emphasiseNot(text)}</p>
  );
}

export type OptionMark = "none" | "picked" | "correct" | "wrong" | "correct-unpicked";

export interface OptionRow {
  id: string;
  text: string;
}

/** Options for a question; true/false gets True and False. */
export function optionRows(question: Pick<QuestionPublic, "type" | "options">): OptionRow[] {
  if (question.type === "truefalse") {
    return [
      { id: TRUE_ID, text: "True" },
      { id: FALSE_ID, text: "False" },
    ];
  }
  return question.options;
}

/**
 * Marks for the answer view. Correct options are green; a wrong pick is red.
 * A correct option the player did not pick (multi) is green with a dashed edge.
 */
export function markOptions(rows: OptionRow[], keyIds: string[], pickedIds: string[], multi = false): Record<string, OptionMark> {
  const out: Record<string, OptionMark> = {};
  for (const r of rows) {
    const isKey = keyIds.includes(r.id);
    const picked = pickedIds.includes(r.id);
    out[r.id] = isKey ? (multi && !picked && pickedIds.length > 0 ? "correct-unpicked" : "correct") : picked ? "wrong" : "none";
  }
  return out;
}

const MARK_CLASS: Record<OptionMark, string> = {
  none: "border-border bg-surface text-text",
  picked: "border-you bg-you/15 text-text ring-1 ring-you",
  correct: "border-correct bg-correct/15 text-text",
  "correct-unpicked": "border-dashed border-correct bg-correct/5 text-text",
  wrong: "border-wrong bg-wrong/15 text-text",
};

export function OptionList({
  question,
  marks,
  onPick,
  disabled,
  pickedLabel,
  otherPicks,
  otherLabel,
}: {
  question: Pick<QuestionPublic, "type" | "options" | "codeLang">;
  marks: Record<string, OptionMark>;
  onPick?: (id: string) => void;
  disabled?: boolean;
  /** Ids to tag with "Your answer" in the answer view. */
  pickedLabel?: string[];
  /** Another player's picks, shown as an orange dot (match detail). */
  otherPicks?: string[];
  otherLabel?: string;
}) {
  const rows = optionRows(question);
  const code = question.codeLang !== null;
  const tf = question.type === "truefalse";
  return (
    <div className={cx(tf ? "grid grid-cols-2 gap-3" : "flex flex-col gap-2.5")} role={onPick ? "group" : undefined}>
      {rows.map((r) => {
        const mark = marks[r.id] ?? "none";
        const content = (
          <>
            {code ? (
              <pre className="min-w-0 flex-1 overflow-hidden font-mono text-[13px] leading-snug whitespace-pre-wrap break-words">{r.text}</pre>
            ) : (
              <span className={cx("min-w-0 flex-1", tf && "text-center text-lg font-semibold")}>{emphasiseNot(r.text)}</span>
            )}
            <span className="flex shrink-0 items-center gap-1.5">
              {otherPicks?.includes(r.id) ? <span className="size-2.5 rounded-xs bg-opponent" title={otherLabel} aria-label={otherLabel} /> : null}
              {mark === "correct" || mark === "correct-unpicked" ? <CheckIcon size={18} className="text-correct" /> : null}
              {mark === "wrong" ? <XIcon size={18} className="text-wrong" /> : null}
            </span>
          </>
        );
        const cls = cx(
          "flex min-h-tap w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-base transition",
          MARK_CLASS[mark],
          tf && "justify-center py-5",
        );
        return (
          <div key={r.id} className="flex flex-col gap-1">
            {onPick ? (
              <button type="button" className={cx(cls, !disabled && "active:scale-[0.99]")} onClick={() => onPick(r.id)} disabled={disabled} aria-pressed={mark === "picked"}>
                {content}
              </button>
            ) : (
              <div className={cls}>{content}</div>
            )}
            {pickedLabel?.includes(r.id) ? <span className={cx("pl-1 text-xs font-medium", mark === "wrong" ? "text-wrong" : "text-correct")}>Your answer</span> : null}
          </div>
        );
      })}
    </div>
  );
}
