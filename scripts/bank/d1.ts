// Runs wrangler against the D1 binding DB, from the repo root so it finds
// wrangler.jsonc and the local state in .wrangler/.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./paths";
import type { DbRow } from "./sql";

export type D1Target = { kind: "local"; persistTo?: string } | { kind: "remote" };

/** The proxy in this container injects the real token; wrangler only needs both variables set. */
const DEFAULT_ACCOUNT_ID = "2b601c6ade78558b75079f4a71ac23c8";

function wranglerBin(): string {
  const bin = join(REPO_ROOT, "node_modules", ".bin", "wrangler");
  if (!existsSync(bin)) throw new Error(`wrangler not found at ${bin}; run npm install in ${REPO_ROOT}`);
  return bin;
}

function targetFlags(t: D1Target): string[] {
  if (t.kind === "remote") return ["--remote"];
  return t.persistTo ? ["--local", "--persist-to", t.persistTo] : ["--local"];
}

function run(args: string[]): string {
  const res = spawnSync(wranglerBin(), args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN ?? "placeholder",
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? DEFAULT_ACCOUNT_ID,
      NO_COLOR: "1",
    },
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const out = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.trim().split("\n").slice(-20).join("\n");
    throw new Error(`wrangler ${args.join(" ")} failed (exit ${res.status}):\n${out}`);
  }
  return res.stdout;
}

/** Runs one SELECT and returns its rows. */
export function d1Query(target: D1Target, sql: string): DbRow[] {
  const out = run(["d1", "execute", "DB", ...targetFlags(target), "--json", "--command", sql]);
  const start = out.indexOf("[");
  if (start === -1) throw new Error(`wrangler returned no JSON:\n${out.slice(0, 500)}`);
  const parsed = JSON.parse(out.slice(start)) as { results?: DbRow[]; success?: boolean }[];
  const first = parsed[0];
  if (!first || first.success === false) throw new Error(`D1 query failed: ${sql}`);
  return first.results ?? [];
}

export function d1ExecFile(target: D1Target, file: string): void {
  run(["d1", "execute", "DB", ...targetFlags(target), "--yes", "--file", file]);
}

export function d1ApplyMigrations(target: D1Target): void {
  run(["d1", "migrations", "apply", "DB", ...targetFlags(target)]);
}
