// GET /me, PATCH /me, PUT /me/prefs. Mounted under /api by src/worker/index.ts.
import { Hono } from "hono";
import { and, eq, ne } from "drizzle-orm";
import {
  MeResponseSchema,
  PatchMeBodySchema,
  PutPrefsBodySchema,
  type MeResponse,
} from "../../shared/api-schemas";
import type { z } from "zod";
import { user } from "../db/schema";
import { activeMatchId, getActiveCourse, getDb, getPrefs, getUserById, isUniqueViolation, savePrefs, toMeUser } from "../db/queries";
import type { HonoEnv } from "../env";
import { fullName } from "../auth";
import { ApiFailure, currentUser, readJson } from "../middleware/http";
import { requireUser } from "../middleware/session";

export const meRoutes = new Hono<HonoEnv>();

meRoutes.get("/me", requireUser, async (c) => {
  const db = getDb(c.env);
  const me = currentUser(c);
  const [row, prefs, active] = await Promise.all([getUserById(db, me.id), getPrefs(db, me.id), activeMatchId(db, me.id)]);
  if (!row) throw new ApiFailure(401, "unauthorised", "Sign in first");
  const body: MeResponse = {
    user: toMeUser(row),
    prefs,
    needsOnboarding: !row.username,
    activeMatchId: active,
  };
  return c.json(MeResponseSchema.parse(body));
});

meRoutes.patch("/me", requireUser, async (c) => {
  const db = getDb(c.env);
  const me = currentUser(c);
  const body = await readJson(c, PatchMeBodySchema);
  const row = await getUserById(db, me.id);
  if (!row) throw new ApiFailure(401, "unauthorised", "Sign in first");

  const update: Partial<typeof user.$inferInsert> = { updatedAt: new Date() };
  if (body.username !== undefined) {
    const normalized = body.username.toLowerCase();
    const taken = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.username, normalized), ne(user.id, me.id)))
      .limit(1);
    if (taken.length > 0) throw new ApiFailure(409, "username_taken", "That username is taken");
    update.username = normalized;
    update.displayUsername = body.username;
  }
  const firstName = body.firstName ?? row.firstName;
  const lastName = body.lastName ?? row.lastName;
  if (body.firstName !== undefined) update.firstName = firstName;
  if (body.lastName !== undefined) update.lastName = lastName;
  if (body.firstName !== undefined || body.lastName !== undefined) update.name = fullName(firstName, lastName);

  try {
    await db.update(user).set(update).where(eq(user.id, me.id));
  } catch (err) {
    // Two requests racing for the same username: the unique index decides.
    if (isUniqueViolation(err)) throw new ApiFailure(409, "username_taken", "That username is taken");
    throw err;
  }
  const updated = await getUserById(db, me.id);
  return c.json({ user: toMeUser(updated!) });
});

meRoutes.put("/me/prefs", requireUser, async (c) => {
  const db = getDb(c.env);
  const me = currentUser(c);
  const body: z.output<typeof PutPrefsBodySchema> = await readJson(c, PutPrefsBodySchema);
  if (body.courseId) {
    const course = await getActiveCourse(db, body.courseId);
    if (!course) throw new ApiFailure(400, "bad_request", "Unknown course", { issues: [{ path: "courseId", message: "Unknown course" }] });
  }
  const current = await getPrefs(db, me.id);
  const prefs = {
    loadout: body.loadout ?? current.loadout,
    sound: body.sound ?? current.sound,
    courseId: body.courseId === undefined ? current.courseId : body.courseId,
  };
  await savePrefs(db, me.id, prefs);
  return c.json({ prefs });
});
