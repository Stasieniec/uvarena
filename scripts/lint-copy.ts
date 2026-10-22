// npm run lint:copy [-- --vault ../university-vault]
// House writing rules: no em-dashes and no emoji in UI strings, code comments
// and question bank files. Scans src/, scripts/, test/, index.html and public/,
// plus docs/quiz/ in the vault when --vault is given. Exits 1 on any hit.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const EM_DASH = "\u2014";
const EMOJI = /\p{Extended_Pictographic}/u;
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".html", ".json", ".webmanifest", ".yaml", ".yml", ".svg"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".wrangler", ".git"]);

function* walk(path: string): Generator<string> {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return;
  }
  if (stat.isFile()) {
    if (SCANNED_EXTENSIONS.has(extname(path))) yield path;
    return;
  }
  for (const entry of readdirSync(path)) {
    if (SKIP_DIRS.has(entry)) continue;
    yield* walk(join(path, entry));
  }
}

const root = process.cwd();
const targets = ["src", "scripts", "test", "index.html", "public"].map((p) => join(root, p));
const vaultFlag = process.argv.indexOf("--vault");
if (vaultFlag !== -1) {
  const vault = process.argv[vaultFlag + 1];
  if (!vault) {
    console.error("--vault needs a path");
    process.exit(2);
  }
  targets.push(join(vault, "docs", "quiz"));
}

let hits = 0;
for (const target of targets) {
  for (const file of walk(target)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const problems: string[] = [];
      if (line.includes(EM_DASH)) problems.push("em-dash");
      if (EMOJI.test(line)) problems.push("emoji");
      if (problems.length > 0) {
        hits += 1;
        console.log(`${relative(root, file)}:${i + 1}: ${problems.join(", ")}: ${line.trim().slice(0, 120)}`);
      }
    });
  }
}

if (hits > 0) {
  console.error(`lint:copy: ${hits} line(s) break the writing rules`);
  process.exit(1);
}
console.log("lint:copy: clean");
