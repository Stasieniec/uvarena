// A question outside a match (missed questions, match detail), in the
// Broadcast look: the prompt (the cloze gap as an 88 x 4 px rule, NOT in bold
// red), then plate options. After the answer: the right option filled in the
// text colour with a check, a wrong pick outlined red and struck, the rest
// dimmed; YOU and the opponent's name as tags on the picks.
import type { ReactNode } from "react";
import type { QuestionPublic } from "@shared/api-schemas";
import { FALSE_ID, TRUE_ID } from "../lib/answers";
import { parseBlocks, parseInline, type InlineToken } from "../match/prompt";
import { splitTables } from "./after/prompt-text";
import { Icon } from "./after/ui";
import { NameTag, cx } from "./ui";

function Inline({ tokens, fill }: { tokens: InlineToken[]; fill?: string | null }): ReactNode {
  return tokens.map((t, i) => {
    switch (t.kind) {
      case "text":
        return <span key={i}>{t.text}</span>;
      case "code":
        return (
          <code key={i} className="rounded-xs bg-plate-dim px-1 py-0.5 font-mono text-[0.88em]">
            {t.text}
          </code>
        );
      case "bold":
        return (
          <strong key={i} className="font-bold">
            <Inline tokens={t.children} fill={fill} />
          </strong>
        );
      case "italic":
        return (
          <em key={i}>
            <Inline tokens={t.children} fill={fill} />
          </em>
        );
      case "blank":
        return fill ? (
          <span key={i} className="mx-0.5 border-b-4 border-text font-semibold">
            {fill}
          </span>
        ) : (
          <span key={i} aria-label="blank" role="img" className="mx-0.5 inline-block h-1 w-[88px] bg-text align-[-2px]" />
        );
      case "not":
        return (
          <strong key={i} className="font-bold text-wrong">
            NOT
          </strong>
        );
    }
  });
}

export { plainPreview } from "./after/prompt-text";

/** Splits text so every standalone NOT is bold red (kept for callers that only need that). */
export function emphasiseNot(text: string): ReactNode[] {
  return text.split(/\b(NOT)\b/).map((part, i) =>
    part === "NOT" ? (
      <strong key={i} className="font-bold text-wrong">
        NOT
      </strong>
    ) : (
      part
    ),
  );
}

/**
 * The prompt. `variant` "card" is the 22/30 size inside a question card;
 * "plain" is the 20/28 heading of the answer view. True/false statements run larger.
 */
export function QuestionText({
  question,
  fill,
  variant = "card",
}: {
  question: Pick<QuestionPublic, "type" | "prompt" | "statement">;
  fill?: string | null;
  variant?: "card" | "plain";
}) {
  const text = question.type === "truefalse" ? (question.statement ?? question.prompt ?? "") : (question.prompt ?? question.statement ?? "");
  const segments = splitTables(text);
  const long = text.length > 200;
  const size =
    variant === "plain"
      ? "text-xl leading-7"
      : question.type === "truefalse"
        ? long
          ? "text-[22px] leading-[30px]"
          : "text-[26px] leading-[34px]"
        : long
          ? "text-xl leading-7"
          : "text-[22px] leading-[30px]";
  let first = true;
  return (
    <div role="heading" aria-level={2} className={cx("m-0 font-medium text-pretty", size)}>
      {segments.map((seg, si) =>
        seg.kind === "table" ? (
          <Table key={si} rows={seg.rows} />
        ) : (
          parseBlocks(seg.text).map((b, i) => {
            const gap = !first;
            first = false;
            return b.kind === "code" ? (
              <pre key={`${si}-${i}`} className="my-2 overflow-x-auto rounded-xs bg-plate-dim p-2.5 font-mono text-[13px] leading-snug whitespace-pre-wrap">
                {b.text}
              </pre>
            ) : (
              <p key={`${si}-${i}`} className={cx("m-0 whitespace-pre-line", gap && "mt-2")}>
                <Inline tokens={b.inline} fill={fill} />
              </p>
            );
          })
        ),
      )}
    </div>
  );
}

/** A small payoff-style table: first row and first column as headers. */
function Table({ rows }: { rows: string[][] }) {
  const [head, ...body] = rows;
  return (
    <table className="my-2 border-collapse font-display text-xl leading-7">
      {head ? (
        <thead>
          <tr>
            {head.map((c, i) => (
              <th key={i} className="border border-line px-3 py-1 text-center font-bold text-muted">
                <Inline tokens={parseInline(c)} />
              </th>
            ))}
          </tr>
        </thead>
      ) : null}
      <tbody>
        {body.map((r, ri) => (
          <tr key={ri}>
            {r.map((c, i) => (
              <td key={i} className={cx("border border-line px-3 py-1 text-center", i === 0 ? "font-bold text-muted" : "font-semibold")}>
                <Inline tokens={parseInline(c)} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * none: plain plate (before answering); picked: chosen in a multiple select;
 * correct: the right answer; correct-unpicked: a right option the player left
 * out (multiple select), filled the same; wrong: a wrong pick; rest: revealed
 * and irrelevant.
 */
export type OptionMark = "none" | "picked" | "correct" | "wrong" | "correct-unpicked" | "rest";

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

/** Marks for the answer view: the key filled, wrong picks outlined, everything else dimmed. */
export function markOptions(rows: OptionRow[], keyIds: string[], pickedIds: string[], multi = false): Record<string, OptionMark> {
  const out: Record<string, OptionMark> = {};
  for (const r of rows) {
    const isKey = keyIds.includes(r.id);
    const picked = pickedIds.includes(r.id);
    out[r.id] = isKey ? (multi && !picked && pickedIds.length > 0 ? "correct-unpicked" : "correct") : picked ? "wrong" : "rest";
  }
  return out;
}

const BASE = "flex w-full items-center gap-3 rounded-[3px] text-left text-[17px] leading-6";

function optionClass(mark: OptionMark, tall: boolean): string {
  switch (mark) {
    case "correct":
    case "correct-unpicked":
      return cx(BASE, "min-h-[52px] bg-text py-2 pr-3 pl-4 font-semibold text-bg shadow-[0_3px_0_var(--color-muted)]");
    case "wrong":
      return cx(BASE, "min-h-[52px] bg-plate py-2 pr-3 pl-4 font-medium text-text shadow-[inset_0_0_0_2px_var(--color-wrong)]");
    case "rest":
      return cx(BASE, "min-h-12 bg-plate-dim py-2 pr-4 pl-[46px] font-medium text-muted");
    case "picked":
      return cx(BASE, tall ? "min-h-[60px]" : "min-h-[52px]", "bg-plate px-4 py-2 font-medium text-text shadow-[inset_0_0_0_2px_var(--color-text),0_3px_0_var(--color-edge)]");
    case "none":
      return cx(BASE, tall ? "min-h-[60px]" : "min-h-[52px]", "plate px-4 py-2 font-medium text-text");
  }
}

function Checkbox({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cx("flex size-[22px] shrink-0 items-center justify-center rounded-xs", on ? "bg-text text-bg" : "shadow-[inset_0_0_0_2px_var(--color-muted)]")}
    >
      {on ? <Icon name="check" size={16} stroke={3} /> : null}
    </span>
  );
}

export function OptionList({
  question,
  marks,
  onPick,
  disabled,
  pickedLabel,
  otherPicks,
  otherLabel,
  tall = false,
}: {
  question: Pick<QuestionPublic, "type" | "options" | "codeLang">;
  marks: Record<string, OptionMark>;
  onPick?: (id: string) => void;
  disabled?: boolean;
  /** Ids to tag YOU in the answer view. */
  pickedLabel?: string[];
  /** Another player's picks, tagged with their name in red (match detail). */
  otherPicks?: string[];
  otherLabel?: string;
  /** 60 px plates, as on the retry screen. */
  tall?: boolean;
}) {
  const rows = optionRows(question);
  const code = question.codeLang !== null;
  const tf = question.type === "truefalse";
  const multi = question.type === "multi";

  if (tf) {
    return (
      <div className="grid grid-cols-2 gap-2.5" role={onPick ? "group" : undefined}>
        {rows.map((r) => {
          const mark = marks[r.id] ?? "none";
          const cls = cx(optionClass(mark, tall), "h-24 justify-center px-3! font-display text-[32px] leading-9 font-bold!");
          const tags = (
            <>
              {pickedLabel?.includes(r.id) ? <NameTag name="You" who="you" className="absolute top-1.5 right-1.5" /> : null}
              {otherPicks?.includes(r.id) && otherLabel ? <NameTag name={otherLabel} who="opponent" className="absolute bottom-1.5 left-1.5 max-w-[80%]" /> : null}
            </>
          );
          const inner = (
            <>
              {mark === "correct" || mark === "correct-unpicked" ? <Icon name="check" size={20} stroke={2.6} className="shrink-0" /> : null}
              {mark === "wrong" ? <Icon name="x" size={20} stroke={2.6} className="shrink-0 text-wrong" /> : null}
              <span className={cx(mark === "wrong" && "line-through decoration-wrong decoration-2")}>{r.text}</span>
              {tags}
            </>
          );
          return onPick ? (
            <button key={r.id} type="button" className={cx(cls, "press relative")} onClick={() => onPick(r.id)} disabled={disabled} aria-pressed={mark === "picked"}>
              {inner}
            </button>
          ) : (
            <div key={r.id} className={cx(cls, "relative")}>
              {inner}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cx("flex flex-col", tall ? "gap-2.5" : "gap-2")} role={onPick ? "group" : undefined}>
      {rows.map((r) => {
        const mark = marks[r.id] ?? "none";
        const struck = mark === "wrong";
        const label = code ? (
          <pre className={cx("m-0 min-w-0 flex-1 overflow-hidden font-mono text-[13px] leading-snug break-words whitespace-pre-wrap", struck && "line-through decoration-wrong decoration-2")}>{r.text}</pre>
        ) : (
          <span className={cx("min-w-0 flex-1", struck && "line-through decoration-wrong decoration-2")}>
            <Inline tokens={parseInline(r.text)} />
          </span>
        );
        const content = (
          <>
            {multi && onPick ? <Checkbox on={mark === "picked"} /> : null}
            {mark === "correct" || mark === "correct-unpicked" ? <Icon name="check" size={18} stroke={2.6} className="shrink-0" /> : null}
            {mark === "wrong" ? <Icon name="x" size={18} stroke={2.6} className="shrink-0 text-wrong" /> : null}
            {label}
            {otherPicks?.includes(r.id) && otherLabel ? <NameTag name={otherLabel} who="opponent" className="shrink-0 max-w-[40%]" /> : null}
            {pickedLabel?.includes(r.id) ? <NameTag name="You" who="you" className="shrink-0" /> : null}
          </>
        );
        const cls = optionClass(mark, tall);
        return onPick ? (
          <button
            key={r.id}
            type="button"
            className={cx(cls, mark === "none" ? "press" : "transition-transform duration-[60ms] active:translate-y-[3px]")}
            onClick={() => onPick(r.id)}
            disabled={disabled}
            aria-pressed={multi ? mark === "picked" : undefined}
          >
            {content}
          </button>
        ) : (
          <div key={r.id} className={cls}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
