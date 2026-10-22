// POST /lobbies (create a private lobby) and POST /lobbies/join (by code).
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { CreateLobbyBodySchema, JoinLobbyBodySchema, type EndpointResponse } from "../../shared/api-schemas";
import { matches } from "../db/schema";
import { existingLectureIds, getActiveCourse, getDb, type Db } from "../db/queries";
import type { HonoEnv } from "../env";
import { createMatch, joinLobby } from "../match-factory";
import { ApiFailure, currentUser, notFound, readJson, requireUsername, rethrowFactoryError } from "../middleware/http";
import { requireUser } from "../middleware/session";
import { isTestMode } from "../middleware/test-mode";

export const lobbiesRoutes = new Hono<HonoEnv>();

/** Null or a de-duplicated list of lectures that all belong to the course; 400 otherwise. */
export async function validateLectureFilter(
  db: Db,
  courseId: string,
  lectures: string[] | null | undefined,
): Promise<string[] | null> {
  if (!lectures || lectures.length === 0) return null;
  const unique = [...new Set(lectures)];
  const found = await existingLectureIds(db, courseId, unique);
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new ApiFailure(400, "bad_request", "Unknown lecture", {
      issues: missing.map((id) => ({ path: "lectures", message: `Unknown lecture ${id}` })),
    });
  }
  return unique;
}

lobbiesRoutes.post("/lobbies", requireUser, async (c) => {
  const me = currentUser(c);
  requireUsername(me);
  const body = await readJson(c, CreateLobbyBodySchema);
  const db = getDb(c.env);
  if (!(await getActiveCourse(db, body.courseId))) throw notFound("Unknown course");
  const lectures = await validateLectureFilter(db, body.courseId, body.lectures);
  // Any custom setting makes the match unrated (design.md, private matches).
  const rated = body.rated && body.powerups && lectures === null;

  try {
    const result = await createMatch(c.env, {
      courseId: body.courseId,
      mode: "private",
      rated,
      settings: { powerups: body.powerups, lectures },
      humans: [me.id],
      testMode: isTestMode(c.env, c.req.raw),
    });
    if (!result.code) throw new Error("createMatch returned no join code for a private lobby");
    return c.json<EndpointResponse<"createLobby">>({ matchId: result.matchId, code: result.code, rated });
  } catch (err) {
    rethrowFactoryError(err);
  }
});

lobbiesRoutes.post("/lobbies/join", requireUser, async (c) => {
  const me = currentUser(c);
  requireUsername(me);
  const { code } = await readJson(c, JoinLobbyBodySchema);
  const db = getDb(c.env);

  // Idempotent for the people already in it: the host opening their own link,
  // or the guest tapping Join twice, land in the lobby.
  const existing = await db
    .select({ id: matches.id, playerA: matches.playerA, playerB: matches.playerB, status: matches.status })
    .from(matches)
    .where(eq(matches.joinCode, code))
    .limit(1);
  const row = existing[0];
  if (!row) throw notFound("No lobby with that code");
  if ((row.playerA === me.id || row.playerB === me.id) && (row.status === "lobby" || row.status === "active")) {
    return c.json<EndpointResponse<"joinLobby">>({ matchId: row.id });
  }
  if (row.status === "active") throw new ApiFailure(409, "lobby_full", "That match has already started");
  if (row.status !== "lobby") throw new ApiFailure(410, "lobby_expired", "That lobby has closed");

  try {
    const result = await joinLobby(c.env, code, me.id);
    return c.json<EndpointResponse<"joinLobby">>({ matchId: result.matchId });
  } catch (err) {
    rethrowFactoryError(err);
  }
});
