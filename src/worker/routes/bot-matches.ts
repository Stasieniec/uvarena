// POST /bot-matches: a bot match against Echo, a ladder bot, or (test mode
// only) the Dummy and Oracle Bot.
import { Hono } from "hono";
import { CreateBotMatchBodySchema, type EndpointResponse } from "../../shared/api-schemas";
import { TEST_BOTS } from "../../shared/game/config";
import type { BotLevel } from "../../shared/game/types";
import type { CreateMatchSpec } from "../do/contracts";
import { getActiveCourse, getDb, ratingsFor } from "../db/queries";
import type { HonoEnv } from "../env";
import { createMatch } from "../match-factory";
import { ApiFailure, currentUser, notFound, readJson, requireUsername, rethrowFactoryError } from "../middleware/http";
import { requireUser } from "../middleware/session";
import { isTestMode } from "../middleware/test-mode";
import { validateLectureFilter } from "./lobbies";

export const botMatchesRoutes = new Hono<HonoEnv>();

const TEST_LEVELS: readonly number[] = [TEST_BOTS.dummy.level, TEST_BOTS.oracle.level];

botMatchesRoutes.post("/bot-matches", requireUser, async (c) => {
  const me = currentUser(c);
  requireUsername(me);
  const body = await readJson(c, CreateBotMatchBodySchema);
  const db = getDb(c.env);
  const testMode = isTestMode(c.env, c.req.raw);

  if (!(await getActiveCourse(db, body.courseId))) throw notFound("Unknown course");
  const lectures = await validateLectureFilter(db, body.courseId, body.lectures);

  let bot: NonNullable<CreateMatchSpec["bot"]>;
  if (body.bot === "echo") {
    bot = { level: "echo" };
  } else if (TEST_LEVELS.includes(body.bot)) {
    if (!testMode) throw new ApiFailure(400, "bad_request", "Unknown bot");
    bot = { level: body.bot as Exclude<BotLevel, -1> };
  } else {
    const highest = (await ratingsFor(db, me.id, body.courseId)).get(body.courseId)?.bot?.highestBotLevel ?? 0;
    if (body.bot > highest + 1) throw new ApiFailure(403, "bot_locked", "Beat the bot before this one first");
    bot = { level: body.bot as Exclude<BotLevel, -1> };
  }

  try {
    const result = await createMatch(c.env, {
      courseId: body.courseId,
      mode: "bot",
      rated: false,
      settings: { powerups: true, lectures },
      humans: [me.id],
      bot,
      testMode,
    });
    return c.json<EndpointResponse<"createBotMatch">>({ matchId: result.matchId });
  } catch (err) {
    rethrowFactoryError(err);
  }
});
