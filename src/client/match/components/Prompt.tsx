// Renders the small Markdown subset from prompt.ts.

import type { ReactNode } from "react";
import { parseBlocks, parseInline, type InlineToken } from "../prompt";

function Inline({ tokens, fill }: { tokens: InlineToken[]; fill?: ReactNode }): ReactNode {
  return tokens.map((t, i) => {
    switch (t.kind) {
      case "text":
        return <span key={i}>{t.text}</span>;
      case "code":
        return (
          <code key={i} className="rounded bg-black/35 px-1 py-0.5 font-mono text-[0.88em]">
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
        return (
          <span key={i} className="rq-blank" aria-label="blank">
            {fill ?? " "}
          </span>
        );
      case "not":
        return (
          <strong key={i} className="font-black tracking-wide text-wrong">
            NOT
          </strong>
        );
    }
  });
}

/** A question prompt: paragraphs and code blocks. `fill` goes into the cloze blank. */
export function Prompt({ text, fill, className }: { text: string; fill?: ReactNode; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={className}>
      {blocks.map((b, i) =>
        b.kind === "code" ? (
          <pre key={i} className="rq-code my-2 rounded-lg bg-black/40 p-2.5 text-[13px] leading-snug ring-1 ring-white/10">
            {b.text}
          </pre>
        ) : (
          <p key={i} className={i > 0 ? "mt-2" : undefined}>
            <Inline tokens={b.inline} fill={fill} />
          </p>
        ),
      )}
    </div>
  );
}

/** An option label: inline Markdown only. */
export function InlineText({ text }: { text: string }) {
  return <Inline tokens={parseInline(text)} />;
}
