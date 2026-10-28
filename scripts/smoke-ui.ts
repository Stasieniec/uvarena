// A real ranked match through the actual UI: two phone-sized browser
// contexts (390 x 844) sign up, queue for the same course, get matched and
// play to the end, one tapping the right answer fast and the other a wrong
// one. Screenshots of the key moments go to the output folder.
//
//   npx vite --port 5210            (TEST_MODE=1 in .dev.vars, bank imported)
//   npm run smoke:ui -- --url http://localhost:5210 --out shots
//
// The right answers come from bank/bank.json, matched to each question frame
// the page receives on its match socket; the taps go through the UI.
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { QuestionMessageSchema, type QuestionMessage } from "../src/shared/protocol";
import { BankFileSchema, type BankItem } from "../src/shared/question-schema";

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const BASE = (argValue("--url") ?? "http://localhost:5210").replace(/\/$/, "");
const OUT = resolve(argValue("--out") ?? "shots");
const COURSE_TITLE = "Agentic Artificial Intelligence";
const MATCH_TIMEOUT_MS = 240_000;

const bank = BankFileSchema.parse(JSON.parse(readFileSync(resolve(import.meta.dirname, "..", "bank", "bank.json"), "utf8")));
const byText = new Map<string, BankItem>();
for (const q of bank.questions) byText.set(`${q.type}|${q.prompt ?? q.statement ?? ""}`, q);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errors: string[] = [];

interface Player {
  name: string;
  context: BrowserContext;
  page: Page;
  right: boolean;
  delayMs: number;
  questions: QuestionMessage[];
  answered: Set<number>;
  /** The match_end frame, once it arrived. */
  end: { result: string; reason: string } | null;
}

async function shot(p: Player, name: string): Promise<void> {
  const file = join(OUT, `ui-${name}-${p.name}.png`);
  await p.page.screenshot({ path: file });
  console.log(`  shot  ${file}`);
}

async function newPlayer(browser: Awaited<ReturnType<typeof chromium.launch>>, name: string, right: boolean, delayMs: number): Promise<Player> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const player: Player = { name, context, page, right, delayMs, questions: [], answered: new Set(), end: null };
  page.on("pageerror", (e) => errors.push(`${name}: page error: ${e.message}`));
  page.on("console", (m) => {
    // Signed-out pages ask /api/me first; that 401 is expected.
    if (m.type() === "error" && !/status of 401/.test(m.text())) errors.push(`${name}: console: ${m.text()}`);
  });
  page.on("websocket", (ws) => {
    ws.on("framereceived", ({ payload }) => {
      const text = String(payload);
      if (!text.startsWith("{")) return;
      const frame = JSON.parse(text) as { type?: string; result?: string; reason?: string };
      if (frame.type === "match_end") player.end = { result: frame.result ?? "", reason: frame.reason ?? "" };
      const parsed = QuestionMessageSchema.safeParse(frame);
      if (parsed.success) player.questions.push(parsed.data);
    });
  });
  return player;
}

async function signUp(p: Player): Promise<string> {
  const username = `${p.name}${Math.random().toString(36).slice(2, 7)}`;
  await p.page.goto(`${BASE}/signup`);
  await p.page.getByLabel("Email").fill(`${username}@example.com`);
  await p.page.getByLabel("Password").fill("ui-password-1");
  await p.page.getByLabel("Username").fill(username);
  await p.page.getByLabel("First name").fill(p.name === "ana" ? "Ana" : "Ben");
  await p.page.getByLabel("Surname").fill("Tester");
  await p.page.getByRole("button", { name: "Create account", exact: true }).click();
  await p.page.waitForURL((u) => !u.pathname.startsWith("/signup"), { timeout: 15_000 });
  return username;
}

/** Picks the course if Home asks for one. */
async function pickCourse(p: Player): Promise<void> {
  const sheet = p.page.getByText("Pick a course");
  await sheet.waitFor({ timeout: 5000 }).catch(() => undefined);
  if (!(await sheet.isVisible().catch(() => false))) return;
  await p.page.getByRole("button", { name: new RegExp(COURSE_TITLE) }).first().click();
  await sheet.waitFor({ state: "hidden", timeout: 5000 });
}

function plain(text: string): string {
  return text.replace(/[`*_]/g, "").replace(/\s+/g, " ").trim();
}

async function tapOption(p: Player, text: string): Promise<void> {
  const target = plain(text);
  const buttons = p.page.locator("button:not([disabled])");
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const b = buttons.nth(i);
    const label = plain((await b.innerText().catch(() => "")) ?? "");
    if (label === target || (target.length > 30 && label.startsWith(target.slice(0, 30)))) {
      await b.click();
      return;
    }
  }
  throw new Error(`${p.name}: no button for option "${target}"`);
}

async function answer(p: Player, q: QuestionMessage, first: boolean): Promise<void> {
  const item = byText.get(`${q.questionType}|${q.prompt ?? q.statement ?? ""}`);
  if (!item) throw new Error(`question not in the bank: ${q.prompt ?? q.statement}`);
  await sleep(p.delayMs);
  if (first) await shot(p, `question-r${q.round}`);
  const key = item.key;
  if (key.kind === "bool") {
    const value = p.right ? key.value : !key.value;
    await p.page.getByRole("button", { name: value ? /^True/ : /^False/ }).click();
    return;
  }
  if (key.kind !== "options") throw new Error(`cannot answer ${key.kind}`);
  const right = item.options.filter((o) => key.ids.includes(o.id));
  const wrong = item.options.filter((o) => !key.ids.includes(o.id));
  const picks = p.right ? right : wrong.length > 0 ? [wrong[0]!] : right.slice(1);
  for (const o of picks) await tapOption(p, o.text);
  if (q.questionType === "multi") await p.page.getByRole("button", { name: "Lock in" }).click();
}

/** Answers every new question until the end screen shows. */
async function play(p: Player, shots: { reveal: boolean }): Promise<void> {
  const start = Date.now();
  let revealShot = false;
  while (Date.now() - start < MATCH_TIMEOUT_MS) {
    if (p.end) {
      console.log(`  ${p.name}: ${p.end.result} (${p.end.reason})`);
      return;
    }
    const q = p.questions.at(-1);
    if (q && !p.answered.has(q.round)) {
      p.answered.add(q.round);
      try {
        await answer(p, q, q.round === 1 || q.round === 3);
      } catch (err) {
        errors.push(String(err));
      }
      if (shots.reveal && !revealShot && q.round === 2) {
        await sleep(1500);
        await shot(p, "reveal-r2");
        revealShot = true;
      }
    }
    await sleep(100);
  }
  throw new Error(`${p.name}: no end screen within ${MATCH_TIMEOUT_MS / 1000} s`);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ana = await newPlayer(browser, "ana", true, 400);
  const ben = await newPlayer(browser, "ben", false, 1500);

  console.log("Sign up");
  const [anaName, benName] = await Promise.all([signUp(ana), signUp(ben)]);
  await Promise.all([pickCourse(ana), pickCourse(ben)]);
  await sleep(800);
  await shot(ana, "home");

  console.log("Queue");
  await ana.page.goto(`${BASE}/queue`);
  await sleep(1200);
  await shot(ana, "queue");
  await ben.page.goto(`${BASE}/queue`);
  await Promise.all([ana.page.waitForURL(/\/match\//, { timeout: 30_000 }), ben.page.waitForURL(/\/match\//, { timeout: 30_000 })]);
  await sleep(700);
  await shot(ana, "intro");
  await ana.page.getByText(/ROUND 1/i).first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  await shot(ben, "arming");

  console.log("Play");
  await Promise.all([play(ana, { reveal: true }), play(ben, { reveal: true })]);
  await sleep(2500);
  await shot(ana, "end");
  await shot(ben, "end");

  console.log("After the match");
  await ben.page.goto(`${BASE}/missed`);
  await sleep(1200);
  await shot(ben, "missed");
  await ana.page.goto(`${BASE}/history`);
  await sleep(1200);
  await shot(ana, "history");
  await ana.page.goto(`${BASE}/leaderboard`);
  await sleep(1200);
  await shot(ana, "leaderboard");
  await ana.page.goto(`${BASE}/u/${benName}`);
  await sleep(1200);
  await shot(ana, "profile-of-opponent");
  console.log(`players: ${anaName} (right), ${benName} (wrong)`);

  await browser.close();
  if (errors.length) {
    console.log("Errors:");
    for (const e of errors) console.log(`  ${e}`);
    process.exit(1);
  }
  console.log("UI run finished.");
}

main().catch((err: unknown) => {
  console.error("UI run stopped:", err instanceof Error ? err.message : err);
  for (const e of errors) console.log(`  ${e}`);
  process.exit(1);
});
