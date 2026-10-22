// Per-device preferences in localStorage. Every access is guarded: storage can
// throw in private windows or when blocked.
import { APP_SLUG } from "@shared/brand";

/** localStorage key for the sound toggle. The match screen reads the same key. */
export const SOUND_KEY = `${APP_SLUG}.sound`;
/** Last picked course, used before /me has loaded and for signed-out pages. */
export const COURSE_KEY = `${APP_SLUG}.course`;

export function readLocal(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Storage unavailable: the server-side pref still applies.
  }
}

/** Sound on unless this device turned it off. */
export function readSoundPref(): boolean | null {
  const v = readLocal(SOUND_KEY);
  return v === null ? null : v === "1";
}

export function writeSoundPref(on: boolean): void {
  writeLocal(SOUND_KEY, on ? "1" : "0");
}
