// Question bank tool. Run from anywhere:
//   npx tsx scripts/quiz-bank.ts <command> --vault <path to university-vault>
//   npm run bank -- <command> --vault ../university-vault
//
// Commands:
//   ids                  assign ids to every `id: new` in the vault's quiz files
//   check                validate every quiz file; exits 1 on errors
//   export               check, then write bank/bank.json and update bank/fingerprints.json
//   import --local|--remote
//                        export, then upsert into D1 with wrangler
//
// Options:
//   --vault <path>         the vault (required)
//   --course <CODE>        only print problems for this course's files (all files are still checked)
//   --no-warnings          print errors only
//   --fingerprints <path>  default bank/fingerprints.json in this repo
//   --out <path>           export: default bank/bank.json in this repo
//   --sql <path>           import: default bank/import.sql in this repo
//   --dry-run              import: write the SQL and print the counts, do not execute it
//   --persist-to <dir>     import --local: wrangler's local state folder (default .wrangler/state)
// Formats: src/shared/question-schema.ts. Behaviour: docs/build-plan.md "Question bank".
import { resolve } from "node:path";
import { checkVault, printCheck } from "./bank/check";
import { displayPath } from "./bank/diagnostics";
import { assignIds } from "./bank/ids";
import { CLI_PATH, DEFAULT_BANK_JSON, DEFAULT_FINGERPRINTS, DEFAULT_IMPORT_SQL } from "./bank/paths";

const USAGE = `Usage: npx tsx ${CLI_PATH} <ids|check|export|import> --vault <path> [options]
  import needs --local or --remote. See the top of scripts/quiz-bank.ts for every option.`;

interface Args {
  command: string;
  vault: string;
  course: string | null;
  warnings: boolean;
  fingerprints: string;
  out: string;
  sql: string;
  target: "local" | "remote" | null;
  dryRun: boolean;
  persistTo: string | null;
}

/** npm run sets the working directory to the repo; INIT_CWD is where the user typed the command. */
const BASE = process.env.INIT_CWD ?? process.cwd();
const abs = (p: string) => resolve(BASE, p);

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: "",
    vault: "",
    course: null,
    warnings: true,
    fingerprints: DEFAULT_FINGERPRINTS,
    out: DEFAULT_BANK_JSON,
    sql: DEFAULT_IMPORT_SQL,
    target: null,
    dryRun: false,
    persistTo: null,
  };
  const value = (i: number, flag: string) => {
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) fail(`${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case "--vault":
        args.vault = abs(value(i, a));
        i++;
        break;
      case "--course":
        args.course = value(i, a).toUpperCase();
        i++;
        break;
      case "--fingerprints":
        args.fingerprints = abs(value(i, a));
        i++;
        break;
      case "--out":
        args.out = abs(value(i, a));
        i++;
        break;
      case "--sql":
        args.sql = abs(value(i, a));
        i++;
        break;
      case "--no-warnings":
        args.warnings = false;
        break;
      case "--local":
        args.target = "local";
        break;
      case "--remote":
        args.target = "remote";
        break;
      case "--persist-to":
        args.persistTo = abs(value(i, a));
        i++;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "-h":
      case "--help":
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        if (a.startsWith("-")) fail(`Unknown option ${a}`);
        if (args.command) fail(`Unexpected argument ${a}`);
        args.command = a;
    }
  }
  if (!args.command) fail("Missing command");
  if (!args.vault) fail("Missing --vault <path to university-vault>");
  return args;
}

function fail(message: string): never {
  console.error(`quiz-bank: ${message}\n${USAGE}`);
  process.exit(2);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case "check": {
      const result = checkVault({ vault: args.vault, fingerprintsPath: args.fingerprints });
      process.exit(printCheck(result, args) ? 0 : 1);
      break;
    }
    case "ids": {
      const result = assignIds(args.vault, args.fingerprints);
      for (const a of result.assigned) console.log(`${displayPath(a.file)}: assigned ${a.count} id(s)`);
      for (const s of result.skipped) console.log(`${displayPath(s.file)}: skipped, ${s.reason}`);
      const total = result.assigned.reduce((n, a) => n + a.count, 0);
      console.log(`ids: assigned ${total} id(s) in ${result.assigned.length} file(s)`);
      process.exit(result.skipped.length > 0 ? 1 : 0);
      break;
    }
    case "export":
    case "import": {
      const { runExport, runImport } = await import("./bank/commands");
      if (args.command === "export") process.exit((await runExport(args)) ? 0 : 1);
      if (!args.target) fail("import needs --local or --remote");
      if (args.persistTo && args.target !== "local") fail("--persist-to works with --local only");
      process.exit((await runImport({ ...args, target: args.target, persistTo: args.persistTo ?? undefined })) ? 0 : 1);
      break;
    }
    default:
      fail(`Unknown command ${args.command}`);
  }
}

main().catch((e: unknown) => {
  console.error(`quiz-bank: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
});
