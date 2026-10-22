// user_prefs with defaults for users who never saved any.
import { eq } from "drizzle-orm";
import type { Prefs } from "../../../shared/api-schemas";
import { POWERUPS } from "../../../shared/game/config";
import type { PowerupId } from "../../../shared/game/types";
import { userPrefs } from "../schema";
import type { Db } from "./db";

export function defaultPrefs(): Prefs {
  return { loadout: [...POWERUPS.defaultLoadout] as PowerupId[], sound: true, courseId: null };
}

export async function getPrefs(db: Db, userId: string): Promise<Prefs> {
  const rows = await db.select().from(userPrefs).where(eq(userPrefs.userId, userId)).limit(1);
  const row = rows[0];
  if (!row) return defaultPrefs();
  const loadout = Array.isArray(row.loadoutJson) && row.loadoutJson.length === POWERUPS.loadoutSize
    ? row.loadoutJson
    : defaultPrefs().loadout;
  return { loadout, sound: row.sound, courseId: row.courseId ?? null };
}

/** Writes the full prefs row. */
export async function savePrefs(db: Db, userId: string, prefs: Prefs): Promise<void> {
  await db
    .insert(userPrefs)
    .values({ userId, loadoutJson: prefs.loadout, sound: prefs.sound, courseId: prefs.courseId })
    .onConflictDoUpdate({
      target: userPrefs.userId,
      set: { loadoutJson: prefs.loadout, sound: prefs.sound, courseId: prefs.courseId },
    });
}
