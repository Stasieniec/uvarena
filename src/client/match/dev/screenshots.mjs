// Screenshots of the match preview at 390 x 844 for the phone review.
// Start the dev server first (npx vite --port 5206), then:
//   node src/client/match/dev/screenshots.mjs [baseUrl] [outDir] [moment ...]
// Every moment is frozen at its point in the scripted match; `wait` lets the
// entry animations reach the frame worth looking at.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const base = process.argv[2] ?? "http://localhost:5206";
const out = process.argv[3] ?? "screenshots";
const only = process.argv.slice(4);

// moment -> ms to wait after load before the shot
const SHOTS = {
  lobby: 600,
  intro: 900,
  arming: 700,
  armed: 700,
  zeus: 380,
  "zeus-them": 380,
  "zeus-bot": 380,
  nemesis: 650,
  aegis: 600,
  "nemesis-wasted": 600,
  truefalse: 500,
  question: 500,
  multi: 500,
  "opponent-answered": 500,
  cloze: 500,
  oracle: 900,
  code: 500,
  not: 500,
  "last-seconds": 500,
  hermes: 350,
  reveal: 1800,
  "speed-hit": 1250,
  "big-hit": 1180,
  "big-hit-taken": 1180,
  "wrong-reveal": 1800,
  fizzle: 1800,
  disconnected: 500,
  phoenix: 1700,
  end: 1800,
  "end-loss": 1800,
  "end-bot": 1800,
};

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
for (const reduced of [false, true]) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${page.url()}: ${m.text()}`);
  });
  for (const [moment, wait] of Object.entries(SHOTS)) {
    if (only.length && !only.includes(moment)) continue;
    if (reduced && !["zeus", "big-hit", "phoenix", "nemesis"].includes(moment)) continue;
    await page.goto(`${base}/src/client/match/dev/screen?moment=${moment}`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    // Waits count from when the screen is up, so entry animations land on the same frame each run.
    await page.waitForSelector(".rq-match");
    await page.waitForTimeout(wait);
    const file = join(out, `${moment}${reduced ? "-reduced" : ""}.png`);
    await page.screenshot({ path: file });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`${file}${overflow ? "  HORIZONTAL OVERFLOW" : ""}`);
  }
  await context.close();
}
await browser.close();
if (errors.length) {
  console.log("Errors:");
  for (const e of errors) console.log(`  ${e}`);
  process.exitCode = 1;
}
