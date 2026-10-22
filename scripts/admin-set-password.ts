// Sets a temporary password for a user, the fallback while email (and so
// password reset) is not set up.
//
//   export CLOUDFLARE_API_TOKEN=placeholder CLOUDFLARE_ACCOUNT_ID=...
//   npx tsx scripts/admin-set-password.ts <username> --local|--remote
//
// Generates a random password, hashes it with Better Auth's own scrypt
// (better-auth/crypto, which wraps @better-auth/utils with the same
// parameters the server uses), and writes the hash to the user's credential
// account with `wrangler d1 execute`. A Google-only user gets a credential
// account, so they can sign in with username and password too. Signs the user
// out everywhere. The password is printed once, after the write succeeded.
import { spawnSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { LIMITS } from "../src/shared/game/config";

const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PASSWORD_LENGTH = 14;

function usage(message?: string): never {
  if (message) console.error(`admin-set-password: ${message}`);
  console.error("usage: npx tsx scripts/admin-set-password.ts <username> --local|--remote");
  process.exit(2);
}

function parseArgs(argv: string[]): { username: string; target: "--local" | "--remote" } {
  const flags = argv.filter((a) => a.startsWith("--"));
  const names = argv.filter((a) => !a.startsWith("--"));
  if (names.length !== 1) usage("give exactly one username");
  const target = flags.find((f) => f === "--local" || f === "--remote");
  if (!target || flags.length !== 1) usage("pass --local or --remote");
  const username = names[0]!.trim().toLowerCase();
  // The pattern also keeps the username safe to inline in SQL.
  if (username.length < LIMITS.usernameMin || username.length > LIMITS.usernameMax || !LIMITS.usernamePattern.test(username)) {
    usage(`"${names[0]}" is not a valid username`);
  }
  return { username, target: target as "--local" | "--remote" };
}

/** Runs one SQL command through wrangler and returns the parsed JSON result. */
function d1(target: string, sql: string): Array<{ results: Record<string, unknown>[]; success: boolean }> {
  const run = spawnSync("npx", ["wrangler", "d1", "execute", "DB", target, "--json", "--command", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (run.status !== 0) {
    console.error(run.stderr || run.stdout);
    throw new Error(`wrangler d1 execute failed (exit ${run.status})`);
  }
  try {
    return JSON.parse(run.stdout);
  } catch {
    console.error(run.stdout);
    throw new Error("could not parse wrangler output");
  }
}

function randomPassword(): string {
  let out = "";
  for (let i = 0; i < PASSWORD_LENGTH; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return out;
}

async function main() {
  const { username, target } = parseArgs(process.argv.slice(2));

  const found = d1(target, `SELECT id FROM "user" WHERE username = '${username}' LIMIT 1;`);
  const userId = found[0]?.results[0]?.id;
  if (typeof userId !== "string" || !/^[A-Za-z0-9_-]+$/.test(userId)) {
    console.error(`admin-set-password: no user "${username}" in the ${target.slice(2)} database`);
    process.exit(1);
  }

  const password = randomPassword();
  const hash = await hashPassword(password);
  if (!/^[0-9a-f]+:[0-9a-f]+$/i.test(hash)) throw new Error("unexpected hash format");
  const now = Date.now();
  const accountId = crypto.randomUUID().replace(/-/g, "");

  // Update the credential account, create one if the user has none, and end
  // every session so the old password (or a stolen session) stops working.
  const sql = [
    `UPDATE account SET password = '${hash}', updated_at = ${now} WHERE user_id = '${userId}' AND provider_id = 'credential';`,
    `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
       SELECT '${accountId}', '${userId}', 'credential', '${userId}', '${hash}', ${now}, ${now}
       WHERE NOT EXISTS (SELECT 1 FROM account WHERE user_id = '${userId}' AND provider_id = 'credential');`,
    `DELETE FROM session WHERE user_id = '${userId}';`,
  ].join("\n");
  d1(target, sql);

  console.log(`Temporary password for ${username}: ${password}`);
  console.log("They sign in with their username or email and this password, then pick a new one.");
}

main().catch((err) => {
  console.error(`admin-set-password: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
