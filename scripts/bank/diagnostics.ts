// Errors and warnings with a file and line, printed as `path:line: error: message`.
import { isAbsolute, relative } from "node:path";

export type Severity = "error" | "warning";

export interface Diagnostic {
  severity: Severity;
  /** Absolute path of the file the problem is in. */
  file: string;
  /** 1-based; 0 when the problem has no line (a whole-file or bank-level problem). */
  line: number;
  message: string;
  /** Which question, for example `question 4 (agai-3f9k2m)`. */
  where?: string;
}

export class Diagnostics {
  readonly list: Diagnostic[] = [];
  private readonly seen = new Set<string>();

  add(d: Diagnostic): void {
    const key = `${d.severity}|${d.file}|${d.line}|${d.message}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.list.push(d);
  }

  error(file: string, line: number, message: string, where?: string): void {
    this.add({ severity: "error", file, line, message, where });
  }

  warn(file: string, line: number, message: string, where?: string): void {
    this.add({ severity: "warning", file, line, message, where });
  }

  get errors(): Diagnostic[] {
    return this.list.filter((d) => d.severity === "error");
  }

  get warnings(): Diagnostic[] {
    return this.list.filter((d) => d.severity === "warning");
  }

  sorted(): Diagnostic[] {
    return [...this.list].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.severity.localeCompare(b.severity));
  }
}

/** Relative to the working directory when the file is under it, absolute otherwise, so editors can open it. */
export function displayPath(file: string, cwd = process.env.INIT_CWD ?? process.cwd()): string {
  if (cwd === "/") return file;
  const rel = relative(cwd, file);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return file;
  return rel;
}

export function formatDiagnostic(d: Diagnostic, cwd = process.env.INIT_CWD ?? process.cwd()): string {
  const loc = d.line > 0 ? `${displayPath(d.file, cwd)}:${d.line}` : displayPath(d.file, cwd);
  const where = d.where ? ` [${d.where}]` : "";
  return `${loc}: ${d.severity}: ${d.message}${where}`;
}
