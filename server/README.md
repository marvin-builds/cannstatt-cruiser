# Cannstatt Cruiser highscores

Online highscore list for the game: a Cloudflare Worker with a D1 database
(free plan). Self-contained: its own `package.json`, `tsconfig.json` and tests;
the game's root build and tests ignore this folder.

URL after deploy: **https://cannstatt-cruiser-scores.marvinmai.workers.dev**

## Layout

| File | Purpose |
| --- | --- |
| `wrangler.toml` | Worker name, D1 binding `DB` (database `cannstatt-cruiser-scores`) |
| `schema.sql` | Tables `scores` (the list, one row per device) and `submissions` (rate-limit log) |
| `migrations/` | One-off changes to an existing database (see "Migrations") |
| `src/index.ts` | Worker entry |
| `src/handler.ts` | Routing, CORS, status codes |
| `src/submission.ts` | Body parsing: shape, then name, then plausibility |
| `src/name.ts`, `src/word-filter.ts` | Name rules and word filter |
| `src/plausibility.ts` | Score / distance / time bounds from the game's tuning |
| `src/rate-limit.ts` | 1 per 20 s and 50 per day per device |
| `src/ranking.ts`, `src/store.ts` | Top-20 order, pruning to 500 rows, D1 queries (best run per device) |
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

## Migrations

A database created before a change to `schema.sql` may need a migration from
`migrations/` first. Each is applied once, in number order, always after a backup.

`0002_one_row_per_device.sql` (one entry per player): deletes all but each
device's best row (highest score, then earliest date, then lowest id, the
list order) and adds the unique index `scores_device`. The new worker code
relies on that index, so the order is:

```sh
cd server
npx wrangler d1 export cannstatt-cruiser-scores --remote --output=backup-before-0002.sql   # 1. backup
npx wrangler d1 execute cannstatt-cruiser-scores --remote --file=migrations/0002_one_row_per_device.sql   # 2. migrate
npx wrangler d1 execute cannstatt-cruiser-scores --remote --file=schema.sql   # 3. schema (no-op now)
npx wrangler deploy   # 4. new worker
```

Applying `schema.sql` to the old database before the migration fails on the
unique index while duplicate devices exist. A fresh database needs no
migration: `schema.sql` already has the index.

## API

All responses are JSON. CORS allows `https://marvinmai.github.io` and
`http://localhost:*` / `http://127.0.0.1:*`; `OPTIONS` answers the preflight with 204.

### `GET /top`

`200 {"entries": [{"rank", "name", "score", "distance", "date"}]}`: the top 20
by score (on a tie the earlier entry first). Each device has at most one entry,
its best run. `distance` is in metres, `date` an ISO timestamp (UTC) of when
that best run was sent. Cached for 30 s (`Cache-Control: public, max-age=30`).

### `GET /top?device=<id>`

The raw device id as in the `POST /score` body (same rule; an invalid one
answers `400 {"ok": false, "error": "bad-request"}`). Adds the device's own
entry: `200 {"entries": [...], "own": {"rank": 7, "score": 28507}}`. `rank` is
its 1-based place in `entries`, or `null` when its row is outside the top 20;
`own` is `null` when the device has no row. Cached privately
(`Cache-Control: private, max-age=30`).

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

- `200 {"ok": true, "stored": true, "rank": 3, "best": 28507, "entries": [...]}`:
  each device keeps one row, its best run. A run with a higher score than that
  row replaces it in place (name, score, distance, duration, version and date
  are updated) or creates it; an equal or lower run is not stored.
  `stored` says whether this run was stored. `best` is the device's stored
  score after the request (if a new run was pruned at once because it is
  outside the kept 500, `stored` is `false` and `best` is that run's score).
  `rank` is the 1-based place of the device's row in the top 20, or `null`
  when it is outside; `entries` as in `GET /top`.
- `400 {"ok": false, "error": "bad-request"}`: not JSON, too large, wrong types
  (numbers must be integers), bad `version` or `device`.
- `422 {"ok": false, "error": "name"}`: the name breaks the rules or the filter.
- `422 {"ok": false, "error": "implausible"}`: the run cannot come from the game
  (faster than 19 m/s plus 10 %, more points than the game can give for the
  distance or time, zero duration, absurd values).
- `429 {"ok": false, "error": "rate"}`: this device already sent a run in the
  last 20 s, or 50 in the last 24 h. Every accepted run counts, stored or not.

Anything else answers `404 {"ok": false, "error": "not-found"}`.

## Privacy

Stored per device (its best run only): name, score, distance, duration, game
version, date and the SHA-256 hash of the device id. `GET /top?device=` hashes
the id the same way and stores nothing. No IP address and no request headers are read
or stored. The table keeps only the best 500 runs; the rate-limit log keeps a
day.

## Keeping it in sync with the game

`src/plausibility.ts` derives its bounds from the game's top speed
(`TOP_SPEED` in `src/gameplay/difficulty.ts`, `PX_PER_METRE` in
`src/ui/layout.ts`) and point values. Raise the bounds there when the game gets
faster or more generous with points.
