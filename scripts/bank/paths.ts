// Where things live. Everything in the game repo is resolved from this file's
// location, so the tool works from any working directory.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CLI_PATH = join(REPO_ROOT, "scripts", "quiz-bank.ts");
export const DEFAULT_FINGERPRINTS = join(REPO_ROOT, "bank", "fingerprints.json");
export const DEFAULT_BANK_JSON = join(REPO_ROOT, "bank", "bank.json");
export const DEFAULT_IMPORT_SQL = join(REPO_ROOT, "bank", "import.sql");

/** Quiz files live under this folder of the vault, one subfolder per course code. */
export const QUIZ_DIR = join("docs", "quiz");
/**
 * Folders of a course that hold the notes the `note` field can name, searched in
 * this order: Courses/<COURSE>/<folder>/<note>.md. The folder is also the path
 * segment of the note's URL on the notes site (spaces become hyphens).
 */
export const NOTE_FOLDERS = ["Lectures", "Book Notes", "Exercises"] as const;
export const NOTE_DIR = (course: string, folder: string = NOTE_FOLDERS[0]) => join("Courses", course, folder);
export const CONCEPTS_DIR = "Concepts";

const FALLBACK_NOTES_URL = "https://notes.swasilewski.com";

/** NOTES_URL from wrangler.jsonc `vars`, so the deep links follow the Worker config. */
export function notesUrl(): string {
  const path = join(REPO_ROOT, "wrangler.jsonc");
  if (!existsSync(path)) return FALLBACK_NOTES_URL;
  const match = /"NOTES_URL"\s*:\s*"([^"]+)"/.exec(readFileSync(path, "utf8"));
  return (match?.[1] ?? FALLBACK_NOTES_URL).replace(/\/+$/, "");
}
