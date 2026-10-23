// Production deploy: `npm run deploy`.
//
// Workers static assets cannot be uploaded from the deploy container (its
// proxy replaces the short-lived upload token with the account token, and the
// asset upload answers 401). So the production Worker has no `assets`; the
// client build goes to the R2 bucket STATIC_BUCKET instead and the Worker
// serves it (src/worker/static.ts). Local dev and tests are unchanged.
//
// Steps: build; upload changed client files to R2 (index.html last); write a
// deploy config without `assets` and with the STATIC binding next to the
// generated one; on the first deploy (or if the secret is missing) ship a
// fresh BETTER_AUTH_SECRET with it; deploy; check the result through the API
// (wrangler can exit non-zero over /workers/routes after a good upload) and
// create the custom domain if it is missing.
//
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. In the cloud container
// the token is "placeholder" and the proxy injects the real one.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const STATIC_BUCKET = "uvarena-static";
const STATIC_BINDING = "STATIC";
const WRANGLER = join(ROOT, "node_modules", ".bin", "wrangler");
const UPLOAD_CONCURRENCY = 4;

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
if (!ACCOUNT || !TOKEN) {
  console.error("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID first (see docs/build-plan.md, Deploy).");
  process.exit(1);
}
const SECRETS_DIR = process.env.DEPLOY_SECRETS_DIR ?? tmpdir();

function log(msg: string): void {
  console.log(`deploy: ${msg}`);
}

function fail(msg: string): never {
  console.error(`deploy: FAILED: ${msg}`);
  process.exit(1);
}

function run(cmd: string, args: string[], opts: { quiet?: boolean } = {}): { ok: boolean; out: string } {
  const res = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: opts.quiet ? "pipe" : ["ignore", "pipe", "pipe"] });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  if (!opts.quiet) process.stdout.write(out);
  return { ok: res.status === 0, out };
}

// ---------------------------------------------------------------------------
// Cloudflare API through curl (curl honours the container's proxy and CA)
// ---------------------------------------------------------------------------

interface ApiResult<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
  result_info?: { cursor?: string; is_truncated?: boolean };
}

function api<T>(method: string, path: string, body?: unknown): ApiResult<T> {
  const args = ["-sS", "-X", method, `https://api.cloudflare.com/client/v4${path}`];
  if (TOKEN !== "placeholder") args.push("-H", `Authorization: Bearer ${TOKEN}`);
  if (body !== undefined) args.push("-H", "Content-Type: application/json", "--data-binary", "@-");
  const res = spawnSync("curl", args, { encoding: "utf8", input: body === undefined ? undefined : JSON.stringify(body) });
  try {
    return JSON.parse(res.stdout) as ApiResult<T>;
  } catch {
    return { success: false, errors: [{ code: 0, message: `${res.stdout}${res.stderr}`.slice(0, 300) }], result: null as T };
  }
}

function apiErrors(r: ApiResult<unknown>): string {
  return r.errors.map((e) => `${e.code} ${e.message}`).join("; ");
}

// ---------------------------------------------------------------------------
// Build output
// ---------------------------------------------------------------------------

interface DeployConfig {
  name: string;
  assets?: { directory?: string };
  routes?: { pattern: string; custom_domain?: boolean; zone_name?: string }[];
  r2_buckets?: { binding: string; bucket_name: string }[];
  [key: string]: unknown;
}

function generatedConfigPath(): string {
  const redirect = join(ROOT, ".wrangler", "deploy", "config.json");
  if (!existsSync(redirect)) fail(".wrangler/deploy/config.json is missing after the build");
  const { configPath } = JSON.parse(readFileSync(redirect, "utf8")) as { configPath: string };
  return resolve(dirname(redirect), configPath);
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue; // _headers, .assetsignore
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Static upload
// ---------------------------------------------------------------------------

/** Remote etags by key. An empty map (upload everything) if the listing fails. */
function remoteEtags(): Map<string, string> {
  const etags = new Map<string, string>();
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const q = new URLSearchParams({ per_page: "1000" });
    if (cursor) q.set("cursor", cursor);
    const r = api<{ key: string; etag: string }[]>("GET", `/accounts/${ACCOUNT}/r2/buckets/${STATIC_BUCKET}/objects?${q}`);
    if (!r.success || !Array.isArray(r.result)) {
      log(`could not list ${STATIC_BUCKET} (${apiErrors(r)}); uploading every file`);
      return new Map();
    }
    for (const o of r.result) etags.set(o.key, o.etag.replace(/"/g, ""));
    cursor = r.result_info?.cursor;
    if (!r.result_info?.is_truncated || !cursor) break;
  }
  return etags;
}

function runAsync(cmd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((res) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", (err) => res({ ok: false, out: String(err) }));
    child.on("close", (code) => res({ ok: code === 0, out }));
  });
}

async function putObject(key: string, file: string): Promise<void> {
  const r = await runAsync(WRANGLER, ["r2", "object", "put", `${STATIC_BUCKET}/${key}`, "--file", file, "--remote"]);
  if (!r.ok) throw new Error(`upload of ${key} failed:\n${r.out}`);
}

async function uploadStatic(clientDir: string): Promise<void> {
  const files = listFiles(clientDir).map((file) => ({ file, key: relative(clientDir, file).split(sep).join("/") }));
  if (!files.some((f) => f.key === "index.html")) fail(`no index.html in ${clientDir}`);
  const remote = remoteEtags();
  const changed = files.filter(({ file, key }) => remote.get(key) !== createHash("md5").update(readFileSync(file)).digest("hex"));
  log(`${files.length} client files, ${changed.length} to upload`);

  // Everything index.html can reference goes first, so a new index.html never points at a missing chunk.
  const first = changed.filter((f) => f.key !== "index.html");
  let next = 0;
  const worker = async () => {
    while (next < first.length) {
      const f = first[next++]!;
      await putObject(f.key, f.file);
      log(`uploaded ${f.key}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, first.length) }, worker));
  const index = changed.find((f) => f.key === "index.html");
  if (index) {
    await putObject(index.key, index.file);
    log("uploaded index.html");
  }
}

// ---------------------------------------------------------------------------
// Deploy config and secret
// ---------------------------------------------------------------------------

function writeDeployConfig(generatedPath: string, config: DeployConfig): string {
  const { assets: _assets, ...rest } = config;
  const buckets = (config.r2_buckets ?? []).filter((b) => b.binding !== STATIC_BINDING);
  const variant: DeployConfig = { ...rest, r2_buckets: [...buckets, { binding: STATIC_BINDING, bucket_name: STATIC_BUCKET }] };
  // Same folder, so `main` and `migrations_dir` stay valid relative paths.
  const out = join(dirname(generatedPath), "wrangler.deploy.json");
  writeFileSync(out, `${JSON.stringify(variant, null, 2)}\n`);
  return out;
}

function workerExists(name: string): boolean {
  const r = api<{ id: string }[]>("GET", `/accounts/${ACCOUNT}/workers/scripts`);
  if (!r.success) fail(`could not list Workers: ${apiErrors(r)}`);
  return r.result.some((s) => s.id === name);
}

function hasAuthSecret(name: string): boolean {
  const r = api<{ name: string }[]>("GET", `/accounts/${ACCOUNT}/workers/scripts/${name}/secrets`);
  if (!r.success) fail(`could not list the secrets of ${name}: ${apiErrors(r)}`);
  return r.result.some((s) => s.name === "BETTER_AUTH_SECRET");
}

/** A secrets file with a fresh BETTER_AUTH_SECRET, written with umask 077. The value never passes through this process's output. */
function newSecretsFile(): { file: string; dir: string } {
  const dir = mkdtempSync(join(SECRETS_DIR, "uvarena-deploy-"));
  const file = join(dir, "secrets.json");
  const res = spawnSync("bash", ["-c", 'umask 077; printf \'{"BETTER_AUTH_SECRET":"%s"}\' "$(openssl rand -base64 32)" > "$1"', "bash", file], {
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
  });
  if (res.status !== 0 || statSync(file).size < 40) {
    rmSync(dir, { recursive: true, force: true });
    fail(`could not generate the secret: ${res.stderr}`);
  }
  return { file, dir };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

function verifyWorker(name: string, startedAt: number): void {
  const r = api<{ id: string; modified_on: string }[]>("GET", `/accounts/${ACCOUNT}/workers/scripts`);
  const script = r.success ? r.result.find((s) => s.id === name) : undefined;
  if (!script) fail(`Worker ${name} does not exist after the deploy`);
  if (Date.parse(script.modified_on) < startedAt - 60_000) fail(`Worker ${name} was not updated (modified ${script.modified_on})`);
  const s = api<{ bindings: { name: string; type: string; bucket_name?: string }[] }>("GET", `/accounts/${ACCOUNT}/workers/scripts/${name}/settings`);
  if (!s.success) fail(`could not read the settings of ${name}: ${apiErrors(s)}`);
  const bound = s.result.bindings.find((b) => b.name === STATIC_BINDING);
  if (bound?.type !== "r2_bucket" || bound.bucket_name !== STATIC_BUCKET) fail(`${name} has no ${STATIC_BINDING} binding to ${STATIC_BUCKET}`);
  if (!hasAuthSecret(name)) fail(`${name} has no BETTER_AUTH_SECRET`);
  log(`Worker ${name} updated ${script.modified_on}, ${STATIC_BINDING} bound, auth secret present`);
}

function ensureCustomDomains(config: DeployConfig): void {
  for (const route of config.routes ?? []) {
    if (!route.custom_domain) continue;
    const hostname = route.pattern;
    const list = api<{ hostname: string; service: string }[]>("GET", `/accounts/${ACCOUNT}/workers/domains?hostname=${encodeURIComponent(hostname)}`);
    if (!list.success) fail(`could not list custom domains: ${apiErrors(list)}`);
    const found = list.result.find((d) => d.hostname === hostname);
    if (found?.service === config.name) {
      log(`custom domain ${hostname} -> ${config.name}`);
      continue;
    }
    if (found) fail(`${hostname} is attached to another Worker (${found.service}); not touching it`);
    const zoneName = route.zone_name ?? hostname.split(".").slice(-2).join(".");
    const zones = api<{ id: string }[]>("GET", `/zones?name=${encodeURIComponent(zoneName)}`);
    const zoneId = zones.success ? zones.result[0]?.id : undefined;
    if (!zoneId) fail(`zone ${zoneName} not found: ${apiErrors(zones)}`);
    const put = api("PUT", `/accounts/${ACCOUNT}/workers/domains`, { hostname, service: config.name, environment: "production", zone_id: zoneId });
    if (!put.success) fail(`could not attach ${hostname}: ${apiErrors(put)}`);
    log(`custom domain ${hostname} attached to ${config.name}`);
  }
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log("building");
  if (!run("npm", ["run", "build"]).ok) fail("build failed");

  const generatedPath = generatedConfigPath();
  const config = JSON.parse(readFileSync(generatedPath, "utf8")) as DeployConfig;
  if (!config.assets?.directory) fail(`${generatedPath} has no assets directory`);
  const clientDir = resolve(dirname(generatedPath), config.assets.directory);

  await uploadStatic(clientDir);
  const deployConfig = writeDeployConfig(generatedPath, config);
  log(`deploy config ${relative(ROOT, deployConfig)}`);

  const args = ["deploy", "--config", deployConfig];
  let secrets: { file: string; dir: string } | null = null;
  if (!workerExists(config.name) || !hasAuthSecret(config.name)) {
    log("BETTER_AUTH_SECRET missing: generating one for this deploy");
    secrets = newSecretsFile();
    args.push("--secrets-file", secrets.file);
  }

  const startedAt = Date.now();
  let deployed: { ok: boolean; out: string };
  try {
    deployed = run(WRANGLER, args);
  } finally {
    if (secrets) rmSync(secrets.dir, { recursive: true, force: true });
  }
  if (!deployed.ok) log("wrangler deploy exited non-zero; checking the result through the API");

  verifyWorker(config.name, startedAt);
  ensureCustomDomains(config);
  log("done");
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
