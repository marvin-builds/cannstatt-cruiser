# Cannstatt Cruiser highscores

Online highscore list for the game: a Cloudflare Worker with a D1 database
(free plan). Self-contained: its own `package.json`, `tsconfig.json` and tests;
the game's root build and tests ignore this folder.

URL after deploy: **https://cannstatt-cruiser-scores.marvinmai.workers.dev**

## Layout

| File | Purpose |
| --- | --- |
| `wrangler.toml` | Worker name, D1 binding `DB` (database `cannstatt-cruiser-scores`) |
| `schema.sql` | Tables `scores` (the list) and `submissions` (rate-limit log) |
| `src/index.ts` | Worker entry |
| `src/handler.ts` | Routing, CORS, status codes |
| `src/submission.ts` | Body parsing: shape, then name, then plausibility |
| `src/name.ts`, `src/word-filter.ts` | Name rules and word filter |
| `src/plausibility.ts` | Score / distance / time bounds from the game's tuning |
| `src/rate-limit.ts` | 1 per 20 s and 50 per day per device |
| `src/ranking.ts`, `src/store.ts` | Top-20 order, pruning to 500 rows, D1 queries |
| `test/` | Vitest tests; `d1-fake.ts` runs the real schema on Node's in-memory SQLite |

## Develop and test

```sh
cd server
npm install
npx vitest run          # unit + handler tests, no network
npm run typecheck
npm run db:init:local   # schema into the local D1 (once)
npm run dev             # wrangler dev --local on http://localhost:8787
```

## Deploy (orchestrator, once logged in with `npx wrangler login`)

```sh
cd server
npm install
npx wrangler d1 create cannstatt-cruiser-scores
# copy the printed database_id into wrangler.toml (replace REPLACE_WITH_D1_DATABASE_ID)
npx wrangler d1 execute cannstatt-cruiser-scores --remote --file=schema.sql
npx wrangler deploy
curl https://cannstatt-cruiser-scores.marvinmai.workers.dev/top   # -> {"entries":[]}
```

Later deploys need only `npx wrangler deploy`. `schema.sql` uses
`CREATE ... IF NOT EXISTS`, so applying it again is harmless. No secrets are needed.

## API

All responses are JSON. CORS allows `https://marvinmai.github.io` and
`http://localhost:*` / `http://127.0.0.1:*`; `OPTIONS` answers the preflight with 204.

### `GET /top`

`200 {"entries": [{"rank", "name", "score", "distance", "date"}]}`: the top 20
by score (on a tie the earlier entry first). `distance` is in metres, `date` an
ISO timestamp (UTC). Cached for 30 s (`Cache-Control: public, max-age=30`).

### `POST /score`

Body (`Content-Type: application/json`, at most 2 KB):

| Field | Type | Rule |
| --- | --- | --- |
| `name` | string | 2-16 chars after trimming and collapsing spaces; letters incl. äöüßÄÖÜ, digits, space, `-` `_` `.`; word filter |
| `score` | integer | points, >= 0 |
| `distance` | integer | metres (game pixels / 10), >= 0 |
| `duration` | integer | seconds of play, > 0 |
| `version` | string | build string, 1-32 of `A-Z a-z 0-9 . _ + -` |
| `device` | string | random client id, 8-64 of `A-Z a-z 0-9 -`, kept per install |

Responses:

- `200 {"ok": true, "rank": 3, "entries": [...]}`: `rank` is 1-based, or `null`
  when the run is stored but outside the top 20; `entries` as in `GET /top`.
- `400 {"ok": false, "error": "bad-request"}`: not JSON, too large, wrong types
  (numbers must be integers), bad `version` or `device`.
- `422 {"ok": false, "error": "name"}`: the name breaks the rules or the filter.
- `422 {"ok": false, "error": "implausible"}`: the run cannot come from the game
  (faster than 19 m/s plus 10 %, more points than the game can give for the
  distance or time, zero duration, absurd values).
- `429 {"ok": false, "error": "rate"}`: this device already sent a run in the
  last 20 s, or 50 in the last 24 h. Only accepted runs count.

Anything else answers `404 {"ok": false, "error": "not-found"}`.

## Privacy

Stored per run: name, score, distance, duration, game version, date and the
SHA-256 hash of the device id. No IP address and no request headers are read
or stored. The table keeps only the best 500 runs; the rate-limit log keeps a
day.

## Keeping it in sync with the game

`src/plausibility.ts` derives its bounds from the game's top speed
(`TOP_SPEED` in `src/gameplay/difficulty.ts`, `PX_PER_METRE` in
`src/ui/layout.ts`) and point values. Raise the bounds there when the game gets
faster or more generous with points.
