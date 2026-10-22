// Small pure formatters for the match screen. No DOM, so Node tests can use them.

import type { ShownRating } from "@shared/protocol";

const intFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** 1800 -> "1,800". */
export function fmtInt(n: number): string {
  return intFormat.format(Math.round(n));
}

/** Signed with a real minus sign: "+162", "-40", "0". */
export function fmtSigned(n: number): string {
  const r = Math.round(n);
  if (r > 0) return `+${fmtInt(r)}`;
  if (r < 0) return `−${fmtInt(-r)}`;
  return "0";
}

/** "1540?" for a provisional rating, "1540" otherwise. */
export function fmtRating(value: number, provisional: boolean): string {
  return `${Math.round(value)}${provisional ? "?" : ""}`;
}

export function fmtShownRating(r: ShownRating | null): string | null {
  return r ? fmtRating(r.value, r.provisional) : null;
}

/** 3240 -> "3.2 s". */
export function fmtSeconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
}

/** Remaining time as m:ss, rounded up so "0:00" only shows at the end. */
export function fmtClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Whole seconds left, rounded up. */
export function secondsLeft(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}

/** 2 -> "x2", 1.5 -> "x1.5". */
export function fmtMultiplier(m: number): string {
  return `x${Number.isInteger(m) ? m : m.toFixed(1)}`;
}

/** Up to two initials from a username or display name. */
export function initials(name: string): string {
  const parts = name
    .replace(/[^A-Za-z0-9 _.]/g, "")
    .split(/[\s_.]+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

const AVATAR_HUES = [12, 38, 160, 190, 215, 250, 285, 320, 345];

/** A stable hue for the initials circle, from the name. */
export function avatarHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length]!;
}
