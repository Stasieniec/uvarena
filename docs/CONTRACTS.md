# Contracts

The files every package builds against. They are frozen once the orchestrator has read them: do not edit them in your worktree. `build-plan.md` is the spec; these files are its precise, typed form. Where they differ from the plan, the reason is under "Decisions made during scaffold" below.

## The contract files

| File | What it fixes | Main users |
|---|---|---|
| `src/shared/game/types.ts` | `MatchState`, `PlayerState`, `RoundRecord`, `MatchInit`, `PlayerInit`, `QuestionFull`, `AnswerKey`, `EngineEvent`, `Effect`, `StepResult`, `Rng`, and the finalization types (`FinalizationContext`, `FinalizationPlan` and its row types). Also the literal lists (`QUESTION_TYPES`, `POWERUP_IDS`, `PHASES`, `END_REASONS`, ...) the zod schemas are built from. | engine, ratings, DOs, match screen |
| `src/shared/game/config.ts` | Every tunable number: HP, timers, countdown, multiplier schedule, caps, power-up parameters, Glicko-2 and Elo parameters, bot ladder and model, matchmaker windows, limits, test mode. Values are tuned by the orchestrator only; nobody hard-codes them elsewhere. | everyone |
| `src/shared/protocol.ts` | zod schemas and types for every WebSocket frame: `ClientMessage`, `ServerMessage` (16 types, each with `serverNow`), the queue messages, `CLOSE_CODES`, `PING`/`PONG`, parse helpers. | engine (`out`), DOs, match screen, client queue |
| `src/shared/api-schemas.ts` | zod schemas for every HTTP body, query and response, `ApiErrorSchema`, and the `endpoints` table (method, path, auth, schemas) the client builds its fetch helpers from. | API, client app |
| `src/shared/question-schema.ts` | The vault YAML file (`QuizFileSchema`), the exported bank JSON (`BankFileSchema`, also the format of `test/fixtures/questions.json`), `bank/fingerprints.json`, and the YAML-to-JSON conversion rules in a comment. | bank tool, question writers, API test seed |
| `src/shared/brand.ts` | `APP_NAME`. See `docs/RENAME.md`. | client |
| `src/worker/db/schema.ts`, `auth-schema.ts`, `migrations/0000_init.sql` | D1 tables (Drizzle). `auth-schema.ts` is the real output of `npx auth@1.7.12 generate`. `plan-compat.ts` fails the typecheck if the finalization row types drift from the schema. | API, DOs, ratings, bank tool |
| `src/worker/env.ts` | `Env` (bindings, vars, secrets), `HonoEnv` and `SessionUser` for Hono, and `Cloudflare.GlobalProps` so `exports.default` is typed in tests. | API, DOs |
| `src/worker/do/contracts.ts` | `MatchRoomRpc`, `MatchmakerRpc`, `JoinResult`, socket attachments, forwarded headers (`HEADERS`), `matchmakerName()`, `CreateMatchSpec`, `CreateMatchResult`, `MatchFactoryError`. | API, DOs |

## Stubs

Every module another package owns exists as a stub with its exported, typed signatures; calling it throws `not implemented: <name>`. Replace the body, keep the signature. You may add exports to your own modules. Signatures other packages import are part of the contract:

- `game/engine.ts`: `initState`, `step`, `nextDeadline`, `sideOf`, plus `view` and `matchEnd` from `game/view.ts` (DOs, match screen preview).
- `game/select.ts`: `selectQuestions`, `selectionTarget`. `game/bot.ts`: `botInit`, `botStrength`. `game/rng.ts`: `createRng` (match factory).
- `game/finalize.ts`: `planFinalization` (DOs).
- `worker/do/finalize-writer.ts`: `loadFinalizationContext`, `writeFinalization`. `worker/match-factory.ts`: `createMatch`, `joinLobby`, `toQuestionFull` (API).
- `worker/auth.ts`: `createAuth`, `googleEnabled`. `worker/email.ts`: `sendEmail`, `emailEnabled`. `worker/middleware/*`. `worker/routes/*`: one empty Hono router each, not mounted yet.
- `client/match/MatchScreen.tsx` (`MatchScreen({ matchId })`) and `DevMatchScreen.tsx` render placeholders (client app routes to them).
- The `MatchRoom` stub already accepts a WebSocket upgrade with `x-user-id`, tags the socket with the user id and auto-answers `ping`, so the DO smoke test runs. Everything else in it throws.

Delete `src/shared/not-implemented.ts` once nothing imports it.

## Rules that span packages

- The engine never reads the clock or `Math.random`; `now` and the seeded `Rng` come in. Side 0 is `matches.player_a`.
- Option ids in match messages are the receiver's opaque ids; `QuestionFull` and `RoundRecord` hold real ids. `missed` endpoints use stable (real) ids.
- No server frame before `reveal` carries the key or correctness. 50:50 hides go only to the player who used 50:50.
- `step()` never emits `match_end`. On the `finalize` effect the MatchRoom runs `loadFinalizationContext`, `planFinalization`, `writeFinalization`, sets `state.finalized` and `state.endSummaries`, then sends `matchEnd(state, side, now)` to each human. On `cancelled` it updates D1 and sends `matchEnd` with null ratings.
- Every server message carries `serverNow`. WebSocket close reasons stay under `NET.closeReasonMaxBytes`.
- Test mode: `MatchInit.timeScale` is `TEST_MODE.timeScale` when the match is created in test mode; durations go through `scaleMs()`.

## Asking for a change

1. Stop. Do not edit a contract file, even a comment.
2. Message the orchestrator with: the file, the exact change (a diff or the new declaration), why, and which packages it touches.
3. The orchestrator applies it on `main` (schema changes come with a new migration from `npm run db:generate`; applied migrations are never edited), tells the affected agents, and you rebase.

Small additions that break nobody (a new optional field, a new error code) are usually approved quickly. Renames and removals are not.

## Commands

| Command | What |
|---|---|
| `npm run dev` | Vite dev server with the Worker in workerd, http://localhost:5173 (uses `.dev.vars`; copy `.dev.vars.example`) |
| `npm run build` / `npm run preview` | Production build to `dist/`, served on :4173 |
| `npm run typecheck` | `tsc -b` over `tsconfig.app.json` (client), `tsconfig.worker.json` (Worker, DOs, workerd tests), `tsconfig.node.json` (configs, scripts, Node tests, Playwright) |
| `npm run test:unit` | Vitest in Node, `test/unit/**/*.test.ts` |
| `npm run test:worker` | Vitest in workerd with per-test storage isolation, `test/worker/**/*.test.ts`; migrations applied by `test/apply-migrations.ts` |
| `npm run test:do` | Vitest in workerd without isolation, one worker, `test/do/**/*.test.ts` (WebSockets to DOs need this); use fresh DO names per test |
| `npm run test:e2e` | Playwright 1.56.1, desktop and Pixel 7, against `npm run e2e:server` (migrate, build, preview on :4173) |
| `npm test` | unit, worker and DO suites |
| `npm run db:generate` | drizzle-kit: next migration from `schema.ts` |
| `npm run db:migrate:local` | `wrangler d1 migrations apply DB --local` |
| `npm run cf-typegen` | Regenerates runtime types into `worker-configuration.d.ts` (Env stays hand-written in `env.ts`) |
| `npm run bank -- <cmd>` | Bank tool (stub) |
| `npm run lint:copy [-- --vault ../university-vault]` | No em-dashes or emoji in `src/`, `scripts/`, `test/`, `index.html`, `public/`, and the vault's `docs/quiz/` |

Wrangler commands need `CLOUDFLARE_API_TOKEN=placeholder` and `CLOUDFLARE_ACCOUNT_ID=2b601c6ade78558b75079f4a71ac23c8` exported. Workers tests use `env` and `exports` from `cloudflare:workers` (`exports.default.fetch`, not `SELF`) and helpers from `cloudflare:test`.

## Installed versions

As pinned in the plan, checked with `npm view` on 2026-10-22: wrangler 4.152.0, @cloudflare/vite-plugin 1.64.0, vite 8.3.5, @vitejs/plugin-react 6.1.2, react and react-dom 19.3.1, react-router 8.5.0, @tanstack/react-query 5.104.5, tailwindcss and @tailwindcss/vite 4.3.3, hono 4.13.13, zod 4.6.7, @hono/zod-validator 0.9.1, better-auth 1.7.12, drizzle-orm 0.45.4, drizzle-kit 0.31.11, typescript 6.0.3, vitest 4.1.12, @cloudflare/vitest-plugin 1.4.7, @playwright/test 1.56.1, yaml 2.9.1, tsx 4.23.15. Added: @types/react 19.3.0, @types/react-dom 19.3.0, @types/node 22.20.5.

## Decisions made during scaffold

Tooling:
1. **`overrides: { vitest: "4.1.12" }`** in `package.json`. better-auth declares an optional peer `vitest ^2 || ... || ^5`; npm 10.9.4 resolved it to vitest 5 and crashed (`Cannot read properties of null (reading 'edgesOut')`). The override keeps one vitest, 4.1.12. `npm ci` works from the lockfile.
2. **@cloudflare/vite-plugin 1.64.0 brings its own wrangler 4.151.0 and workerd 1.20261012.1**, so `npm run dev` and `preview` run on that workerd, while wrangler, the generated types and the Workers tests use workerd 1.20261019.1. No compatibility-date warning appeared with `compatibility_date` 2026-10-15; if one does, it is this.
3. **Env is hand-written** in `env.ts` and merged into `Cloudflare.Env`; `worker-configuration.d.ts` holds runtime types only (`wrangler types --include-env=false`, committed). Generated env types would vary with whatever is in a local `.dev.vars`.
4. **`database_id` placeholder is the zero UUID**, since local D1 state is keyed on it. Replace it at deploy.
5. **Courses are seeded by SQL appended to `migrations/0000_init.sql`** (data only, so drizzle-kit's snapshot is unaffected).
6. Tests set their own `TEST_MODE`, `APP_URL` and `BETTER_AUTH_SECRET` bindings, so they pass without `.dev.vars`.

Engine and protocol:
7. **`initState(init, now)` replaces the `init` engine event.** `step()` always takes an existing state; `EngineEvent` has no `init`. The MatchRoom's `init` RPC calls `initState` (and is a no-op when state exists).
8. **`step()` never emits `match_end`** (ratings are only known after the D1 batch). See "Rules that span packages". `MatchState` gained `endSummaries` and `rematchMatchId` (set by the MatchRoom), `joinCode` and `timeScale`.
9. **`EndReason` gained `cancelled`** for the `cancel` RPC (for example the match factory cancelling a host's open lobby). `CancelReason` is `no_show | expired | cancelled`.
10. `PlayerState` gained `botRatingN`; `RoundRecord` carries per-side `timedOutAfterCountdown` and `helped`, plus the item rating, chance and lecture id, so `planFinalization` needs nothing but the state and its context.
11. The snapshot carries more than the plan lists (your armed choice, banner items, Oracle hides, quick power-up used, `yourDeadline`, rematch state, `opponentForfeitAt`, `suddenDeath`) so any screen can be rebuilt after a reconnect. `PlayerView` has `ready`, `botLevel` and the shown rating.
12. Test mode: `scaleMs()` applies the time scale with a 1,000 ms floor to phase durations and question timers; `graceMs` and the test bots' 2 s answer times are not scaled.

Data:
13. **`questions.targets_json`** (new column) holds match targets as `[{id: "t1", text}, ...]`; `options_json` stays an array of `{id, text}` for every type (`[]` for truefalse).
14. Finalization rows are typed in `types.ts` with the schema's camelCase keys. `ratings` rows are upserted as absolute values (one active match per user); question and `player_course` updates are relative deltas. Answer row ids are `${matchId}:${roundNo}:${side}`, so a retried batch cannot duplicate them.
15. Per-user tables (`ratings`, `player_course`, `missed_questions`, `question_reports`, `user_prefs`) reference `user` with `ON DELETE CASCADE`; match history tables (`matches`, `match_rounds`, `answers`) keep no user foreign keys.
16. Better Auth's generated columns are snake_case (`email_verified`, `display_username`, `first_name`, ...); `role` is nullable with default `user`, as the generator wrote it.

API and contracts:
17. **`CreateMatchSpec` has no `joinCode`**: the factory generates one for every private match with one human. It gained `rematchOf` and `testMode`. The factory also owns **`joinLobby(env, code, userId)`**, since it selects the questions at join time. Errors are `MatchFactoryError` with a code the routes map to `ApiError`.
18. The Worker forwards **`x-last-opponent`** to the Matchmaker alongside `x-user-id`, `x-rating`, `x-rd`, so the queue can avoid an immediate repeat pairing.
19. API additions beyond the plan's table: `POST /lobbies` returns the effective `rated`; list endpoints page with a `before` cursor and return `nextBefore`; `GET /missed` items include `type`; `bot` in `POST /bot-matches` also accepts 0 and 9, which the route must refuse outside test mode; `GET /users/:username` includes the casual counters and `isSelf`.
20. Cloze prompts must contain a `___` blank (schema rule).
21. The fixture bank has 42 questions, not 30: AGAI needs at least 25 playable (single, multi, truefalse, cloze) questions for a full test match. Fixture fingerprints use the plan's definition but are not guaranteed to match the bank tool's exact serialisation.

Open point for the API and E2E packages: `.dev.vars` sets `APP_URL=http://localhost:5173` (dev), but the E2E server runs `vite preview` on :4173, so Origin checks and Better Auth's `baseURL` will not match under Playwright unless test mode accepts localhost origins or E2E gets its own `APP_URL`. Decide this in the API package and tell the E2E package.

Integration (2026-10-22):
22. **`RevealPayloadSchema` gained `questionId`** (the stable bank id), filled by the engine's `revealPayload`, so the reveal's report flag can post to `/questions/:id/report`.
23. **On connect the MatchRoom sends the snapshot first**, then whatever the connect caused (intro, or a due arming). The engine still appends its snapshot last; the room reorders.
24. **`isTestEnv(env)`** (`TEST_MODE=1` and a localhost `APP_URL`) gates everything that has no request at hand: the Matchmaker's ranked time scale, the MatchRoom's engine seam and the factory's dependency seam.
25. **`/dev/match` exists in dev builds only** (`import.meta.env.DEV`), independent of test mode; production bundles do not contain the preview. The match screen is lazy-loaded.

Server fixes after the security and correctness reviews (2026-10-22):
26. **Auth secret fails closed.** Outside a local APP_URL, `createAuth` throws and every `/api` route (health included) answers 503 unless `BETTER_AUTH_SECRET` is at least `LIMITS.authSecretMin` (32) characters and not a published value. Deploy ships it with `wrangler deploy --secrets-file` (build-plan.md). Verification links sign in only when email is on.
27. **Better Auth `/update-user` is refused (403)**; sign-up refuses `image`, a `displayUsername` different from `username`, and a non-string `username`. Profile changes go through `PATCH /me` and `PUT /me/avatar` only. Avatar deletes only touch the caller's own R2 prefix.
28. **`MatchDetailResponse.roundsHidden?: boolean`.** `GET /matches/:id` returns `rounds: []` and `roundsHidden: true` to a viewer who did not play in the match (round detail carries the keys). The client still shows "No rounds played" in that case; it should say the rounds are visible to the players only.
29. **Config:** `MATCH.lobbyReadyMs` (a join extends the lobby to at least now + 5 min), `MATCH.roomInitGraceMs`, `LIMITS.authSecretMin`, `NET.maxClientFrameBytes`, `NET.clientFrameBurst`, `NET.clientFrameWindowMs`. Engine: surrender is refused during a reveal in which a player is at 0 HP.
30. **Finalization:** a question repeated within a match moves no bot or item rating after its first appearance. A finalize retry re-plans from current rows unless the batch already landed (the stored plan only supplies summaries then). The missed upsert keeps `last_missed_at` at its maximum.
31. **`MatchRoomRpc.cancel` returns `Promise<Phase | null>`** (the phase afterwards; null when the room has no state). **`MatchRoomSummary` gained `exists`, `finalized`, `effectsPending`.** A room that gives up on its finalize or cancel write closes the matches row (`void` or `cancelled`).
32. **Busy checks ask the room** (`src/worker/match-liveness.ts`, `liveMatchId`, `roomVerdict`): `/me` activeMatchId, the queue route and the factory treat a row as running only if its room is in its lobby or in play, or ended with an effect still pending. A row whose room is gone (after `roomInitGraceMs`) or over is closed with no rating change: `void` if it had started, `cancelled` otherwise. The match insert and the lobby seat claim are single conditional statements, so one user is never in two running matches (active, or a full lobby). Rematches skip their own match (`rematchOf`).
33. **Rate limits:** `AUTH_LIMITER` is 100 per minute per IP. New binding **`API_LIMITER`** (30 per minute, key `<action>:<userId>`) on `POST /lobbies`, `POST /lobbies/join`, `POST /bot-matches`, `POST /questions/:id/report` (429 rate_limited), the queue socket (queue error `rate_limited`, new in `QUEUE_ERROR_CODES`) and match socket connects (close 1013). Skipped in test mode.
34. **Socket frame bounds:** both DOs close a socket that sends a frame over `NET.maxClientFrameBytes` (`CLOSE_CODES.tooBig`, 1009) or more than `NET.clientFrameBurst` frames per `NET.clientFrameWindowMs` (`CLOSE_CODES.tooMany`, 1008). `CLOSE_CODES.tryLater` (1013) is new too. None of the three is final.
35. **Security headers:** `public/_headers` sets the CSP (self, Google Fonts, `*.googleusercontent.com` images, `wss://<APP_URL host>` sockets, `frame-ancestors 'none'`), nosniff, Referrer-Policy, X-Frame-Options and Permissions-Policy on the app's pages; the Worker adds nosniff, a `default-src 'none'` CSP and the referrer policy to `/api` responses.
36. **Matchmaker:** sockets that stopped pinging are dropped before pairing; if `matched` cannot be delivered to a player, the match is cancelled at once and a player not yet told stays queued with their join time. A queue socket that arrives while the user's ranked match is still waiting for them (not started, within `MATCH.noShowMs`) gets `matched` with that id instead of `already_in_match`, from the route and from the Matchmaker.

UX fixes (2026-10-22):
37. **`SnapshotMessage.noShowAt?: number | null`** (optional, additive). In the lobby phase it carries the engine's `noShowAt` (when a match nobody fully joined is cancelled), filled by `view()`; null otherwise. The ranked "Opponent found" screen counts down to it while the opponent has not connected. Older servers without the field parse unchanged.

Power-up and course rework (2026-10-28):
38. **Four power-ups.** `POWERUP_IDS` is `bibi`, `shield`, `fifty`, `fast` (Bibi, Shield, 50:50, Gotta Go Fast; formerly Zeus, Aegis, Oracle, Hermes). Nemesis and Phoenix are gone from every contract. `BlindPowerupId` is `bibi | shield`; `QuickPowerupId` is `fifty | fast`. `BANNER_OUTCOMES`, `BannerOutcomeSchema` and `BannerItem.outcome` are removed: a banner item is `{ who, powerup }` with a blind power-up. `PlayerState.phoenixUsed`, `PlayerView.phoenixUsed`, `PlayerRoundState.effective` and `.nemesisAgainst`, `RoundSideRecord.effective`, `.nemesisAgainst` and `.phoenix`, `RevealPayload.phoenix` and `BotPlan.nemesisRound` are removed; the armed power-up is always the active one. `RoundPowerups` (match_rounds.powerups_json) is `{ armed, quick }`; `GET /matches/:id` round sides carry `armed` and `quick` only, and a stored id the game no longer has reads as null.
39. **Config.** `TIMING.countdownMs` 10,000 and `TIMING.fastCountdownMs` 5,000 (was `hermesCountdownMs` 2,000). `SCORING.bibiRoundCap`, `bibiFactor`, `shieldFactor`; `phoenixHp` removed. `POWERUPS.passive` removed, `POWERUPS.oracle` is `POWERUPS.fifty`. `BOT_POLICY.nemesisRounds` removed, `priority` is `bibi, shield`, the rest renamed. `BOT_LADDER` names and lines are the student archetypes; ratings unchanged. Test bot 9 is `TEST_BOTS.perfect` ("Perfect Bot", was Oracle Bot).
40. **Shared helper `isValidLoadout`** (`game/powerups.ts`): prefs and the match factory treat a stored loadout with an unknown id as missing (the default loadout), so a loadout saved before the rework never reaches a match.
41. **Migration 0001** (`four_powerups_one_course`): rebuilds `user_prefs` for the new default loadout `["bibi","shield","fifty"]`, maps saved loadouts to the new ids (one holding Nemesis or Phoenix goes back to the default), and removes Engineering: `courses.active = 0`, its questions retired, then its course row, lectures, questions and per-course rows deleted when no match was ever played in it, and `user_prefs.course_id = 'eprm'` cleared.
42. **Bank import imports active courses only** (`onlyActiveCourses` in `scripts/bank/sql.ts`, `SELECT_ACTIVE_COURSES`): other courses' quiz files are still checked and exported, then skipped with a one-line note. The test seed (`POST /test/seed`) seeds only Agentic AI and leaves the fixture's Engineering questions out. A course comes back by a migration that inserts its row, then an import.
43. **Client:** `/credits` (public) lists the banner pictures' authors, licences and sources (`docs/CREDITS.md`); the pictures live in `public/powerups/` and ship with the client build. The course switch, the first-visit course sheet and the onboarding course step only appear with more than one active course.
