# uvarena: build plan

For the orchestrator and the coding subagents. The player-facing rules are in `design.md` next to this file; where the two disagree, `design.md` plus Stas's decisions win, and this file gets fixed. Working name `uvarena` is used for the subdomain, repo, Worker, D1 database and R2 bucket. If Stas picks another name, replace it everywhere before the first deploy (Durable Object class names do not contain it, so nothing permanent depends on it).

Changed 2026-10-28 (design.md is current; where this plan still says otherwise, design.md wins): four power-ups, Bibi (id `bibi`, was Zeus), Shield (`shield`, was Aegis), 50:50 (`fifty`, was Oracle) and Gotta Go Fast (`fast`, was Hermes); Nemesis and Phoenix are removed everywhere, so arming has no cancellation step and a knockout is always final. The countdown after the first answer is 10 s, 5 s with Gotta Go Fast. The ladder bots are student archetypes. Engineering (`eprm`) left the app in migration 0001, and the bank import skips courses that are not active. Below, read Zeus, Aegis, Oracle and Hermes as their successors, and skip what is said about Nemesis and Phoenix.

Sources: `../research/architecture.md`, `../research/game-mechanics.md`, `../research/questions-and-courses.md`. Versions below were checked with `npm view` on 2026-10-22 in this container (Node 22.22.0).

## First release scope

Ships:
- Accounts: email + password, Google (when the OAuth client exists), username, first name, surname, avatar upload.
- Bot matches: Echo (matched to your bot rating) and an 8-bot ladder with unlocks.
- Ranked queue per course, private matches by code or link, rematch for private and bot matches.
- The duel exactly as in `design.md`: HP, timers, 5 s countdown, multiplier, cap, six power-ups, disconnect and surrender rules, sudden death.
- Ratings: Glicko-2 ranked rating per course, per-answer bot rating per course, per-answer item ratings.
- Question types in the UI: single, multi, truefalse, cloze (code options are single or multi). The engine, schema and importer support order and match too; the selector skips them until their UI exists.
- Missed questions: list, filters, retry, show answer, mark learned, "Retry these" run.
- Profile with stats and accuracy per lecture, public profiles, head-to-head, match history with round detail, leaderboard per course, question reports.
- Question bank pipeline (vault YAML to D1) and a starter bank of about 60 questions per course.

Deferred: points and weekly board, streaks, order and match UI (stretch goal if time remains), bot-while-queueing, presence and notifications, Second Wind, Kraken Ink, Ambrosia, Pandora's Box, catch-up charge, rating graphs, leave cooldowns, async challenges, item rating freeze and batch re-fit, tab-leave logging, Turnstile (unless the widget can be created via API in minutes), item analysis dashboards, LLM difficulty priors.

## Stack and versions

One Worker serving the SPA (static assets) and the API, two Durable Object classes, D1, R2. Pin exact versions (no caret) in `package.json`; re-run `npm view <pkg> version` at install time and record what was installed in the commit message.

| Package | Version | Note |
|---|---|---|
| wrangler | 4.152.0 | stay on wrangler; the `cf` CLI is beta |
| @cloudflare/vite-plugin | 1.64.0 | peer: vite 6 to 8, wrangler >= 4.151 |
| vite | 8.3.5 | |
| @vitejs/plugin-react | 6.1.2 | peer vite ^8 |
| react, react-dom | 19.3.1 | |
| react-router | 8.5.0 | data mode, `createBrowserRouter`; needs Node >= 22.22.0 (container has exactly that) |
| @tanstack/react-query | 5.104.5 | |
| tailwindcss, @tailwindcss/vite | 4.3.3 | no component library; hand-written components |
| hono | 4.13.13 | |
| zod | 4.6.7 | |
| @hono/zod-validator | 0.9.1 | |
| better-auth | 1.7.12 | pulls @better-auth/utils 0.5.0 (native scrypt under workerd) |
| drizzle-orm | 0.45.4 | not the 1.0 rc |
| drizzle-kit | 0.31.11 | flat `migrations/0000_x.sql`, which wrangler reads natively |
| typescript | 6.0.3 | 7.0.2 is `latest` and is the new native compiler; stay on 6.0.x for this build |
| vitest | 4.1.12 | not 5.x |
| @cloudflare/vitest-plugin | 1.4.7 | renamed from `@cloudflare/vitest-pool-workers` |
| @playwright/test | 1.56.1 | must match the preinstalled `chromium-1194` in `/opt/pw-browsers`; 1.64.1 is `latest` and will fail |
| yaml | 2.9.1 | bank tool |
| tsx | 4.23.15 | scripts |

Fonts: Cinzel (display) and Inter (UI) from Google Fonts. Sound: synthesised with the Web Audio API, no audio files. Animations: CSS keyframes, no animation library.

## Repo layout

One package, deliberately: the Cloudflare React template keeps client and Worker side by side, and workspaces add build wiring that agents break. Shared code is a folder with a path alias `@shared/*`.

```
uvarena/
  package.json  package-lock.json
  wrangler.jsonc  vite.config.ts  drizzle.config.ts
  vitest.unit.config.ts         # Node: engine, ratings, bank tool
  vitest.worker.config.ts       # workerd: API, D1 (isolated)
  vitest.do.config.ts           # workerd: DO WebSocket tests (no isolation, 1 worker)
  playwright.config.ts
  tsconfig.json  tsconfig.app.json  tsconfig.worker.json  tsconfig.node.json
  index.html  .dev.vars.example  .gitignore
  migrations/                   # drizzle-kit output, applied by wrangler
  public/                       # icons, manifest
  bank/fingerprints.json        # committed; bank.json is generated and gitignored
  src/
    shared/
      protocol.ts               # zod: every WebSocket message
      api-schemas.ts            # zod: every HTTP body and response
      question-schema.ts        # zod: vault YAML item, exported JSON item
      game/types.ts             # MatchState, events, PowerupId, answers
      game/config.ts            # every tunable number in one object
      game/rng.ts               # seeded PRNG
      game/engine.ts            # step(), nextDeadline()
      game/scoring.ts           # score, multiplier, damage, timer length
      game/powerups.ts          # arming resolution, oracle, hermes, phoenix
      game/bot.ts               # bot answer model, bot power-up policy, ladder
      game/select.ts            # question selection
      game/view.ts              # per-side snapshot, answer-free
      game/glicko2.ts
      game/elo.ts               # player-vs-item updates
      game/finalize.ts          # pure: finished state -> rows to write
    worker/
      index.ts                  # Hono app; exports MatchRoom, Matchmaker
      env.ts                    # Env type
      auth.ts  auth.cli.ts  email.ts
      middleware/               # session, origin check, rate limit, test-mode gate
      routes/                   # me, avatars, courses, home, bots, bot-matches, lobbies,
                                # queue, matches, users, leaderboards, missed, reports, test
      db/schema.ts  db/auth-schema.ts  db/queries/
      do/contracts.ts           # RPC interfaces between Worker and DOs
      do/match-room.ts  do/matchmaker.ts  do/finalize-writer.ts
      match-factory.ts          # create a match row + init its DO
    client/
      main.tsx  router.tsx  styles.css
      lib/api.ts  lib/auth-client.ts  lib/queue-socket.ts
      routes/                   # every screen except the duel
      components/
      match/                    # the duel screen, its socket, sounds, animations
  scripts/
    quiz-bank.ts                # ids | check | export | import
    bank/                       # its modules
    admin-set-password.ts       # fallback while email is not set up
  test/
    unit/  worker/  do/  e2e/  fixtures/
```

## Configuration

`wrangler.jsonc` (ids filled in at deploy):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "uvarena",
  "main": "src/worker/index.ts",
  "compatibility_date": "2026-10-15",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": false,
  "preview_urls": false,
  "routes": [{ "pattern": "uvarena.swasilewski.com", "custom_domain": true }],
  "observability": { "enabled": true },
  "assets": { "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
  "d1_databases": [{ "binding": "DB", "database_name": "uvarena", "database_id": "<from d1 create>", "migrations_dir": "migrations" }],
  "r2_buckets": [{ "binding": "AVATARS", "bucket_name": "uvarena-avatars" }],
  "durable_objects": { "bindings": [
    { "name": "MATCH_ROOM", "class_name": "MatchRoom" },
    { "name": "MATCHMAKER", "class_name": "Matchmaker" } ] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["MatchRoom", "Matchmaker"] }],
  "send_email": [{ "name": "EMAIL", "allowed_sender_addresses": ["noreply@swasilewski.com"] }],
  "ratelimits": [{ "name": "AUTH_LIMITER", "namespace_id": "4201", "simple": { "limit": 20, "period": 60 } }],
  "vars": { "APP_URL": "https://uvarena.swasilewski.com", "NOTES_URL": "https://notes.swasilewski.com" }
}
```

Secrets: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (both optional: Google sign-in is hidden when unset). `.dev.vars` (gitignored) holds dev values plus `TEST_MODE=1`, which never exists in production config.

**Test mode** (`TEST_MODE=1` and request from localhost, both checked):
- every timer in `config.ts` is multiplied by `testTimeScale` (0.2, minimum 1,000 ms per phase);
- `POST /api/test/seed` creates the two courses, the fixture questions from `test/fixtures/questions.json`, and users `alice` and `bob` (password `testpass123`) through Better Auth's own sign-up;
- `POST /api/test/reset` empties app tables;
- two extra bots: level 0 "Dummy" (always wrong at 2 s) and level 9 "Oracle Bot" (always right at 2 s);
- `/dev/match` in the client runs the real engine in the browser against a bot, for UI work without a server.

## Data model (D1)

All app timestamps are integer epoch ms; app tables use snake_case. Better Auth tables use its own names.

### Better Auth tables

Generated once with `npx auth@latest generate` from `auth.cli.ts` into `db/auth-schema.ts`, then committed.
- **user**: `id` PK, `name` (first + surname), `email` unique, `emailVerified`, `image`, `createdAt`, `updatedAt`, `username` unique (lowercased), `displayUsername`, `firstName`, `lastName`, `role` default `user` (input false).
- **session**: `id`, `token` unique, `userId`, `expiresAt`, `ipAddress`, `userAgent`, `createdAt`, `updatedAt`.
- **account**: `id`, `accountId`, `providerId` (`credential` or `google`), `userId`, tokens, `scope`, `password`, `createdAt`, `updatedAt`.
- **verification**: `id`, `identifier`, `value`, `expiresAt`, `createdAt`, `updatedAt`.

### App tables

**courses**: `id` text PK (`agai`), `code` (`AGAI`), `title`, `short_title` (`Agentic AI`), `active` int, `sort` int. Seeded by the first migration (which also seeded `eprm`, Engineering; migration 0001 removed it). A course is added or re-added by a migration that inserts its row, then a bank import. Only active courses are offered, and the client hides the course switch while there is one.

**lectures**: `id` text PK (file stem, e.g. `AGAI-L05`, `AGAI-starter-games`), `course_id`, `title`, `sort` int, `note_url` text null. Written by the importer. Index `(course_id, sort)`.

**questions**:
- `id` text PK (e.g. `agai-3f9k2m`), `rev` int, `course_id`, `lecture_id`, `status` (`active`, `retired`), `type` (`single`, `multi`, `truefalse`, `cloze`, `order`, `match`)
- `prompt_md` null, `statement_md` null, `code_lang` null, `options_json` (array of `{id, text}`; for order the items, for match the items and `targets`), `key_json` (server only; see answer keys), `shuffle` int
- `why_md`, `why_short` (first sentence of `why`, max 25 words), `option_why_json` (`{optionId: reason}`), `note_url` null (with section anchor)
- `difficulty` (`easy`, `medium`, `hard`), `level`, `topics_json`, `time_s` null, `words` int, `chance` real
- `start_rating` real, `rating` real, `rating_n` int, `attempts` int, `correct` int
- `fingerprint`, `content_hash`, `source_path`, `created_at`, `updated_at`
- Indexes `(course_id, status, rating)`, `(lecture_id)`.

**ratings**: PK `(user_id, course_id, kind)`, `kind` in `ranked`, `bot`, `casual` (casual holds counters only).
- `rating` real null, `rd` real null, `vol` real null (ranked only), `n` int (bot: answers rated so far)
- `played`, `won`, `lost`, `drawn`, `surrendered`, `abandoned`, `cur_streak`, `best_streak`, `highest_bot_level` (bot only), all int default 0
- `last_played_at`, `updated_at`
- Index `(course_id, kind, rating DESC)`.

**player_course**: PK `(user_id, course_id)`, `answers` int, `correct` int, `last_answer_at`. Used for the "at least 10 answers before you move item ratings" guard and for totals.

**matches**:
- `id` text PK, `course_id`, `mode` (`ranked`, `private`, `bot`), `rated` int, `join_code` text unique null, `status` (`lobby`, `active`, `finished`, `cancelled`, `void`)
- `player_a`, `player_b` null (null for bot), `bot_level` null (0 to 9, or -1 for Echo), `bot_rating` null, `settings_json` (`{powerups, lectures}`), `loadout_a_json`, `loadout_b_json`
- `winner` (`a`, `b`, `draw`, null), `end_reason` (`hp`, `rounds`, `surrender`, `abandon`, `void`, `no_show`, `expired`), `rounds_played`, `hp_a`, `hp_b`
- `rating_a_before`, `rating_a_after`, `rating_b_before`, `rating_b_after` (ranked rating, null when unrated), `bot_rating_before`, `bot_rating_after` (player a's bot rating, bot matches only), `pair_capped` int
- `created_at`, `started_at`, `ended_at`
- Indexes `(player_a, ended_at)`, `(player_b, ended_at)`, `(status)`, `(course_id, mode, ended_at)`.

**match_rounds**: PK `(match_id, round_no)`, `question_id`, `question_rev`, `multiplier` real, `answer_a_json`, `answer_b_json`, `correct_a`, `correct_b`, `ms_a`, `ms_b` (null when no answer), `score_a`, `score_b`, `damage_to_a`, `damage_to_b`, `hp_a_after`, `hp_b_after`, `powerups_json` (armed, cancelled, used, phoenix).

**answers**: `id` text PK, `user_id`, `match_id`, `round_no`, `question_id`, `course_id`, `lecture_id`, `mode`, `correct` int, `timed_out` int, `ms` int null, `helped` int (Oracle), `answer_json`, `answered_at`. Indexes `(user_id, answered_at)`, `(user_id, question_id)`, `(user_id, course_id, lecture_id)`. Human answers only. Drives seen-question exclusion, accuracy per lecture and later item analysis.

**missed_questions**: PK `(user_id, question_id)`, `course_id`, `lecture_id`, `status` (`open`, `learned`), `times_missed` int, `first_missed_at`, `last_missed_at`, `last_answer_json` (in stable option ids, null for timeout), `last_match_id`, `learned_at` null, `retries` int, `retry_correct` int, `last_retry_at` null. Index `(user_id, status, course_id, lecture_id, last_missed_at DESC)`.

**match_finalizations**: `match_id` PK, `finalized_at`. First statement of the end-of-match batch, so a retried alarm cannot apply results twice.

**question_reports**: `id` PK, `user_id`, `question_id`, `question_rev`, `reason` (`wrong_answer`, `ambiguous`, `typo`, `other`), `note` text null (max 500 chars), `match_id` null, `created_at`, `resolved_at` null.

**question_imports**: `id` PK, `vault_commit`, `added`, `changed`, `rev_bumped`, `retired`, `unchanged`, `imported_at`.

**user_prefs**: `user_id` PK, `loadout_json` (default `["zeus","aegis","oracle"]`), `sound` int default 1, `course_id` null.

### Answer keys

`key_json` and client answers share one union (the client sends ids in its own per-match id space; the engine maps them back):

```ts
type AnswerKey =
  | { kind: "options"; ids: string[] }          // single, cloze: one id; multi: the correct set
  | { kind: "bool"; value: boolean }            // truefalse
  | { kind: "order"; ids: string[] }            // correct sequence
  | { kind: "match"; map: Record<string, string> }; // item id -> target id
```

Correct means: options, exact set equality (all or nothing); bool, equal; order, identical sequence; match, identical map.

## Game engine

Pure TypeScript in `src/shared/game/`, no Cloudflare imports, never reads the clock or `Math.random`. Everything below is in `config.ts` as named constants.

### Constants

| Constant | Value |
|---|---|
| startHp | 6000 |
| introMs | 4000 |
| armingMs | 3000 (2000 when power-ups are off) |
| bannerMs | 1500 (skipped when nothing was armed) |
| timerMs by type | truefalse 15000, single 20000, cloze 20000, multi 30000, order 30000, match 30000 |
| readingBonus | +1000 ms per started 15 words above 40, max +10000; item `time_s` overrides all of it |
| countdownMs | 5000; hermesCountdownMs 2000 |
| graceMs | 400 |
| revealMs | 5000 |
| maxRounds | 20; suddenDeathMax 5 |
| roundCap | 3000; zeusRoundCap 4500 |
| forfeitMs | 45000 (continuous disconnect) |
| noShowMs | 30000 (ranked and private, from match start) |
| lobbyTtlMs | 900000 |
| rematchMs | 20000 |
| cleanupMs | 600000 |
| questionsPerMatch | 25 |

### State

```ts
type Phase = "lobby" | "intro" | "arming" | "banner" | "question" | "reveal" | "finished" | "cancelled";
type Side = 0 | 1;
type PowerupId = "zeus" | "aegis" | "nemesis" | "oracle" | "hermes" | "phoenix";

interface PlayerState {
  kind: "human" | "bot";
  userId: string | null;            // null for bots
  name: string; avatarUrl: string | null;
  hp: number;
  loadout: PowerupId[];             // 3 distinct; [] when power-ups are off
  used: PowerupId[];                // spent, including cancelled and fizzled ones
  phoenixUsed: boolean;
  connected: boolean; everConnected: boolean; disconnectedSince: number | null;
  ready: boolean;
  botRating: number;                // bot rating (players) or strength (bots), item scale
  rankedBefore: { r: number; rd: number; vol: number } | null;
  bot: BotPlan | null;
  r: {                              // reset every round
    armed: PowerupId | null;        // chosen in the arming window
    effective: PowerupId | null;    // after Nemesis resolution
    nemesisAgainst: boolean;        // opponent's Nemesis hit this player
    quick: PowerupId | null;        // oracle or hermes used this round
    answer: AnswerKey | null;       // mapped to real ids
    answeredAt: number | null;
    hidden: string[];               // option ids removed by Oracle (real ids)
  };
}

interface MatchState {
  v: 1;
  matchId: string; courseId: string;
  mode: "ranked" | "private" | "bot"; rated: boolean;
  settings: { powerups: boolean; lectures: string[] | null };
  phase: Phase; phaseEndsAt: number | null;
  round: number;                    // 1-based, 0 before round 1
  suddenDeath: number;              // sudden-death rounds played
  players: [PlayerState, PlayerState | null];
  questions: QuestionFull[]; qIndex: number;   // with keys; never sent
  q: {
    question: QuestionFull;
    shownAt: number; timerMs: number; deadline: number;
    firstSide: Side | null; countdownEnd: number | null;
    idMap: [Record<string, string>, Record<string, string>];   // opaque -> real, per side
    order: [string[], string[]];                                // display order, opaque ids
  } | null;
  rounds: RoundRecord[];
  rng: number;                      // PRNG state
  createdAt: number; startedAt: number | null;
  noShowAt: number | null; lobbyExpiresAt: number | null;
  result: { winner: Side | "draw" | null; reason: EndReason; endedAt: number } | null;
  rematch: [boolean, boolean]; rematchUntil: number | null;
  cleanupAt: number | null; finalized: boolean;
}
```

### Interface

```ts
step(state: MatchState, event: EngineEvent, now: number): {
  state: MatchState;
  out: { to: Side; msg: ServerMessage }[];   // already personalised per side
  effects: Effect[];                          // { kind: "finalize" } | { kind: "rematch" } | { kind: "started" } | { kind: "cancelled" }
};
nextDeadline(state: MatchState): number | null;   // earliest of phaseEndsAt, round end, bot actions, forfeit, no-show, lobby expiry, rematch window, cleanup
view(state: MatchState, side: Side, now: number): SnapshotMessage;

type EngineEvent =
  | { type: "init"; init: MatchInit }
  | { type: "join"; player: PlayerInit; questions: QuestionFull[] }
  | { type: "connect"; side: Side } | { type: "disconnect"; side: Side }
  | { type: "ready"; side: Side }
  | { type: "arm"; side: Side; round: number; powerup: PowerupId | null }
  | { type: "use"; side: Side; round: number; powerup: "oracle" | "hermes" }
  | { type: "answer"; side: Side; round: number; answer: ClientAnswer }
  | { type: "surrender"; side: Side }
  | { type: "rematch"; side: Side }
  | { type: "tick" }
  | { type: "cancel"; reason: string };
```

`tick` processes every due deadline in time order in one call (loop until nothing is due), so a late alarm never skips a transition. Invalid events (wrong phase, wrong round, already answered, power-up not in loadout) return the state unchanged and one `error` message to that side.

### Phases

- **lobby.** Private: host present; `join` adds player b and the questions. Both `ready` and connected starts the intro. Ranked and bot matches are created already joined and auto-ready, so they start the intro as soon as every human is connected. `noShowAt = createdAt + noShowMs` (ranked, and private once b joined): if a human never connected by then, `cancelled` with reason `no_show`, no rating change. Lobby with no second player at `lobbyExpiresAt`: `cancelled`, `expired`. Effect `started` on entering intro (DO sets D1 status `active`).
- **intro** (introMs): both players, loadouts, ratings, rated flag.
- **arming** (armingMs): `round += 1`, reset `r`. Players may `arm` zeus, aegis or nemesis (tap again or `arm: null` to unarm; switching allowed). At the end, resolve (below). If anyone armed: **banner** (bannerMs), else straight to question.
- **question**: take `questions[qIndex++]`, generate a fresh opaque id (6 chars) per option per side and a shuffled order per side (unless `shuffle` is false), `shownAt = now`, `deadline = now + timerMs`. Plan bot answers. Round end is `(countdownEnd ?? deadline) + graceMs`, or immediately when both players have answered.
- **answer**: accepted if phase is question, round matches, not yet answered, and `now <= ownDeadline + graceMs`, where ownDeadline is `deadline` for the first answerer and `min(deadline, countdownEnd)` for the second. On the first answer: `countdownEnd = min(deadline, now + (first answerer used Hermes this round ? 2000 : 5000))`. Wrong answers start the countdown too.
- **reveal** (revealMs): scores, damage, Phoenix, HP; one `reveal` message per side. If a player is at 0 HP, the match ends when the reveal ends.
- After reveal: if someone is at 0 HP, finish (`hp`). Else if `round >= maxRounds`: higher HP wins (`rounds`); equal HP starts sudden death: more rounds at the round-20 multiplier, ending at the first round that deals damage, or a draw after 5. Else next arming.
- **finished**: effect `finalize`. `rematchUntil = now + rematchMs` for private and bot matches (bots accept at once). Both accepted: effect `rematch`. `cleanupAt = endedAt + cleanupMs`.
- **surrender** (any phase from intro to reveal): finish, other side wins, reason `surrender`.
- **disconnect**: `connected = false`, `disconnectedSince = now`. Rounds keep running. In phases intro to reveal, at `disconnectedSince + forfeitMs` that side abandons (other side wins, `abandon`). If both sides are past the forfeit deadline: `void`, no rating changes. **connect** clears it and sends a snapshot to that side and `opponent_connection` to the other.

### Score, multiplier, damage

```
t = clamp(answeredAt - shownAt, 0, timerMs)
score = correct ? round(1000 * (1 - t / (2 * timerMs))) : 0         // 500..1000, 0 if wrong or no answer
multiplier(round) = round <= 4 ? 1 : 1 + 0.5 * (min(round, 20) - 4)

if score0 == score1: no damage
att = side with the higher score; def = the other
raw  = (scoreAtt - scoreDef) * multiplier
zeus = att.r.effective == "zeus"
dmg  = min(raw * (zeus ? 2 : 1), zeus ? 4500 : 3000)
if def.r.effective == "aegis": dmg = dmg / 2
dmg  = round(dmg)
hp   = def.hp - dmg
if hp <= 0 and "phoenix" in def.loadout and not def.phoenixUsed and not def.r.nemesisAgainst:
    hp = 1; def.phoenixUsed = true; def.used += "phoenix"
def.hp = max(0, hp)
```

Zeus armed by the side that does not deal damage fizzles; Aegis armed by the side that takes no damage is unused. Both are spent either way.

### Power-ups

All checks: power-ups on, power-up in loadout, not in `used`, at most one non-passive power-up per player per round (an armed one, even if cancelled, counts).

**Arming resolution** at the end of the arming window, with `a0`, `a1` the armed choices:
```
for each side i (o = other side):
  effective_i      = (a_o == "nemesis") ? null : a_i
  nemesisAgainst_i = (a_o == "nemesis") and (a_i != "nemesis")
  if a_i: used_i += a_i
```
Two Nemeses cancel each other and suppress no Phoenix. Banner list per side: `{side, powerup, outcome}` where outcome is `active`, `cancelled` (hit by Nemesis), `nemesis_hit` (Nemesis cancelled something), `nemesis_watch` (opponent armed nothing but holds an unused Phoenix), `nemesis_wasted`.

**Oracle** (`use` during question, before answering; not on truefalse, order or match): single and cloze with k options: hide k - 2 wrong options (key plus one wrong option remain). Multi: hide 1 wrong option. Wrong options to hide are chosen with the match PRNG. The user gets `powerup_result {hidden: opaque ids}`; the opponent gets `opponent_powerup {powerup: "oracle"}`. The answer is flagged `helped`.

**Hermes** (`use` during question, before answering): stored in `r.quick`; applies only if this side answers first. Opponent gets `opponent_powerup {powerup: "hermes"}` immediately.

**Phoenix**: passive, see damage.

### Question timing

`words` = word count of prompt or statement plus all option texts (computed by the importer). `timerMs = time_s * 1000` if set, else `timerByType + min(10000, ceil(max(0, words - 40) / 15) * 1000)`.

### Bot model

Bot strength `R` on the item scale. Ladder: level L (1 to 8) has `R = 1050 + 150 * (L - 1)`, names Icarus, Narcissus, Sisyphus, Pandora, Odysseus, Cassandra, Athena, Prometheus. Echo: `R = player's bot rating - 75`. Test-only levels 0 and 9 as above. Speed level `s = clamp(1 + (R - 1050) / 150, 1, 8)`.

Per question with item rating `beta`, chance floor `c` (single and cloze `1/k`, truefalse 0.5, multi `1/(2^k - 1)`, order `1/n!`, match `1/targets^items`):
```
pKnow = 1 / (1 + 10^((beta - R) / 400))
knows = rng() < pKnow
answer = knows ? key : uniform random answer from the type's answer space
         (single: random option; multi: random non-empty subset; truefalse: coin; order: random permutation)
base   = { truefalse: 6000, single: 8000, cloze: 8000, multi: 12000, order: 12000, match: 12000 }[type]
floor  = 1500 + 25 * words
if knows: t = base * (1.25 - 0.07 * (s - 1)) * exp(normal(0, 0.35)) + 25 * words
else:     t = uniform(0.60, 0.95) * timerMs
t = clamp(t, floor, 0.95 * timerMs)
```
When the human answers first and the bot's planned time is after `countdownEnd`: with probability 0.8 the bot answers a random guess at a uniform time before `countdownEnd`, else it times out. Normal draws use Box-Muller on the match PRNG.

Bot loadout: 3 distinct power-ups drawn with the PRNG at init. Policy (levels 4 to 9 and Echo; levels 1 to 3 pick their rounds at random from 1 to 12 instead):
- Zeus: arm in a round drawn at init from 5 to 9.
- Nemesis: arm in a round drawn at init from 3 to 8.
- Aegis: arm in the first arming window after its HP drops below 3000.
- Priority if two fall in one round: Zeus, then Nemesis, then Aegis.
- Oracle: when it does not know, on an eligible type, at `shownAt + 1500` (it then guesses among what remains).
- Hermes: when it knows and the round is 3 or later, at `shownAt + 500`.

### Question selection

`select.ts`, pure: `selectQuestions(candidates, { target, count: 25, seenRecently, lastSeen, rng })`.
1. Candidates: `status = 'active'`, course, lecture filter if any, type in the UI-supported set.
2. Target item rating: ranked and private: mean of both players' bot ratings minus 150; bot match: mean of the player's bot rating and the bot's R, minus 150. A player with no bot rating counts as 1500.
3. Split into fresh (neither player answered it in the last 7 days) and seen.
4. Weighted sample without replacement from fresh, weight `exp(-((rating - target) / 250)^2)`.
5. If fewer than 25, fill from seen, oldest last-seen first.

Provisional items are allowed in rated matches in this release, since every item is provisional at launch.

### Ratings

**Ranked, Glicko-2** (`glicko2.ts`): start r 1500, RD 350, vol 0.06, tau 0.5, convergence epsilon 1e-6 (Illinois method, Glickman's step 5). RD clamped to 45 to 350, rating floor 400, at most 700 change per game. Provisional while RD >= 110. Before each update, for each full idle day since `last_played_at`, inflate `phi = sqrt(phi^2 + vol^2)` (on the Glicko-2 scale, capped at RD 350). One game is one rating period; win 1, loss 0, draw 0.5. Surrender and abandon are losses. Void and cancelled change nothing.

Pair cap: before finalizing a rated match, count rated finished matches between the same two users that ended today (Europe/Amsterdam calendar day). If 5 or more, apply no rating change, set `pair_capped = 1`, and the end screen says so. Stats still count.

**Bot rating and item ratings, per answer** (`elo.ts`):
```
P(theta, beta, c) = c + (1 - c) / (1 + 10^((beta - theta) / 400))
Ks(n) = max(24, 174 / (1 + 0.05 n))     // n = player's rated bot answers in this course,
                                         // reduced by 1 per 3 full idle days
Ki(m) = max(8, 174 / (1 + 0.05 m))      // m = item's rating_n
theta += Ks(n) * (x - P);  n += 1       // x = 1 correct, 0 wrong or timed out
beta  -= Ki(m) * (x - P)                // written as a relative update
```
- Player bot rating moves on bot-match answers only, processed in round order. Display "?" while `n < 30`.
- Item ratings move on human answers from every mode, if: the player has at least 10 answers in the course (`player_course.answers`), the answer was not helped by Oracle, the player did not answer this item in the previous 30 days, and it was not a timeout after the opponent's countdown started.
- Oracle-helped answers move neither the player nor the item.
- Item Δ uses the item rating as loaded at match start; written as `rating = rating + ?` so concurrent matches compose.

### Finalization

`finalize.ts`, pure: `planFinalization(state, ctx) -> FinalizationPlan`, where `ctx` holds current rating rows for both players, `player_course` rows, recent-answer sets for the 30-day item guard, the pair count, and `now`. The plan lists: match row update, round rows, answer rows, missed-question upserts, item rating deltas and counters, rating row upserts (ranked Glicko results, bot rating, counters, streaks, highest bot level), player_course increments, and the per-side rating summaries sent in `match_end`. `finalize-writer.ts` turns the plan into one `db.batch()` that starts with `INSERT INTO match_finalizations`.

Missed questions: every human answer that was wrong or timed out upserts `(user_id, question_id)`: `times_missed + 1`, `last_missed_at`, `last_answer_json`, `last_match_id`, `status = 'open'` (a learned question missed again reopens).

Stats: ranked and rated private matches count on the `ranked` row, unrated private matches on `casual`, bot matches on `bot`. Win streak: `cur_streak` resets on loss or draw.

## Durable Objects

### MatchRoom

One per match, `env.MATCH_ROOM.getByName(matchId)`, SQLite-backed. The shell around the engine:

1. Load `state` from `ctx.storage.get("state")` (cache in memory, but correctness never depends on the cache).
2. Map the incoming thing to an `EngineEvent`: RPC call, WebSocket message (zod-parsed with `ClientMessage`), `webSocketClose` (disconnect), `alarm()` (tick).
3. `step(state, event, Date.now())`.
4. `ctx.storage.put("state", newState)`.
5. Send `out` to sockets found by tag (`ctx.getWebSockets(userId)`); bots have no socket.
6. Effects: `started` updates the D1 row to `active`; `finalize` reads the context rows, calls `planFinalization`, runs the batch (a primary-key error on `match_finalizations` means already done), then sets `finalized`; `rematch` calls `createMatch` with the same settings and sends `rematch {matchId}` to both; `cancelled` updates D1.
7. `ctx.storage.setAlarm(nextDeadline(newState))` or delete the alarm when null.
8. At `cleanupAt`: `ctx.storage.deleteAll()`.

RPC (`do/contracts.ts`):
```ts
interface MatchRoomRpc {
  init(init: MatchInit): Promise<void>;                                  // idempotent on matchId
  join(player: PlayerInit, questions: QuestionFull[]): Promise<JoinResult>; // "ok" | "full" | "expired" | "not_lobby"
  cancel(reason: string): Promise<void>;
  summary(): Promise<{ phase: Phase; players: string[] }>;
}
```
`fetch()` only accepts the WebSocket upgrade. The Worker has already authenticated the user, checked membership in D1 and the `Origin` header, and passes `x-user-id`. The DO rejects non-players (close 4003). A second socket for the same user closes the older one with 4001. Attachment: `{ userId }`. `setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"))`. Close reasons stay under 123 bytes.

### Matchmaker

One per course, `getByName("mm:" + courseId)`, `locationHint: "weur"`.
- Client opens `GET /api/queue/ws?course=agai`. The Worker authenticates, refuses if the user has an `active` match (`already_in_match` with its id), loads the ranked rating, and forwards with `x-user-id`, `x-rating`, `x-rd`.
- Attachment: `{ userId, rating, rd, joinedAt, lastOpponent }`. One socket per user (newer replaces older).
- Pairing on every join and on an alarm every 2 s while 2 or more are queued: allowed gap `100 + 50 * floor(waitedSec / 5)`, unlimited from 45 s; a provisional player (RD >= 110) starts at 350. A pair needs both players' windows to allow the gap. Closest pair first; avoid `lastOpponent` when another candidate fits.
- On a pair: `createMatch({ mode: "ranked", rated: true, ... })`, send `matched {matchId}` to both, close both with 1000.
- Broadcast `queue_status {searching}` to all queued sockets when the count changes. RPC `searching(): number` for the home endpoint.

### Match creation

`match-factory.ts`: `createMatch(env, spec)` where `spec = { courseId, mode, rated, settings, humans: string[], bot?: { level: number | "echo" }, joinCode?: string }`.
1. Refuse if any human has a match with status `active` (and cancel lobbies they host).
2. Load users, prefs (loadouts), ratings rows, recent answers (7 days) for selection.
3. Select 25 questions (private lobbies with one human: select at join time instead).
4. Insert the `matches` row, then `MATCH_ROOM.getByName(id).init(...)`.
5. Return `{ matchId, code? }`.

Join codes: 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, retried on unique-index collision.

## WebSocket protocol

All frames are JSON text with a `type` field, validated with zod on both sides (`src/shared/protocol.ts`). Every server message carries `serverNow`; the client keeps `offset = mean(serverNow - Date.now())` over the last 5 messages and renders countdowns from server deadlines. Option ids in match messages are the per-match opaque ids of the receiving player.

### Client to server (match)

| type | fields | when |
|---|---|---|
| `ready` | | lobby |
| `arm` | `round`, `powerup` (zeus, aegis, nemesis or null) | arming |
| `use` | `round`, `powerup` (oracle, hermes) | question, before answering |
| `answer` | `round`, `answer` (ClientAnswer) | question |
| `surrender` | | intro to reveal |
| `rematch` | | finished, within 20 s |

Plus the text frame `ping` (auto-answered `pong`), every 20 s.

### Server to client (match)

| type | fields |
|---|---|
| `snapshot` | full view for this side: phase, phaseEndsAt, round, multiplier, you and opponent (name, avatar, hp, loadout, used, connected), mode, rated, settings, current question (without key) with your option order and your Oracle hides, your answer, whether the opponent answered, countdownEnd, last reveal, result. Sent on every connect |
| `lobby` | code, players (name, avatar, ready), rated, settings |
| `intro` | phaseEndsAt, you, opponent (name, avatar, rating shown, provisional, loadout), mode, rated |
| `arming` | round, multiplier, phaseEndsAt, armable (your unused zeus, aegis, nemesis) |
| `armed_ack` | round, powerup (your own choice, echoed) |
| `banner` | round, phaseEndsAt, items: [{ who: "you" or "opponent", powerup, outcome }] |
| `question` | round, type, prompt, statement, codeLang, options [{ id, text }] in display order, timerMs, shownAt, deadline, multiplier |
| `answer_ack` | round, countdownEnd (null if you answered second) |
| `opponent_answered` | round, countdownEnd (your new deadline) |
| `powerup_result` | round, powerup, hidden (Oracle: opaque ids) |
| `opponent_powerup` | round, powerup |
| `reveal` | round, key (your id space), yourAnswer, opponentAnswer (your id space; null for no answer), yourCorrect, opponentCorrect, yourMs, opponentMs, yourScore, opponentScore, multiplier, damageToYou, damageToOpponent, capped, zeus, aegis, phoenix (who), hp {you, opponent}, whyShort, savedToMissed, phaseEndsAt |
| `opponent_connection` | connected, forfeitAt |
| `match_end` | result (win, loss, draw, void, cancelled), reason, hp, rounds, ranked {before, after, provisional} or null, bot {before, after, provisional} or null, pairCapped, summary {correct, answered, fastestMs, biggestHit, powerupsUsed}, missedCount, rematchUntil |
| `rematch` | state (offered, accepted), by (you or opponent), matchId (when accepted) |
| `error` | code (not_a_player, wrong_phase, round_closed, already_answered, powerup_unavailable, bad_message), message |

No message before `reveal` may contain the key, correctness, or anything derived from it (Oracle hides are the one intended exception for the user of Oracle). A test scans every outbound frame for this.

### Queue

Client to server: nothing but `ping`; leaving the queue is closing the socket. Server to client: `queue_status {searching, waitedMs, window}`, `matched {matchId}`, `error {code}` (`already_in_match` with `matchId`).

### Close codes

1000 normal end, 4001 replaced by a newer connection, 4003 not authorised, 4004 match not found. Client reconnect: on any other close, back off 0.5 s doubling to 5 s with jitter; on `visibilitychange` to visible, reconnect at once.

## HTTP API

All under `/api`, JSON, zod-validated with schemas in `src/shared/api-schemas.ts`. Session required except auth, health, config and avatars.

| Method and path | Body or query | Returns |
|---|---|---|
| GET `/health` | | `{ ok }` |
| GET `/config` | | `{ googleEnabled, emailEnabled, testMode }` |
| GET, POST `/auth/*` | Better Auth | |
| GET `/me` | | user, prefs, `needsOnboarding` (username null), `activeMatchId` |
| PATCH `/me` | `username?`, `firstName?`, `lastName?` | user |
| PUT `/me/avatar` | raw JPEG, PNG or WebP, max 512 KB | `{ image }` |
| DELETE `/me/avatar` | | `{ image: null }` |
| PUT `/me/prefs` | `loadout?` (3 distinct), `sound?`, `courseId?` | prefs |
| GET `/avatars/:key` | | image, immutable cache |
| GET `/courses` | | courses with lectures and active question counts |
| GET `/home` | `course` | ranked and bot rating views, searching count, open missed count, last 3 matches, next ladder bot |
| GET `/bots` | `course` | Echo rating, ladder with unlocked and beaten flags |
| POST `/bot-matches` | `courseId`, `bot` (echo or 1 to 8), `lectures?` | `{ matchId }` |
| POST `/lobbies` | `courseId`, `lectures?`, `powerups`, `rated` | `{ matchId, code }` (rated forced false with any custom setting) |
| POST `/lobbies/join` | `code` | `{ matchId }` |
| GET `/matches/:id/ws` | upgrade | |
| GET `/queue/ws` | `course`, upgrade | |
| GET `/matches/:id` | | finished match with rounds, questions and both answers (any signed-in user) |
| GET `/users/:username` | `course?` | profile, per-course stats, accuracy per lecture, head-to-head with the viewer |
| GET `/users/:username/matches` | `course?`, `before?` | 20 match summaries |
| GET `/leaderboards/:course` | | `{ established, provisional }` rows: rank, user, rating, played, won |
| GET `/missed` | `course`, `lecture?`, `status` (open, learned), `before?` | `{ count, items }`: questionId, lectureId, lectureTitle, preview (first 140 chars), timesMissed, lastMissedAt |
| GET `/missed/:questionId` | | question with stable option ids, no key; status, timesMissed |
| GET `/missed/:questionId/answer` | | key, lastAnswer, why, optionWhy, noteUrl |
| POST `/missed/:questionId/retry` | `answer` (stable ids) | correct, key, why, optionWhy, noteUrl, status (learned when correct) |
| POST `/missed/:questionId/status` | `status` (open, learned) | status |
| POST `/questions/:id/report` | `reason`, `note?`, `matchId?` | `{ ok }` |
| POST `/test/seed`, `/test/reset` | test mode only | |

Missed endpoints only ever touch the caller's own rows, and work only for questions the caller has a row for. Retries change no rating, no item and no stat other than the missed row's retry counters.

## Auth

Better Auth 1.7.12 with the Drizzle adapter on D1, built per request by a factory `createAuth(db, env)` with no module-level Cloudflare imports (so `npx auth@latest generate` can import `auth.cli.ts` in Node).

- `baseURL: env.APP_URL`, `trustedOrigins: [env.APP_URL]`, base path `/api/auth`.
- `emailAndPassword: { enabled: true, minPasswordLength: 8, requireEmailVerification: false, sendResetPassword }` (reset only when email works).
- `emailVerification: { sendOnSignUp: emailEnabled, autoSignInAfterVerification: true }`.
- `user.additionalFields`: `firstName`, `lastName` (required, 1 to 50 chars), `role` (input false).
- `username()` plugin: 3 to 20 characters, letters, digits, underscore, dot.
- `socialProviders.google` only when both Google secrets exist: `prompt: "select_account"`, `mapProfileToUser` copies `given_name`, `family_name`, `picture`. Google users have no username, so `/me` reports `needsOnboarding` and the client sends them to the onboarding screen first.
- Session: 60 days, refreshed daily (phones).
- Rate limit: `AUTH_LIMITER` keyed by `cf-connecting-ip` on sign-up, sign-in and password reset; Better Auth's in-memory limiter off.
- `email.ts`: `sendEmail(env, msg)` uses `env.EMAIL.send`; on a missing binding or failure it logs and returns false, never throws into sign-up.
- WebSocket routes check `Origin === APP_URL`.
- `scripts/admin-set-password.ts <username>`: prints a temporary password and writes its hash (same scrypt parameters as Better Auth, via `@better-auth/utils`) with `wrangler d1 execute`. The fallback while email is not onboarded.

## Question bank

### Where it lives

In the vault at `docs/quiz/<COURSE>/<lecture>.quiz.yaml` (for example `docs/quiz/AGAI/AGAI-L05.quiz.yaml`, `docs/quiz/EPRM/EPRM-W02.quiz.yaml`, starter files `docs/quiz/AGAI/AGAI-starter-games.quiz.yaml`). `docs/` is not published by the notes site; confirm against the site's `sync.sh` before the first import. If Stas picks `Courses/<COURSE>/Quiz/` instead, the site must ignore those folders first.

### YAML format

File level: `course` (`AGAI` or `EPRM`), `lecture` (equals the file stem without `.quiz`), `title` (shown in the lecture filter, e.g. "L05 LLM agents and ReAct"), `sort` (optional int), `note` (optional: vault note filename stem; must exist when given), `questions`.

Item fields (from `../research/questions-and-courses.md`, with `section` required only when the file has a `note`):

| Field | Rule |
|---|---|
| `id` | writers put `new`; the tool assigns `<course>-<6 chars>` once; never edited or reused |
| `rev` | default 1; bump only when the meaning changes; a new rev resets the item's rating |
| `status` | `active` (default), `draft` (not exported), `retired` (exported as retired) |
| `type` | `single`, `multi`, `truefalse`, `cloze`, `order`, `match` |
| `difficulty` | `easy`, `medium`, `hard` (start rating 1300, 1500, 1700) |
| `level` | `remember`, `understand`, `apply`, `analyze` |
| `topics` | list of concept names |
| `section` | heading in the note, for the deep link |
| `prompt` | Markdown; not for truefalse |
| `code` | language of code in prompt or options |
| `options` | single, multi, cloze: `{id, text, correct, why}`; `why` required on every wrong option |
| `shuffle` | default true |
| `statement`, `answer` | truefalse |
| `items` | order: `{id, text}` in the correct order |
| `targets`, `pairs` | match: target names; `{id, text, target}` |
| `why` | explanation, at most about 60 words; its first sentence (max 25 words) is the in-match reveal line |
| `time` | seconds, overrides the derived timer |

### The tool

`scripts/quiz-bank.ts`, run as `npm run bank -- <command> --vault ../university-vault`:
- `ids`: replaces each item-level `id: new` with a fresh id (alphabet `23456789abcdefghjkmnpqrstuvwxyz`), unique across the vault and `bank/fingerprints.json`, by text substitution so comments and formatting survive.
- `check`: validates every file and exits non-zero on errors. Errors and warnings exactly as in the research report's checklist ("Checked by the script"), plus: fingerprint changed without a rev bump; id from `fingerprints.json` missing (must be retired); `yaml` parsed strictly (YAML 1.2 core schema, so `no` stays a string; type errors are errors).
- `export`: check, then write `bank/bank.json` (gitignored) and update `bank/fingerprints.json` (`{id: {rev, fingerprint}}`, committed). Fingerprint = sha256 of type, option ids, key. Content hash = sha256 of all displayed text.
- `import --local | --remote`: export, then generate `bank/import.sql` and run `wrangler d1 execute DB --file bank/import.sql` with the flag. Upserts courses' lectures and questions with `ON CONFLICT(id) DO UPDATE` that never touches `rating`, `rating_n`, `attempts`, `correct`, except on a rev change, where `rating = start_rating, rating_n = 0`. Questions in D1 missing from the bank get `status = 'retired'` (never deleted). Inserts a `question_imports` row with the vault's `git rev-parse HEAD`. Prints added, changed, rev-bumped, retired, unchanged. Only courses active in D1 are imported: quiz files of another course (today `docs/quiz/EPRM/`) are still checked, then skipped with one line, `import: skipped EPRM, not an active course in D1 (...)`.

Note URLs: `NOTES_URL + "/Courses/<COURSE>/Lectures/" + slug(note) + "#" + anchor(section)`. Copy the slug rule from a live note URL on notes.swasilewski.com (spaces and " - " become hyphens, per the research report); anchors follow github-slugger (lowercase, punctuation removed, spaces to hyphens). Verify one generated URL with `curl -I` before the first import. No note, no URL, and the client hides the link.

### Starter bank

So the game is playable before any lecture questions exist: about 60 reviewed questions per course, written in the vault format, files named `<COURSE>-starter-<topic>.quiz.yaml`, no `note` field.

Agentic AI, from the catalogue's topics and the named readings (no Canvas material yet; anything the writer is not sure of is left out):
- `starter-agents` (10): rational agents, environment properties, utility, bounded rationality.
- `starter-games` (14): normal-form games, dominance, Nash equilibrium, Pareto optimality, prisoner's dilemma, mixed strategies as a concept. 2x2 pure-equilibrium items only if Stas allows them.
- `starter-repeated` (10): repeated games, tit-for-tat, the folk theorem idea, stochastic games.
- `starter-marl` (12): independent learners, non-stationarity, centralised training with decentralised execution, self-play, credit assignment.
- `starter-llm-agents` (14): ReAct, tool calling, planning, memory, multi-agent frameworks (LangGraph, AutoGen), interaction protocols, deployment risks.

Engineering, from the week 1 to 5 decks on Canvas (readable through the Canvas MCP), 12 per week: roles and lifecycle, clean code, unit tests and FIRST; distributed processing, OLTP and OLAP, columnar storage, Spark narrow and wide operations, lazy evaluation; containers and VMs, test levels, GitFlow, technical debt; deployment patterns, DAG triggers, HTTP methods and status codes; reactive and proactive monitoring, log levels, Prometheus metric types, system, data and business monitoring, alert fatigue, CI and CD.

Mix: about 45% single (including scenario and "which is NOT"), 20% multi, 20% truefalse, 10% cloze, and for Engineering about 6 code-option items. No order or match in the starter set. Difficulty about 30% easy, 45% medium, 25% hard. Each course gets an independent reviewer who answers every item cold from the stem, then checks key, distractors, trivia and the no-computation rule, per the research checklist.

A 30-question fixture (`test/fixtures/questions.json`, mixed types, known keys) is separate and used only by tests and test mode.

## Client

- Routes: `/` (landing, or Home when signed in), `/login`, `/signup`, `/onboarding`, `/bots`, `/queue`, `/friend` (create or join), `/join/:code`, `/match/:id` (lobby, duel and end screen), `/missed`, `/missed/:questionId`, `/missed/run`, `/leaderboard`, `/profile`, `/u/:username`, `/history`, `/matches/:id`, `/settings`, `/dev/match` (dev builds only).
- Data: TanStack Query over typed fetch helpers built from `api-schemas.ts`. Auth: `createAuthClient` from `better-auth/react` with `usernameClient()`.
- Theme tokens in `styles.css` as CSS variables: navy background, teal (you), orange (opponent), gold (Zeus), red and gold for ranked, blue for bot. Dark only in this release.
- Match screen: one reducer over `ServerMessage`s; timers from server deadlines plus clock offset; wake lock during a match; `navigator.vibrate` on hits where available; `prefers-reduced-motion` swaps shakes and flashes for fades; banners never cover the question while the timer runs (they play in the banner phase, and quick power-up banners for the opponent are a small toast).
- Sound: `sfx.ts` with Web Audio (thunder: filtered noise burst; shield: short metallic ping; tick; thud; fanfare), unlocked on the first tap, muted per device via `user_prefs.sound` and localStorage.
- Layout at 390 x 844 first, 48 px minimum tap targets, `100dvh`, no horizontal scroll, laptop gets a centred 480 px column.

## Testing

**Unit (Vitest 4.1 in Node, `vitest.unit.config.ts`)**
- Engine: scripted matches with a fixed seed for every rule in this file, including each power-up interaction (Zeus vs Aegis, Zeus vs Nemesis, Nemesis vs Nemesis, Nemesis vs Phoenix, Phoenix with Zeus over the cap, Oracle on each type, Hermes first and second), countdown, grace, timeouts, multiplier, caps, sudden death, surrender, abandon, void, no-show, lobby expiry, rematch.
- A simulation: 2,000 seeded bot-vs-bot matches across levels: every match ends within 25 rounds, HP never below 0, at most one side damaged per round, same seed gives the same match, and no outbound frame before a reveal contains a key id, a correctness flag, or a hidden option that the receiver did not request.
- Bot calibration: equal-strength bots win close to 50%; a 100-point gap gives roughly 60 to 75% (sanity band, from the research simulation's 69%).
- Ratings: Glickman's worked example (r 1500, RD 200, vol 0.06 against 1400/30 win, 1550/100 loss, 1700/300 loss, tau 0.5 gives about 1464.06, 151.52, 0.05999); idle-day inflation; clamps; Elo formulas; `planFinalization` for ranked win, surrender, abandon, void, pair cap, bot match with Oracle answers, item guards.
- Bank tool: fixture vaults covering each error and warning, id assignment preserving comments, fingerprint and rev checks, SQL generation never touching ratings.

**Worker and D1 (`@cloudflare/vitest-plugin` 1.4.7)**
- Current API: `cloudflareTest` plugin inside `defineConfig` from `vitest/config`, `env` and `exports` from `cloudflare:workers` (`exports.default.fetch` replaces `SELF`), migrations via `readD1Migrations` and `applyD1Migrations`.
- API tests: sign-up, sign-in, onboarding, `/me`, prefs validation, avatar upload limits and magic bytes, lobbies create and join, bot match creation, leaderboards, missed list, retry, status, ownership checks, reports, test routes refused without test mode.

**Durable Objects (`vitest.do.config.ts`, run with `--max-workers=1 --no-isolate`, the documented WebSocket workaround)**
- Two WebSockets through `exports.default.fetch` for two seeded users; play a match with `runDurableObjectAlarm(stub)` to fire deadlines; reconnect gets a snapshot; second socket closes the first with 4001; abandon after forfeit; finalize runs once even when the alarm runs twice (`match_finalizations`); D1 rows correct afterwards (match, rounds, answers, missed, ratings, items).
- Matchmaker: two sockets pair; window widening with simulated waits; `already_in_match`.
- Leak test: record every frame; none before `reveal` contains the key.

**End to end (Playwright 1.56.1, `chromium-1194`)**
- `webServer`: `wrangler d1 migrations apply DB --local`, then `vite build && vite preview` with test mode.
- Projects: desktop Chromium and `devices["Pixel 7"]`.
- Two-player tests with two browser contexts: sign up both; A creates a private match, B joins by code; full match to 0 HP; a timeout round; surrender; reconnect (close B's page, open a new one, sees the snapshot); abandon (close B's context, A wins after the shortened forfeit); ranked queue pairs two contexts; rematch.
- Single player: bot match against Dummy to a win, check the bot rating change on the end screen, then open Missed, retry a question, mark learned.
- Screenshots of every screen at 390 x 844 attached to the run, for the phone review.
- Google OAuth is not E2E-tested; unit-test `mapProfileToUser` and the onboarding redirect.

**Scripts**: `test:unit`, `test:worker`, `test:do`, `test:e2e`, `test` (all but e2e), `typecheck`, `lint:copy` (greps UI strings and bank files for em-dashes and emoji).

## Deploy

Live at https://uvarena.swasilewski.com since 2026-10-23. Deploy from the repo root of this container:

```bash
export CLOUDFLARE_API_TOKEN=placeholder          # the proxy injects the real token
export CLOUDFLARE_ACCOUNT_ID=2b601c6ade78558b75079f4a71ac23c8
npm run deploy
```

Why not `wrangler deploy`: the container's proxy puts the account token on every request to `*.cloudflare.com`, which overwrites the short-lived JWT that the Workers static asset upload uses, so `POST .../workers/assets/upload` answers 401. Plain API calls (script upload, D1, R2) work. So production serves the SPA from the R2 bucket `uvarena-static` instead of Workers static assets:

- `scripts/deploy.ts` runs `vite build`, uploads every changed file in `dist/client/` to `uvarena-static` (compared by MD5 against the bucket listing, `index.html` last, `_headers` and dot files skipped, old hashed chunks kept for clients still on the previous version), writes `dist/uvarena/wrangler.deploy.json` (the generated config without `assets`, plus the `STATIC` R2 binding) and runs `wrangler deploy --config` on it.
- If the Worker does not exist or has no `BETTER_AUTH_SECRET`, it generates one with `openssl rand` into a umask-077 temp file (set `DEPLOY_SECRETS_DIR` to the session scratchpad in the cloud container), passes it with `--secrets-file` and deletes it. The value is never printed.
- It does not trust wrangler's exit code (wrangler can fail on `/workers/routes` after a good upload): it checks through the API that the Worker was updated, has the `STATIC` binding and the secret, and that the custom domain `uvarena.swasilewski.com` points at it, attaching the domain if it is missing.
- With `STATIC` bound, `src/worker/index.ts` sends every non-`/api` request to `src/worker/static.ts`: content type by extension, ETag and `If-None-Match`, `public, max-age=31536000, immutable` under `/assets/`, `no-cache` elsewhere, `index.html` for unknown app routes, a real 404 for missing `/assets/*` and known file types, HEAD, and the security headers parsed from `public/_headers` at build time (in production `_headers` itself is not applied by anything else). Local dev, `vite preview` and the tests have no `STATIC` binding and keep using static assets unchanged.

One-time setup, done on 2026-10-23 (for a fresh account):

```bash
npx wrangler d1 create uvarena --location weur  # database_id into wrangler.jsonc
npx wrangler r2 bucket create uvarena-avatars
npx wrangler r2 bucket create uvarena-static
npx wrangler d1 migrations apply DB --remote
```

After a deploy, or whenever the bank changes:

```bash
git -C ../university-vault pull
npm run bank -- import --remote --vault ../university-vault   # commit bank/fingerprints.json if it changed
npx wrangler d1 migrations apply DB --remote                   # when migrations/ gained a file, before npm run deploy
```

Checks against production:

```bash
curl -sS https://uvarena.swasilewski.com/api/health           # {"ok":true}
curl -sSI https://uvarena.swasilewski.com/profile              # 200 text/html, no-cache, CSP
npm run smoke -- --url https://uvarena.swasilewski.com --production
```

The production smoke run signs up two `zz_smoke_*` users, plays a ranked Agentic AI match over the queue and match sockets to the end, checks ratings, history, missed questions and the leaderboard, then plays and wins a match against the first ladder bot (about two minutes at real timers). It leaves those users behind: delete them and their rows afterwards (answers, match_rounds, match_finalizations and matches of their matches; question_reports, missed_questions, ratings, player_course, user_prefs, session, account, user), and reset question stats (`rating = start_rating, rating_n = 0, attempts = 0, correct = 0`) only while no real player exists yet.

Google sign-in, once Stas has the client:

```bash
printf %s "$GOOGLE_CLIENT_ID"     | npx wrangler secret put GOOGLE_CLIENT_ID
printf %s "$GOOGLE_CLIENT_SECRET" | npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Gotchas, all from the architecture report or checked today:
- Every wrangler command needs both exported variables above; plain `wrangler whoami` says "not authenticated" through the proxy and that is expected.
- `new_sqlite_classes` must be right on the first deploy; DO migrations are permanent and append-only.
- `BETTER_AUTH_SECRET` must exist before the first request. Without it Better Auth falls back to its public default secret (anyone could forge a session), so `createAuth` and an `/api` middleware refuse to run: every API route, `/api/health` included, answers 503 until the secret is set. Never delete or rotate it away without putting a new one in the same step.
- `compatibility_date` 2026-10-15 with `nodejs_compat` (needed for Better Auth and native scrypt). WebSocket close reasons over 123 bytes throw.
- One alarm per DO: every timer goes through `nextDeadline`. Alarms are at-least-once: `tick` and finalize are idempotent.
- Always pass `--local` or `--remote` to D1 commands.
- Drizzle 0.45 and drizzle-kit 0.31 write flat migration files. Do not mix in the 1.0 rc.
- The Workers test package is `@cloudflare/vitest-plugin` (renamed from `vitest-pool-workers` on 2026-08-19); `defineWorkersConfig` and `SELF` are the old API. Vitest 4.1.x.
- Playwright exactly 1.56.1; `PLAYWRIGHT_BROWSERS_PATH` and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` are already set.
- Better Auth needs `baseURL` set, or Google returns `redirect_uri_mismatch`.
- The custom domain needs no existing record on the hostname (none exists for `uvarena`). Zone SSL mode Flexible does not affect a Worker custom domain.
- Plain `wrangler deploy` after `vite build` picks up the generated config through `.wrangler/deploy/config.json`, but from this container it fails at the asset upload; use `npm run deploy`.
- Email: the `send_email` binding only delivers to arbitrary addresses after the domain is onboarded; before that, `emailEnabled` is false in `/config`.

## Work packages

Rules for every package: work in your own git worktree on a local branch named after the package, touch only the files you own, commit often with plain messages, and run `npm run typecheck` and your tests before handing back. If you need a change in a file you do not own (especially the contracts), stop and ask the orchestrator; do not edit it. No em-dashes, no emoji in code comments, UI copy or commits. UI copy comes from `design.md`.

### Order

1. **Scaffold and contracts** (one agent, alone, first).
2. In parallel: **Game engine**, **Ratings and finalization logic**, **Bank tool**, **Starter questions: Agentic AI**, **Starter questions: Engineering**, **Worker API and auth**, **Client app**, **Match screen**. **Durable Objects** starts in parallel too, on the parts that do not need the engine (matchmaker, finalize writer, match factory, the DO shell against the engine stub), and finishes its duel tests once the engine is merged.
3. **Integration** (orchestrator): merge in the order scaffold, engine, ratings, bank tool, Durable Objects, API, client app, match screen; import the starter bank locally; run every test suite; write and run the end-to-end tests (or merge them from the **End-to-end tests** package, which can start once the API and client routes exist).
4. **Review**: a code review agent on the full diff (correctness, idempotency, rules matching this file); a security pass (answer secrecy, auth on every route, test routes gated, ownership checks on missed questions, Origin checks); a phone pass over the 390 x 844 screenshots against `design.md`; `lint:copy`.
5. **Deploy**, import the starter bank remotely, smoke test production with two accounts.

### Scaffold and contracts

- **Goal:** a repo every other package can build in without touching shared files.
- **Owns:** `package.json`, lockfile, all config files, `index.html`, `.gitignore`, `.dev.vars.example`, `migrations/0000_*.sql`, `src/worker/db/schema.ts`, `src/worker/db/auth-schema.ts`, `src/worker/env.ts`, `src/worker/do/contracts.ts`, `src/shared/protocol.ts`, `src/shared/api-schemas.ts`, `src/shared/question-schema.ts`, `src/shared/game/types.ts`, `src/shared/game/config.ts`, `src/client/styles.css` (theme tokens), `test/fixtures/questions.json`, and stub files (exported signatures that throw "not implemented") for every module listed under other packages, so imports resolve from day one.
- **Depends on:** this file.
- **Done when:** clean install with the pinned versions; `typecheck`, `build`, and all four test commands run (empty suites pass); `npm run dev` serves a page and `/api/health`; migrations apply locally; the orchestrator has read the contracts and frozen them.
- **Tests:** a smoke test per test project that proves the config works (one Node test, one workerd test with D1 migrations applied, one DO test opening a WebSocket to a stub DO).

### Game engine

- **Goal:** every duel rule as a pure reducer.
- **Owns:** `src/shared/game/{engine,scoring,powerups,bot,select,rng,view}.ts`, `test/unit/engine/**`.
- **Depends on:** `types.ts`, `config.ts`, `protocol.ts`.
- **Done when:** the engine section of this file is implemented, and the unit tests and simulation listed under Testing pass.

### Ratings and finalization logic

- **Goal:** rating math and the end-of-match plan, pure.
- **Owns:** `src/shared/game/{glicko2,elo,finalize}.ts`, `test/unit/ratings/**`.
- **Depends on:** `types.ts`, `config.ts`, the D1 schema types.
- **Done when:** Glickman's example matches to 2 decimals; `planFinalization` covers every end reason, the pair cap, item guards, missed upserts and stats.

### Durable Objects

- **Goal:** MatchRoom, Matchmaker, match creation, and the D1 writer.
- **Owns:** `src/worker/do/{match-room,matchmaker,finalize-writer}.ts`, `src/worker/match-factory.ts`, `test/do/**`.
- **Depends on:** contracts, engine and ratings interfaces (stubs until merged), schema.
- **Done when:** the DO tests listed under Testing pass against the real engine.

### Worker API and auth

- **Goal:** every HTTP endpoint, Better Auth, email, avatars, test mode, admin password script.
- **Owns:** `src/worker/index.ts`, `src/worker/{auth,auth.cli,email}.ts`, `src/worker/middleware/**`, `src/worker/routes/**`, `src/worker/db/queries/**`, `scripts/admin-set-password.ts`, `test/worker/**`.
- **Depends on:** `api-schemas.ts`, schema, `createMatch` and DO RPC contracts.
- **Done when:** the API table is implemented, Google sign-in is wired and hidden without secrets, the worker tests listed under Testing pass.

### Client app

- **Goal:** every screen except the duel: landing, sign-up, log-in, onboarding, home, bot ladder, queue, friend create and join, lobby link handling, missed list, missed question and retry run, leaderboard, profiles, history, match detail, settings and avatar crop.
- **Owns:** `src/client/{main,router}.tsx`, `src/client/routes/**`, `src/client/components/**`, `src/client/lib/**`.
- **Depends on:** `api-schemas.ts`, the queue part of `protocol.ts`, `design.md`.
- **Done when:** every screen in `design.md` exists, renders at 390 x 844 with no horizontal scroll, handles loading and error states, and the routes link up; `/match/:id` routes to the match screen component (stub until merged).

### Match screen

- **Goal:** the duel as `design.md` describes it, from lobby to end screen.
- **Owns:** `src/client/match/**` (screen, reducer, reconnecting socket, clock offset, HP bars, question card, answer area per type, power-up bar, banners, reveal, end screen, sounds, animations, local preview at `/dev/match`).
- **Depends on:** `protocol.ts`; the engine for the local preview (use recorded message fixtures until it merges).
- **Done when:** a full match plays in the local preview and against the dev server; every banner and damage animation exists; reduced motion works; wake lock is taken and released; reconnect resumes from a snapshot.

### Bank tool

- **Goal:** `ids`, `check`, `export`, `import` as specified.
- **Owns:** `scripts/quiz-bank.ts`, `scripts/bank/**`, `bank/fingerprints.json`, `test/unit/bank/**`, `npm run bank`.
- **Depends on:** `question-schema.ts`.
- **Done when:** the bank tests pass, `check` runs on the starter files, and an import into the local D1 succeeds and is idempotent (a second run reports everything unchanged).
- **Ship `check` first**, so the question writers can validate while they write.

### Starter questions: Agentic AI, and Starter questions: Engineering

- **Goal:** about 60 reviewed questions per course as described under Starter bank.
- **Owns:** `university-vault/docs/quiz/AGAI/**` and `university-vault/docs/quiz/EPRM/**` respectively. Nothing in the game repo.
- **Depends on:** the YAML format above; `npm run bank -- check` once available.
- **Done when:** `check` passes with no errors, warnings are fixed or justified in a YAML comment, an independent reviewer has answered every item cold and its findings are fixed. Commit and push to the vault's `main`.

### End-to-end tests

- **Goal:** the Playwright suite under Testing.
- **Owns:** `playwright.config.ts` contents beyond the scaffold, `test/e2e/**`.
- **Depends on:** test mode, client routes, match screen.
- **Done when:** the suite passes on both projects against `vite preview`.

## What Stas does by hand

1. **Approve the design and the decisions** in `design.md`, including the name. Everything named `uvarena` here follows his pick.
2. **Google OAuth client** (only he can):
   1. https://console.cloud.google.com, create a project (for example "uvarena").
   2. Google Auth Platform, Branding: app name, support email, developer contact, authorised domain `swasilewski.com`. No logo, so no brand verification.
   3. Audience: External, then **Publish app** (in Testing, only listed test users can sign in and consent expires after 7 days).
   4. Data access: scopes `openid`, `userinfo.email`, `userinfo.profile`.
   5. Clients, Create client, Web application. Origins `https://uvarena.swasilewski.com` and `http://localhost:5173`. Redirect URIs `https://uvarena.swasilewski.com/api/auth/callback/google` and `http://localhost:5173/api/auth/callback/google`.
   6. Copy the client secret on the creation screen (it is shown once), and hand both values over or run the two `wrangler secret put` commands.
3. **Email sending domain**: Cloudflare dashboard, Compute, Email Service, Email Sending, Onboard Domain, `swasilewski.com`, then check status after 5 to 15 minutes. He has given blanket permission for Cloudflare resources on this project, so an agent may try the zone-level API first and only hand this over if it fails.
4. **Confirm** the notes site does not publish the vault's `docs/` folder (or let an agent check `university-vault-site/sync.sh` once that repo is attached).

Works without any of these: email + password sign-up and sign-in, every mode, ratings, missed questions, profiles, leaderboards. Without Google: the Google button is hidden. Without email: no verification banner, and "Forgot password" says reset is not available yet and to message Stas, who can run `scripts/admin-set-password.ts`.
