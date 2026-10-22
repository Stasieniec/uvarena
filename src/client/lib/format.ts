// Display formatting. Pure functions, unit tested.
import { BOT_LADDER, ECHO, GLICKO, LIMITS } from "@shared/game/config";

/** "1540?" while provisional, "1540" after. A missing rating shows the start value. */
export function formatRating(rating: number | null, provisional: boolean, start: number = GLICKO.startRating): string {
  const value = Math.round(rating ?? start);
  return provisional || rating === null ? `${value}?` : String(value);
}

/** "+162", "-14", "0". */
export function formatDelta(delta: number): string {
  const d = Math.round(delta);
  if (d > 0) return `+${d}`;
  if (d < 0) return `−${Math.abs(d)}`;
  return "0";
}

/** "1,800" with a thin, locale-free thousands separator. */
export function formatNumber(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "0:07", "1:32", "12:05". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** "4.2 s" from milliseconds. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 min ago", "3 h ago", "yesterday", "3 days ago", then a date. */
export function formatAgo(at: number, now: number = Date.now()): string {
  const d = Math.max(0, now - at);
  if (d < MINUTE) return "just now";
  if (d < HOUR) return `${Math.floor(d / MINUTE)} min ago`;
  if (d < DAY) return `${Math.floor(d / HOUR)} h ago`;
  const days = Math.floor(d / DAY);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return formatDate(at);
}

/** "12 Oct" this year, "12 Oct 2025" otherwise. */
export function formatDate(at: number, now: number = Date.now()): string {
  const date = new Date(at);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/** Two initials from first name and surname, falling back to the username. */
export function initials(firstName: string | null | undefined, lastName: string | null | undefined, username?: string | null): string {
  const a = firstName?.trim()?.[0] ?? "";
  const b = lastName?.trim()?.[0] ?? "";
  const s = (a + b).toUpperCase();
  if (s) return s;
  return (username ?? "?").slice(0, 2).toUpperCase();
}

/** Stable hue (0 to 359) from a string, for the initials circle. */
export function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Bot name by level, including Echo. Null for 0 (none beaten). */
export function botName(level: number): string | null {
  if (level === ECHO.level) return ECHO.name;
  return BOT_LADDER.find((b) => b.level === level)?.name ?? null;
}

/** Keeps only characters a join code can contain, upper-cased, at most joinCodeLength. */
export function normaliseJoinCode(input: string): string {
  const allowed = new Set(LIMITS.joinCodeAlphabet);
  let out = "";
  for (const ch of input.toUpperCase()) {
    if (allowed.has(ch)) out += ch;
    if (out.length === LIMITS.joinCodeLength) break;
  }
  return out;
}

/** Percentage 0 to 100, 0 when there is nothing to divide. */
export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
