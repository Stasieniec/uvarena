// Migration 0001 (four power-ups, Engineering removed) and the bank import's
// course filter, against a real SQLite built from the D1 migrations.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { buildBank } from "../../../scripts/bank/commands";
import { onlyActiveCourses, planImport, planSql, SELECT_ACTIVE_COURSES, SELECT_LECTURES, SELECT_QUESTIONS } from "../../../scripts/bank/sql";
import { AGAI_FILE, EPRM_FILE, agaiHeader, check, errors, makeVault, single, truefalse } from "./helpers";

const read = (name: string) => readFileSync(new URL(`../../../migrations/${name}`, import.meta.url), "utf8");
const M0000 = read("0000_init.sql");
const M0001 = read("0001_four_powerups_one_course.sql");

type Row = Record<string, unknown>;
const rows = (db: DatabaseSync, sql: string) => (db.prepare(sql).all() as Row[]).map((r) => ({ ...r }));

function db0000(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(M0000);
  return db;
}

function addUser(db: DatabaseSync, id: string, loadout: string, courseId: string | null): void {
  db.prepare("INSERT INTO user (id, name, email, first_name, last_name) VALUES (?, ?, ?, 'A', 'B')").run(id, id, `${id}@example.com`);
  db.prepare("INSERT INTO user_prefs (user_id, loadout_json, sound, course_id) VALUES (?, ?, 1, ?)").run(id, loadout, courseId);
}

function addEprmContent(db: DatabaseSync): void {
  db.exec("INSERT INTO lectures (id, course_id, title, sort) VALUES ('EPRM-W02', 'eprm', 'W02', 2)");
  db.exec(`INSERT INTO questions (id, course_id, lecture_id, type, key_json, why_md, why_short, difficulty, level, chance, start_rating,
    rating, fingerprint, content_hash, source_path, created_at, updated_at)
    VALUES ('eprm-2a3b4c', 'eprm', 'EPRM-W02', 'truefalse', '{"kind":"bool","value":true}', 'w', 'w', 'easy', 'remember', 0.5, 1300,
    1300, 'f', 'h', 'docs/quiz/EPRM/EPRM-W02.quiz.yaml', 1, 1)`);
}

describe("migration 0001", () => {
  it("removes Engineering from a fresh database and leaves Agentic AI", () => {
    const db = db0000();
    db.exec(M0001);
    expect(rows(db, "SELECT id, active FROM courses")).toEqual([{ id: "agai", active: 1 }]);
    expect(rows(db, SELECT_ACTIVE_COURSES)).toEqual([{ id: "agai", code: "AGAI" }]);
  });

  it("removes Engineering's lectures and questions when no match was played in it", () => {
    const db = db0000();
    addEprmContent(db);
    addUser(db, "u1", '["zeus","aegis","oracle"]', "eprm");
    db.exec(M0001);
    expect(rows(db, "SELECT id FROM courses")).toEqual([{ id: "agai" }]);
    expect(rows(db, "SELECT id FROM lectures")).toEqual([]);
    expect(rows(db, "SELECT id FROM questions")).toEqual([]);
    expect(rows(db, "SELECT course_id FROM user_prefs")).toEqual([{ course_id: null }]);
  });

  it("keeps a course with match history, switched off, with its questions retired", () => {
    const db = db0000();
    addEprmContent(db);
    db.exec(`INSERT INTO matches (id, course_id, mode, rated, status, player_a, settings_json, created_at)
      VALUES ('m1', 'eprm', 'bot', 1, 'finished', 'u1', '{"powerups":true,"lectures":null}', 1)`);
    db.exec(M0001);
    expect(rows(db, "SELECT id, active FROM courses ORDER BY id")).toEqual([
      { id: "agai", active: 1 },
      { id: "eprm", active: 0 },
    ]);
    expect(rows(db, "SELECT id, status FROM questions")).toEqual([{ id: "eprm-2a3b4c", status: "retired" }]);
  });

  it("maps saved loadouts to the new power-ups, and resets one with a removed power-up", () => {
    const db = db0000();
    addUser(db, "u1", '["zeus","aegis","oracle"]', "agai");
    addUser(db, "u2", '["hermes","oracle","zeus"]', null);
    addUser(db, "u3", '["nemesis","zeus","phoenix"]', null);
    db.exec(M0001);
    expect(rows(db, "SELECT user_id, loadout_json, course_id FROM user_prefs ORDER BY user_id")).toEqual([
      { user_id: "u1", loadout_json: '["bibi","shield","fifty"]', course_id: "agai" },
      { user_id: "u2", loadout_json: '["fast","fifty","bibi"]', course_id: null },
      { user_id: "u3", loadout_json: '["bibi","shield","fifty"]', course_id: null },
    ]);
    addUser(db, "u4", '["shield","fast","bibi"]', null);
    db.exec("INSERT INTO user (id, name, email, first_name, last_name) VALUES ('u5', 'u5', 'u5@example.com', 'A', 'B')");
    db.exec("INSERT INTO user_prefs (user_id) VALUES ('u5')");
    expect(rows(db, "SELECT loadout_json FROM user_prefs WHERE user_id = 'u5'")).toEqual([{ loadout_json: '["bibi","shield","fifty"]' }]);
  });
});

describe("bank import course filter", () => {
  const eprmBody = `course: EPRM\nlecture: EPRM-W02\ntitle: W02\nquestions:\n${truefalse("eprm-5d6e7f", "Spark runs transformations eagerly.")}`;

  it("skips quiz files of courses that are not active, without an error", () => {
    const vault = makeVault({ [AGAI_FILE]: agaiHeader() + single("agai-2a3b4c"), [EPRM_FILE]: eprmBody });
    const result = check(vault);
    expect(errors(result)).toEqual([]);
    const full = buildBank(result, "abc123", 1_000);
    expect(full.questions.map((q) => q.courseId).sort()).toEqual(["agai", "eprm"]);

    const db = db0000();
    db.exec(M0001);
    const active = rows(db, SELECT_ACTIVE_COURSES).map((r) => String(r.id));
    const { bank, skipped } = onlyActiveCourses(full, active);
    expect(skipped).toEqual([{ code: "EPRM", lectures: 1, questions: 1 }]);
    expect(bank.questions.map((q) => q.id)).toEqual(["agai-2a3b4c"]);

    const plan = planImport({
      bank,
      dbQuestions: db.prepare(SELECT_QUESTIONS).all() as Row[],
      dbLectures: db.prepare(SELECT_LECTURES).all() as Row[],
      now: 2_000,
      importId: "imp-1",
    });
    db.exec(planSql(plan, "test"));
    expect(rows(db, "SELECT id, course_id FROM questions")).toEqual([{ id: "agai-2a3b4c", course_id: "agai" }]);
    expect(rows(db, "SELECT id FROM lectures")).toEqual([{ id: "AGAI-starter-games" }]);
  });

  it("imports a course again once a migration makes it active", () => {
    const vault = makeVault({ [AGAI_FILE]: agaiHeader() + single("agai-2a3b4c"), [EPRM_FILE]: eprmBody });
    const full = buildBank(check(vault), null, 1_000);
    const { bank, skipped } = onlyActiveCourses(full, ["agai", "eprm"]);
    expect(skipped).toEqual([]);
    expect(bank.questions).toHaveLength(2);
  });
});
