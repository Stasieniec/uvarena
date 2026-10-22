// Test mode routes (TEST_MODE=1 and localhost only; 404 otherwise):
// POST /test/seed: the two courses, the fixture lectures and questions from
//   test/fixtures/questions.json, and users alice and bob (password
//   TEST_MODE.seedPassword) through Better Auth's own sign-up. Idempotent.
// POST /test/reset: empties every table except courses (users and sessions
//   included), so a test run starts clean. Run seed again afterwards.
import { Hono } from "hono";
import { BankFileSchema, type BankItem } from "../../shared/question-schema";
import { TEST_MODE } from "../../shared/game/config";
import type { z } from "zod";
import type { TestSeedResponseSchema } from "../../shared/api-schemas";
import fixtureJson from "../../../test/fixtures/questions.json";
import { lectures, questions } from "../db/schema";
import { getDb, getUserByUsername, savePrefs, defaultPrefs } from "../db/queries";
import type { HonoEnv } from "../env";
import { testModeOnly } from "../middleware/test-mode";
import { getAuth } from "../middleware/session";

type TestSeedResponse = z.infer<typeof TestSeedResponseSchema>;

export const testRoutes = new Hono<HonoEnv>();

testRoutes.use("/test/*", testModeOnly);

/** Same values as the seed in migrations/0000_init.sql (re-created if a test deleted them). */
const COURSES = [
  { id: "agai", code: "AGAI", title: "Agentic Artificial Intelligence", shortTitle: "Agentic AI", sort: 1 },
  { id: "eprm", code: "EPRM", title: "Engineering Production-Ready ML/AI Systems", shortTitle: "Engineering", sort: 2 },
] as const;

function questionRow(q: BankItem, now: number): typeof questions.$inferInsert {
  return {
    id: q.id,
    rev: q.rev,
    courseId: q.courseId,
    lectureId: q.lectureId,
    status: q.status,
    type: q.type,
    promptMd: q.prompt,
    statementMd: q.statement,
    codeLang: q.codeLang,
    optionsJson: q.options,
    targetsJson: q.targets,
    keyJson: q.key,
    shuffle: q.shuffle,
    whyMd: q.why,
    whyShort: q.whyShort,
    optionWhyJson: q.optionWhy,
    noteUrl: q.noteUrl,
    difficulty: q.difficulty,
    level: q.level,
    topicsJson: q.topics,
    timeS: q.timeS,
    words: q.words,
    chance: q.chance,
    startRating: q.startRating,
    rating: q.startRating,
    ratingN: 0,
    attempts: 0,
    correct: 0,
    fingerprint: q.fingerprint,
    contentHash: q.contentHash,
    sourcePath: q.sourcePath,
    createdAt: now,
    updatedAt: now,
  };
}

testRoutes.post("/test/seed", async (c) => {
  const db = getDb(c.env);
  const bank = BankFileSchema.parse(fixtureJson);
  const now = Date.now();

  const statements = [
    ...COURSES.map((co) =>
      c.env.DB.prepare(
        "INSERT INTO courses (id, code, title, short_title, active, sort) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(id) DO NOTHING",
      ).bind(co.id, co.code, co.title, co.shortTitle, co.sort),
    ),
  ];
  await c.env.DB.batch(statements);

  for (const l of bank.lectures) {
    await db
      .insert(lectures)
      .values({ id: l.id, courseId: l.courseId, title: l.title, sort: l.sort, noteUrl: l.noteUrl })
      .onConflictDoUpdate({ target: lectures.id, set: { title: l.title, sort: l.sort, noteUrl: l.noteUrl } });
  }
  for (const q of bank.questions) {
    const row = questionRow(q, now);
    const { id: _id, createdAt: _created, ...update } = row;
    await db.insert(questions).values(row).onConflictDoUpdate({ target: questions.id, set: update });
  }

  const auth = getAuth(c);
  const users: TestSeedResponse["users"] = [];
  for (const name of TEST_MODE.seedUsers) {
    let row = await getUserByUsername(db, name);
    if (!row) {
      const first = name.charAt(0).toUpperCase() + name.slice(1);
      await auth.api.signUpEmail({
        body: {
          email: `${name}@example.com`,
          password: TEST_MODE.seedPassword,
          name: `${first} Test`,
          username: name,
          firstName: first,
          lastName: "Test",
        },
      });
      row = await getUserByUsername(db, name);
      if (!row) throw new Error(`test seed: could not create ${name}`);
      await savePrefs(db, row.id, defaultPrefs());
    }
    users.push({ id: row.id, username: row.username ?? name });
  }

  const body: TestSeedResponse = { ok: true, users, questions: bank.questions.length };
  return c.json(body);
});

/** Children before parents; courses stay (seeded by the migration). */
const RESET_TABLES = [
  "match_rounds",
  "answers",
  "match_finalizations",
  "missed_questions",
  "question_reports",
  "question_imports",
  "ratings",
  "player_course",
  "user_prefs",
  "matches",
  "questions",
  "lectures",
  "session",
  "account",
  "verification",
  "user",
] as const;

testRoutes.post("/test/reset", async (c) => {
  await c.env.DB.batch(RESET_TABLES.map((t) => c.env.DB.prepare(`DELETE FROM "${t}"`)));
  return c.json({ ok: true as const });
});
