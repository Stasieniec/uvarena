// GET /bots?course=: Echo and the ladder with unlock flags.
import { Hono } from "hono";
import { z } from "zod";
import { BotsResponseSchema, CourseQuerySchema } from "../../shared/api-schemas";
import { BOT_LADDER, ECHO, ELO } from "../../shared/game/config";
import { getActiveCourse, getDb, ratingsFor } from "../db/queries";
import type { HonoEnv } from "../env";
import { currentUser, notFound, readQuery } from "../middleware/http";
import { requireUser } from "../middleware/session";

export const botsRoutes = new Hono<HonoEnv>();

type LadderItem = z.infer<typeof BotsResponseSchema>["ladder"][number];

/** The ladder for a player whose strongest beaten level is `highest` (0 for none). */
export function ladderFor(highest: number): LadderItem[] {
  return BOT_LADDER.map((b) => ({
    level: b.level,
    name: b.name,
    line: b.line,
    rating: b.rating,
    unlocked: b.level <= highest + 1,
    beaten: b.level <= highest,
  }));
}

/** The next ladder bot to beat; null when the ladder is done. */
export function nextBotFor(highest: number): LadderItem | null {
  return ladderFor(highest).find((b) => !b.beaten) ?? null;
}

/** Echo's strength: the player's bot rating (start value when none) plus ECHO.ratingOffset. */
export function echoRating(botRating: number | null | undefined): number {
  return Math.round((botRating ?? ELO.startBotRating) + ECHO.ratingOffset);
}

botsRoutes.get("/bots", requireUser, async (c) => {
  const db = getDb(c.env);
  const me = currentUser(c);
  const { course } = readQuery(c, CourseQuerySchema);
  if (!(await getActiveCourse(db, course))) throw notFound("Unknown course");
  const bot = (await ratingsFor(db, me.id, course)).get(course)?.bot;
  return c.json({
    courseId: course,
    echo: { name: ECHO.name, line: ECHO.line, rating: echoRating(bot?.rating) },
    ladder: ladderFor(bot?.highestBotLevel ?? 0),
  } satisfies z.infer<typeof BotsResponseSchema>);
});
