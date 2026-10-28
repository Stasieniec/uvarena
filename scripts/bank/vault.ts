// Vault lookups: lecture notes, their headings, concept notes, and the URL
// rules of the published notes site (Quartz).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { CONCEPTS_DIR, NOTE_DIR, NOTE_FOLDERS } from "./paths";

/**
 * Quartz's file slug: whitespace becomes "-", so "EPRM-W05 - Telemetry" becomes
 * "EPRM-W05---Telemetry". Checked against notes.swasilewski.com on 2026-10-22.
 */
export function noteSlug(stem: string): string {
  return stem
    .replace(/\s/g, "-")
    .replace(/&/g, "-and-")
    .replace(/%/g, "-percent")
    .replace(/\?/g, "")
    .replace(/#/g, "");
}

/** github-slugger's heading anchor: lowercase, punctuation removed, spaces to hyphens. */
export function headingAnchor(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

/** Markdown headings outside code fences, with inline markup stripped. */
export function noteHeadings(markdown: string): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of markdown.split("\n")) {
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) {
      if (fence === null) fence = f[1]![0]!;
      else if (f[1]![0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) out.push(stripInline(m[1]!));
  }
  return out;
}

function stripInline(s: string): string {
  return s
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();
}

export interface NoteInfo {
  stem: string;
  /** Course subfolder the note lives in, e.g. "Lectures" or "Book Notes". */
  folder: string;
  path: string;
  headings: string[];
  anchors: Set<string>;
}

/**
 * Lazily reads the vault: lecture notes by course and stem, and the names and
 * aliases of concept notes. One instance per run.
 */
export class Vault {
  private readonly notes = new Map<string, NoteInfo | null>();
  private conceptNames: Set<string> | null = null;

  constructor(readonly root: string) {}

  note(course: string, stem: string): NoteInfo | null {
    const key = `${course}/${stem}`;
    if (!this.notes.has(key)) {
      const folder = NOTE_FOLDERS.find((f) => existsSync(join(this.root, NOTE_DIR(course, f), `${stem}.md`)));
      if (folder === undefined) {
        this.notes.set(key, null);
      } else {
        const path = join(this.root, NOTE_DIR(course, folder), `${stem}.md`);
        const headings = noteHeadings(readFileSync(path, "utf8"));
        this.notes.set(key, { stem, folder, path, headings, anchors: new Set(headings.map(headingAnchor)) });
      }
    }
    return this.notes.get(key) ?? null;
  }

  /** Lowercased concept note stems and their frontmatter aliases. */
  concepts(): Set<string> {
    if (this.conceptNames) return this.conceptNames;
    const names = new Set<string>();
    const dir = join(this.root, CONCEPTS_DIR);
    if (existsSync(dir)) {
      for (const entry of readdirSync(dir)) {
        if (!entry.endsWith(".md")) continue;
        names.add(entry.slice(0, -3).toLowerCase());
        for (const alias of frontmatterAliases(readFileSync(join(dir, entry), "utf8"))) names.add(alias.toLowerCase());
      }
    }
    this.conceptNames = names;
    return names;
  }
}

function frontmatterAliases(markdown: string): string[] {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!m) return [];
  try {
    const fm = parseYaml(m[1]!) as { aliases?: unknown } | null;
    const aliases = fm?.aliases;
    if (Array.isArray(aliases)) return aliases.filter((a): a is string => typeof a === "string");
    if (typeof aliases === "string") return [aliases];
  } catch {
    // A broken frontmatter only costs us its aliases.
  }
  return [];
}
