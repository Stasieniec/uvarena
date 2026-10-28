// Deletes the smoke-run users (username starting with zz_smoke_) and every
// row that references them, from the local or the production database:
//
//   npm run cleanup:smoke -- --local
//   npm run cleanup:smoke -- --remote
//   npm run cleanup:smoke -- --remote --dry-run
//   npm run cleanup:smoke -- --remote --reset-question-ratings
//
// Rows removed: their matches (as either player) with those matches' rounds,
// answers, finalization markers and reports; their own answers, ratings,
// course stats, missed questions, reports, prefs, sessions, accounts and
// verification tokens; then the users. A real player's match against a smoke
// user goes with it.
//
// --reset-question-ratings also sets every question's rating, rating_n,
// attempts and correct back to their import values (start_rating, 0, 0, 0),
// undoing what the smoke matches taught the question ratings. It runs only
// when every user in the database is a smoke user, since otherwise it would
// erase what real players' answers taught them; with real users present it is
// skipped and the smoke rows are still deleted.
//
// Durable Object storage is left alone: a Matchmaker's record of a smoke
// user's last pairing expires by itself, and finished MatchRooms delete their
// own storage.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { d1ExecFile, d1Query, type D1Target } from "./bank/d1";

const PREFIX = "zz_smoke_";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const local = args.includes("--local");
const dryRun = args.includes("--dry-run");
const resetRatings = args.includes("--reset-question-ratings");
if (remote === local) {
  console.error("Pass exactly one of --local or --remote.");
  process.exit(1);
}
const target: D1Target = remote ? { kind: "remote" } : { kind: "local" };

const SMOKE_USERS = `SELECT id FROM user WHERE substr(username, 1, ${PREFIX.length}) = '${PREFIX}'`;
const SMOKE_MATCHES = `SELECT id FROM matches WHERE player_a IN (${SMOKE_USERS}) OR player_b IN (${SMOKE_USERS})`;
/** instr, not LIKE: an underscore is a LIKE wildcard. */
const SMOKE_VERIFICATION = `instr(identifier, '${PREFIX}') > 0`;

/** Table, and the condition that picks the smoke rows in it. Children before parents. */
const TABLES: [string, string][] = [
  ["answers", `user_id IN (${SMOKE_USERS}) OR match_id IN (${SMOKE_MATCHES})`],
  ["match_rounds", `match_id IN (${SMOKE_MATCHES})`],
  ["match_finalizations", `match_id IN (${SMOKE_MATCHES})`],
  ["question_reports", `user_id IN (${SMOKE_USERS}) OR match_id IN (${SMOKE_MATCHES})`],
  ["missed_questions", `user_id IN (${SMOKE_USERS})`],
  ["ratings", `user_id IN (${SMOKE_USERS})`],
  ["player_course", `user_id IN (${SMOKE_USERS})`],
  ["user_prefs", `user_id IN (${SMOKE_USERS})`],
  ["session", `user_id IN (${SMOKE_USERS})`],
  ["account", `user_id IN (${SMOKE_USERS})`],
  ["verification", SMOKE_VERIFICATION],
  // matches after everything that finds rows through them, user last.
  ["matches", `id IN (${SMOKE_MATCHES})`],
  ["user", `id IN (${SMOKE_USERS})`],
];

const RESET_RATINGS = "UPDATE questions SET rating = start_rating, rating_n = 0, attempts = 0, correct = 0";

function count(sql: string): number {
  const row = d1Query(target, sql)[0];
  return Number(row ? Object.values(row)[0] : 0);
}

function counts(): Map<string, number> {
  const select = TABLES.map(([table, where]) => `(SELECT COUNT(*) FROM "${table}" WHERE ${where}) AS "${table}"`).join(", ");
  const row = d1Query(target, `SELECT ${select}`)[0] ?? {};
  return new Map(TABLES.map(([table]) => [table, Number(row[table] ?? 0)]));
}

function show(label: string, c: Map<string, number>): void {
  console.log(`${label}: ${[...c].map(([t, n]) => `${t} ${n}`).join(", ")}`);
}

const where = remote ? "production" : "local";
const totalUsers = count("SELECT COUNT(*) FROM user");
const before = counts();
const smokeUsers = before.get("user") ?? 0;
const realUsers = totalUsers - smokeUsers;
console.log(`${where}: ${totalUsers} user(s), ${smokeUsers} smoke, ${realUsers} other`);
show("smoke rows", before);
const touched = count("SELECT COUNT(*) FROM questions WHERE rating <> start_rating OR rating_n <> 0 OR attempts <> 0 OR correct <> 0");
if (resetRatings) {
  console.log(`questions with changed ratings: ${touched}`);
  if (realUsers > 0) console.log("question ratings: NOT reset, the database has users that are not smoke users");
}

if (dryRun) {
  console.log("dry run: nothing changed");
  process.exit(0);
}

const resetting = resetRatings && realUsers === 0;
if ([...before.values()].every((n) => n === 0) && !(resetting && touched > 0)) {
  console.log("nothing to change");
  process.exit(0);
}
const statements = TABLES.map(([table, where]) => `DELETE FROM "${table}" WHERE ${where};`);
if (resetting) statements.push(`${RESET_RATINGS};`);

const dir = mkdtempSync(join(tmpdir(), "cleanup-smoke-"));
const file = join(dir, "cleanup.sql");
try {
  writeFileSync(file, `${statements.join("\n")}\n`);
  d1ExecFile(target, file);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const after = counts();
show("left after cleanup", after);
const left = [...after.values()].reduce((a, b) => a + b, 0);
if (resetting) {
  const still = count("SELECT COUNT(*) FROM questions WHERE rating <> start_rating OR rating_n <> 0 OR attempts <> 0 OR correct <> 0");
  console.log(`question ratings reset: ${touched} changed before, ${still} after`);
  if (still > 0) process.exit(1);
}
console.log(left === 0 ? "cleanup done" : "cleanup INCOMPLETE");
process.exit(left === 0 ? 0 : 1);
