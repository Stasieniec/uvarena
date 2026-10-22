// A deliberately small Markdown subset for question prompts and options:
// paragraphs, fenced code blocks, `inline code`, **bold**, *italic*, the cloze
// blank (three or more underscores) and the word NOT in capitals, which the
// screen shows in bold red (design.md: under a timer it is easy to misread).
// Pure, so it is tested in Node; Prompt.tsx renders the tokens.

export type InlineToken =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "bold"; children: InlineToken[] }
  | { kind: "italic"; children: InlineToken[] }
  | { kind: "blank" }
  | { kind: "not"; text: string };

export type Block = { kind: "para"; inline: InlineToken[] } | { kind: "code"; lang: string | null; text: string };

const FENCE = /^```\s*([A-Za-z0-9_+-]*)\s*$/;

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    const text = para.join("\n").trim();
    if (text) blocks.push({ kind: "para", inline: parseInline(text) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = FENCE.exec(line.trim());
    if (fence) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!.trim())) {
        code.push(lines[i]!);
        i++;
      }
      blocks.push({ kind: "code", lang: fence[1] || null, text: code.join("\n") });
      continue;
    }
    if (line.trim() === "") flush();
    else para.push(line);
  }
  flush();
  return blocks;
}

/** Splits plain text on the cloze blank and the capital word NOT. */
function splitPlain(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  const re = /_{3,}|\bNOT\b/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    out.push(m[0] === "NOT" ? { kind: "not", text: "NOT" } : { kind: "blank" });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

export function parseInline(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push(...splitPlain(buf));
    buf = "";
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "\\" && i + 1 < text.length) {
      buf += text[i + 1];
      i += 2;
      continue;
    }
    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        flush();
        out.push({ kind: "code", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        const inner = text.slice(i + 2, end);
        out.push(inner.trim() === "NOT" ? { kind: "not", text: "NOT" } : { kind: "bold", children: parseInline(inner) });
        i = end + 2;
        continue;
      }
    }
    // *italic* (single star). Underscore italics are left alone: the cloze blank uses underscores.
    if (ch === "*" && text[i + 1] !== " ") {
      const end = text.indexOf("*", i + 1);
      if (end > i + 1 && text[end - 1] !== " ") {
        flush();
        out.push({ kind: "italic", children: parseInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

/** True when the text contains a cloze blank. */
export function hasBlank(tokens: InlineToken[]): boolean {
  return tokens.some((t) => t.kind === "blank" || ((t.kind === "bold" || t.kind === "italic") && hasBlank(t.children)));
}
