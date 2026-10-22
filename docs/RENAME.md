# Renaming the app

The working name is **Ragequiz** (`ragequiz`). Stas has not picked the final name. Every place the name lives is listed below, so a rename is a search and replace over these lines and nothing else. Durable Object class names (`MatchRoom`, `Matchmaker`) and binding names do not contain the name, so nothing permanent depends on it.

Do the rename **before the first deploy**. After it, the D1 database, R2 bucket and Worker exist on Cloudflare under the old name, and renaming them means creating new ones and moving data.

| File | What | Current value |
|---|---|---|
| `src/shared/brand.ts` | `APP_NAME`, the display name used by the UI | `Ragequiz` |
| `src/shared/brand.ts` | `APP_SLUG`, for storage keys and the like | `ragequiz` |
| `wrangler.jsonc` | Worker `name` | `ragequiz` |
| `wrangler.jsonc` | custom domain route `pattern` | `ragequiz.swasilewski.com` |
| `wrangler.jsonc` | D1 `database_name` | `ragequiz` |
| `wrangler.jsonc` | R2 `bucket_name` | `ragequiz-avatars` |
| `wrangler.jsonc` | `vars.APP_URL` | `https://ragequiz.swasilewski.com` |
| `wrangler.jsonc` | the comment on line 1 that names it | |
| `index.html` | `<title>` (the app also sets `document.title` from `APP_NAME`) | `Ragequiz` |
| `package.json` | `name` | `ragequiz` |
| `package-lock.json` | `name`, twice at the top; regenerate with `npm install` after editing `package.json` | `ragequiz` |

Derived, nothing to edit:
- `npm run build` writes the Worker to `dist/<worker name>/`, so the folder follows `wrangler.jsonc`.
- The local D1 and R2 state under `.wrangler/` is keyed by binding and id, not by name.

Outside this repo, by hand:
- The Google OAuth client's origins and redirect URIs (build-plan.md, "What Stas does by hand").
- The deploy commands in build-plan.md (`wrangler d1 create`, `wrangler r2 bucket create`, the health check URL).
- The repo name itself, if it is renamed.

Check after a rename: `grep -rni ragequiz --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs .` should print nothing, then run `npm run typecheck`, `npm run build` and the tests.
