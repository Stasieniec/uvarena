// Import SQL against a real SQLite built from the D1 migration (node:sqlite).
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { buildBank } from "../../../scripts/bank/commands";
import { planImport, planSql, SELECT_LECTURES, SELECT_QUESTIONS, type ImportPlan } from "../../../scripts/bank/sql";
import type { BankFile } from "../../../src/shared/question-schema";
import { AGAI_FILE, agaiHeader, check, errors, makeVault, multi, single, truefalse } from "./helpers";

const MIGRATION = readFileSync(new URL("../../../migrations/0000_init.sql", import.meta.url), "utf8");

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(MIGRATION);
  return db;
}

function bankOf(body: string, now = 1_000): BankFile {
  const vault = makeVault({ [AGAI_FILE]: agaiHeader() + body });
  const result = check(vault);
  expect(errors(result)).toEqual([]);
  return buildBank(result, "abc123", now);
}

let clock = 10_000;
function importInto(db: DatabaseSync, bank: BankFile): ImportPlan {
  clock += 1_000;
  const plan = planImport({
    bank,
    dbQuestions: db.prepare(SELECT_QUESTIONS).all() as Record<string, unknown>[],
    dbLectures: db.prepare(SELECT_LECTURES).all() as Record<string, unknown>[],
    now: clock,
    importId: `imp-${clock}`,
  });
  db.exec(planSql(plan, "test"));
  return plan;
}

const counts = (p: ImportPlan) => ({
  added: p.added.length,
  changed: p.changed.length,
  revBumped: p.revBumped.length,
  retired: p.retired.length,
  unchanged: p.unchanged.length,
});

type Row = Record<string, unknown>;
const row = (db: DatabaseSync, id: string) => db.prepare("SELECT * FROM questions WHERE id = ?").get(id) as Row;

const BODY = single("agai-2a3b4c") + truefalse("agai-5d6e7f") + multi("agai-8g9h2j");

describe("import SQL", () => {
  it("adds everything on the first run and reports everything unchanged on the second", () => {
    const db = freshDb();
    const bank = bankOf(BODY);
    expect(counts(importInto(db, bank))).toEqual({ added: 3, changed: 0, revBumped: 0, retired: 0, unchanged: 0 });
    const q = row(db, "agai-2a3b4c");
    expect(q.rating).toBe(1300);
    expect(q.status).toBe("active");
    expect(JSON.parse(String(q.key_json))).toEqual({ kind: "options", ids: ["a"] });
    expect((db.prepare("SELECT * FROM lectures").all() as Row[]).map((l) => l.id)).toEqual(["AGAI-starter-games"]);

    const again = importInto(db, bankOf(BODY, 99_999));
    expect(counts(again)).toEqual({ added: 0, changed: 0, revBumped: 0, retired: 0, unchanged: 3 });
    expect(again.statements).toHaveLength(1);
    expect(again.statements[0]).toMatch(/^INSERT INTO question_imports/);
    expect(row(db, "agai-2a3b4c").updated_at).toBe(q.updated_at);
    const imports = db.prepare("SELECT added, unchanged, vault_commit FROM question_imports ORDER BY imported_at").all() as Row[];
    expect(imports.map((r) => ({ ...r }))).toEqual([
      { added: 3, unchanged: 0, vault_commit: "abc123" },
      { added: 0, unchanged: 3, vault_commit: "abc123" },
    ]);
  });

  it("updates text without touching ratings or counters", () => {
    const db = freshDb();
    importInto(db, bankOf(BODY));
    db.exec("UPDATE questions SET rating = 1234.5, rating_n = 7, attempts = 9, correct = 4");
    const before = row(db, "agai-2a3b4c");
    const edited = single("agai-2a3b4c", { prompt: "Reworded, what holds for each strategy?" }) + truefalse("agai-5d6e7f") + multi("agai-8g9h2j");
    expect(counts(importInto(db, bankOf(edited)))).toEqual({ added: 0, changed: 1, revBumped: 0, retired: 0, unchanged: 2 });
    const after = row(db, "agai-2a3b4c");
    expect(after.prompt_md).toBe("Reworded, what holds for each strategy?");
    expect([after.rating, after.rating_n, after.attempts, after.correct]).toEqual([1234.5, 7, 9, 4]);
    expect(after.created_at).toBe(before.created_at);
    expect(Number(after.updated_at)).toBeGreaterThan(Number(before.updated_at));
  });

  it("resets the rating on a rev change, and only the rating", () => {
    const db = freshDb();
    importInto(db, bankOf(BODY));
    db.exec("UPDATE questions SET rating = 1234.5, rating_n = 7, attempts = 9, correct = 4");
    const bumped = single("agai-2a3b4c") + truefalse("agai-5d6e7f", undefined, "true").replace("    type: truefalse\n", "    type: truefalse\n    rev: 2\n") + multi("agai-8g9h2j");
    expect(counts(importInto(db, bankOf(bumped)))).toEqual({ added: 0, changed: 0, revBumped: 1, retired: 0, unchanged: 2 });
    const tf = row(db, "agai-5d6e7f");
    expect([tf.rev, tf.rating, tf.rating_n, tf.attempts, tf.correct]).toEqual([2, 1500, 0, 9, 4]);
    expect(JSON.parse(String(tf.key_json))).toEqual({ kind: "bool", value: true });
    expect(row(db, "agai-2a3b4c").rating).toBe(1234.5);
  });

  it("retires questions that left the bank or were retired, never deletes them, and can bring them back", () => {
    const db = freshDb();
    importInto(db, bankOf(BODY));
    db.exec("UPDATE questions SET rating = 1234.5");
    const fewer = single("agai-2a3b4c").replace("    type: single\n", "    status: retired\n    type: single\n") + truefalse("agai-5d6e7f");
    const plan = importInto(db, bankOf(fewer));
    expect(counts(plan)).toEqual({ added: 0, changed: 0, revBumped: 0, retired: 2, unchanged: 1 });
    expect(plan.statements.join("\n")).not.toMatch(/\bDELETE\b/i);
    expect((db.prepare("SELECT id, status, rating FROM questions ORDER BY id").all() as Row[]).map((r) => ({ ...r }))).toEqual([
      { id: "agai-2a3b4c", status: "retired", rating: 1234.5 },
      { id: "agai-5d6e7f", status: "active", rating: 1234.5 },
      { id: "agai-8g9h2j", status: "retired", rating: 1234.5 },
    ]);
    expect(counts(importInto(db, bankOf(fewer)))).toEqual({ added: 0, changed: 0, revBumped: 0, retired: 0, unchanged: 2 });
    expect(counts(importInto(db, bankOf(BODY)))).toEqual({ added: 0, changed: 2, revBumped: 0, retired: 0, unchanged: 1 });
    expect(row(db, "agai-8g9h2j").status).toBe("active");
  });

  it("skips questions that are retired before they ever reached D1", () => {
    const db = freshDb();
    const plan = importInto(db, bankOf(single("agai-2a3b4c").replace("    type: single\n", "    status: retired\n    type: single\n")));
    expect(counts(plan)).toEqual({ added: 0, changed: 0, revBumped: 0, retired: 0, unchanged: 0 });
    expect(db.prepare("SELECT count(*) AS n FROM questions").get()).toEqual({ n: 0 });
  });

  it("round-trips quotes, semicolons, comment markers, newlines and unicode", () => {
    const db = freshDb();
    const tricky = single("agai-2a3b4c", {
      prompt: `'Which one''s right; -- really? /* no */ naïve'`,
      b: `"'It''s'; DROP TABLE questions; --"`,
    });
    importInto(db, bankOf(tricky));
    const q = row(db, "agai-2a3b4c");
    expect(q.prompt_md).toBe("Which one's right; -- really? /* no */ naïve");
    const options = JSON.parse(String(q.options_json)) as { id: string; text: string }[];
    expect(options[1]!.text).toBe("'It''s'; DROP TABLE questions; --");
    expect(db.prepare("SELECT count(*) AS n FROM questions").get()).toEqual({ n: 1 });
  });

  it("never sets attempts or correct on conflict", () => {
    const plan = planImport({ bank: bankOf(BODY), dbQuestions: [], dbLectures: [], now: 1, importId: "x" });
    for (const s of plan.statements.filter((x) => x.startsWith("INSERT INTO questions"))) {
      const set = s.slice(s.indexOf("DO UPDATE SET"));
      expect(set).not.toMatch(/\battempts =|\bcorrect =|\bcreated_at =/);
      expect(set).toMatch(/rating = CASE WHEN questions\.rev <> excluded\.rev THEN excluded\.start_rating ELSE questions\.rating END/);
    }
  });

  it("updates a changed lecture title", () => {
    const db = freshDb();
    importInto(db, bankOf(BODY));
    const vault = makeVault({ [AGAI_FILE]: agaiHeader().replace("title: Games", "title: Games, revised") + BODY });
    const plan = importInto(db, buildBank(check(vault), null, 5));
    expect(plan.lecturesChanged).toEqual(["AGAI-starter-games"]);
    expect((db.prepare("SELECT title FROM lectures").get() as Row).title).toBe("Games, revised");
  });
});
