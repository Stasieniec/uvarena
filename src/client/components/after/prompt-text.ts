// Pure helpers for question prompts outside a match: Markdown tables (the
// 2x2 payoff matrices) pulled out of the text, and a one-line preview.

/** A one-line preview of a prompt: a Markdown table and what follows it are left out. */
export function plainPreview(text: string): string {
  const cut = text.replace(/\s*\|.*$/s, "").trim();
  return cut || text;
}

type Segment = { kind: "text"; text: string } | { kind: "table"; rows: string[][] };

/** Pulls Markdown tables (runs of lines starting with "|", outside code fences) out of a prompt. */
export function splitTables(text: string): Segment[] {
  const out: Segment[] = [];
  let buf: string[] = [];
  let table: string[] = [];
  let fence = false;
  const flushText = () => {
    if (buf.join("").trim()) out.push({ kind: "text", text: buf.join("\n") });
    buf = [];
  };
  const flushTable = () => {
    const rows = table
      .filter((l) => !/^\|?\s*:?-{2,}/.test(l.trim()))
      .map((l) =>
        l
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim()),
      );
    if (rows.length > 0) out.push({ kind: "table", rows });
    table = [];
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.trim().startsWith("```")) fence = !fence;
    if (!fence && line.trim().startsWith("|")) {
      if (buf.length) flushText();
      table.push(line);
    } else {
      if (table.length) flushTable();
      buf.push(line);
    }
  }
  if (table.length) flushTable();
  flushText();
  return out;
}
