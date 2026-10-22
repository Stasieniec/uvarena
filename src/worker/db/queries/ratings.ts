// Rating rows and the stats views built from them.
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import type { BotStatsSchema, RankedStatsSchema } from "../../../shared/api-schemas";
import { ELO, GLICKO } from "../../../shared/game/config";
import type { RatingKind } from "../../../shared/game/types";
import { ratings } from "../schema";
import type { Db } from "./db";

export type RatingRowDb = typeof ratings.$inferSelect;
export type RankedStats = z.infer<typeof RankedStatsSchema>;
export type BotStats = z.infer<typeof BotStatsSchema>;
export interface CasualStats {
  played: number;
  won: number;
  lost: number;
  drawn: number;
}

export type RatingsByKind = Partial<Record<RatingKind, RatingRowDb>>;

/** A user's rating rows, by course and kind. */
export async function ratingsFor(db: Db, userId: string, courseId?: string): Promise<Map<string, RatingsByKind>> {
  const where = courseId ? and(eq(ratings.userId, userId), eq(ratings.courseId, courseId)) : eq(ratings.userId, userId);
  const rows = await db.select().from(ratings).where(where);
  const byCourse = new Map<string, RatingsByKind>();
  for (const row of rows) {
    const entry = byCourse.get(row.courseId) ?? {};
    entry[row.kind] = row;
    byCourse.set(row.courseId, entry);
  }
  return byCourse;
}

/** Provisional while RD is at least GLICKO.provisionalRd (and with no rating at all). */
export function isRankedProvisional(rd: number | null | undefined): boolean {
  return rd == null || rd >= GLICKO.provisionalRd;
}

export function rankedStats(row: RatingRowDb | undefined): RankedStats {
  return {
    rating: row?.rating ?? null,
    provisional: isRankedProvisional(row?.rd),
    rd: row?.rd ?? null,
    played: row?.played ?? 0,
    won: row?.won ?? 0,
    lost: row?.lost ?? 0,
    drawn: row?.drawn ?? 0,
    surrendered: row?.surrendered ?? 0,
    abandoned: row?.abandoned ?? 0,
    curStreak: row?.curStreak ?? 0,
    bestStreak: row?.bestStreak ?? 0,
  };
}

export function botStats(row: RatingRowDb | undefined): BotStats {
  const n = row?.n ?? 0;
  return {
    rating: row?.rating ?? null,
    provisional: n < ELO.botProvisionalAnswers,
    n,
    played: row?.played ?? 0,
    won: row?.won ?? 0,
    lost: row?.lost ?? 0,
    drawn: row?.drawn ?? 0,
    highestBotLevel: row?.highestBotLevel ?? 0,
  };
}

export function casualStats(row: RatingRowDb | undefined): CasualStats {
  return { played: row?.played ?? 0, won: row?.won ?? 0, lost: row?.lost ?? 0, drawn: row?.drawn ?? 0 };
}
