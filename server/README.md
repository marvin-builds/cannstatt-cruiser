# Cannstatt Cruiser highscores

Online highscore list and anonymous play statistics for the game: a
Cloudflare Worker with a D1 database (free plan). Self-contained: its own `package.json`, `tsconfig.json` and tests;
the game's root build and tests ignore this folder.

URL after deploy: **https://cannstatt-cruiser-scores.marvinmai.workers.dev**

## Layout

| File | Purpose |
| --- | --- |
| `wrangler.toml` | Worker name, D1 binding `DB` (database `cannstatt-cruiser-scores`) |
| `schema.sql` | Tables `scores` (the list, one row per device), `submissions` (rate-limit log), `events`, `event_days`, `event_meta` (play statistics) |
| `migrations/` | One-off changes to an existing database (see "Migrations") |
| `src/index.ts` | Worker entry |
| `src/handler.ts` | Routing, CORS, status codes |
| `src/submission.ts` | Body parsing: shape, then name, then plausibility |
| `src/name.ts`, `src/word-filter.ts` | Name rules and word filter |
| `src/plausibility.ts` | Score / distance / time bounds from the game's tuning |
| `src/rate-limit.ts` | 1 per 20 s and 50 per day per device |
| `src/ranking.ts`, `src/store.ts` | Top-20 order, pruning to 500 rows, D1 queries (best run per device) |
| `src/events.ts`, `src/insights-types.ts` | Statistics contract: allowed values and shapes (mirror of the game's `src/net/telemetry-types.ts`) |
| `src/event-parse.ts` | Strict `POST /event` body check |
| `src/event-store.ts`, `src/location.ts` | Daily cap, 90-day prune, storing events; coarse location from `request.cf` |
| `src/auth.ts` | Bearer token check for `GET /stats` (SHA-256 + constant-time compare) |
| `src/stats.ts`, `src/aggregate.ts` | The `GET /stats` aggregates |
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
`CREATE ... IF NOT EXISTS`, so applying it again is harmless.

### Stats token (secret)

`GET /stats` needs the Wrangler secret `STATS_TOKEN`; without it the route
always answers 401. Create and set it once (rotation is the same two commands;
the old token stops working at once):

```sh
cd server
openssl rand -base64 32          # copy the printed token into your password manager
npx wrangler secret put STATS_TOKEN   # paste it when asked
```

Never put the token in `wrangler.toml` (`[vars]`), in any `VITE_` variable, in
the game's code or in git: the insights page asks for it at runtime.

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

`0003_play_statistics.sql` (play statistics): only adds the tables `events`,
`event_days`, `event_meta` and their indexes (`IF NOT EXISTS`, safe to apply
twice). The worker code for `POST /event` and `GET /stats` needs them, so the
order is:

```sh
cd server
npx wrangler d1 export cannstatt-cruiser-scores --remote --output=backup-before-0003.sql   # 1. backup
npx wrangler d1 execute cannstatt-cruiser-scores --remote --file=migrations/0003_play_statistics.sql   # 2. migrate
npx wrangler d1 execute cannstatt-cruiser-scores --remote --file=schema.sql   # 3. schema (no-op now)
npx wrangler secret put STATS_TOKEN   # 4. token (see "Stats token"), once
npx wrangler deploy   # 5. new worker
```

## API

All responses are JSON (except the empty 204 answers). CORS allows
`https://marvinmai.github.io` and `http://localhost:*` / `http://127.0.0.1:*`
with the methods `GET, POST, OPTIONS` and the headers `Content-Type,
Authorization` (no credentials); `OPTIONS` answers the preflight with 204.

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

### `POST /event`

Anonymous play statistics from the game (one JSON object per request, usually
by `navigator.sendBeacon`). `Content-Type` `text/plain` or `application/json`,
at most 1024 bytes (`MAX_EVENT_BYTES`). The body must have exactly the fields
of its kind (see `src/events.ts` and the game's `src/net/telemetry-types.ts`):

| `kind` | Fields | Rules |
| --- | --- | --- |
| `session` | `session`, `version`, `input`, `orientation`, `platform`, `kid` | once per page load; `session` 32 lowercase hex chars, `version` `YYYY-MM-DD.n`, `input` `touch`/`keys`, `orientation` `landscape`/`portrait`, `platform` `android`/`ios`/`other`, `kid` boolean |
| `run` | `session`, `seconds`, `score`, `distance`, `kid` | per game over; `seconds` a multiple of 10 in 0..3600, `score` one of 0/100/500/2000/5000, `distance` a multiple of 100 in 0..5000 |
| `end` | `session`, `seconds` | when the page is hidden; whole seconds of play, 0..14400 |

Responses:

- `204` (empty, with CORS headers): accepted. A repeated `session` is ignored,
  `end` keeps the largest `seconds` per session, a session stores at most 200
  runs. At most 15000 valid events per UTC day are accepted across all
  sessions (repeats count too); past that the worker still answers 204 but
  writes nothing.
- `400 {"ok": false, "error": "bad-request"}`: other content type, too large,
  not JSON, unknown or missing fields, values outside the lists or buckets.
- `403 {"ok": false, "error": "forbidden"}`: the `Origin` header is missing or
  not one of the game origins above.

### `GET /stats?days=7|30|90`

The insights board's data. Needs `Authorization: Bearer <STATS_TOKEN>`;
without the secret, without the header or with a wrong token it answers
`401 {"ok": false, "error": "unauthorized"}` before any database access.
`days` other than exactly `7`, `30` or `90` answers 400. Not cached
(`Cache-Control: no-store`).

`200` with the `InsightsStats` shape (`src/insights-types.ts`), aggregates only:

- `perDay`: every UTC day of the range (today included), oldest first,
  zero-filled: `sessions`, `runs`, and `entries` = rows of the highscore list
  whose `date` falls on that day (one row per device, so a device that beats
  its best moves to the new day).
- `sessions`: `total`, `medianSeconds` and `avgSeconds` over the `end` rows of
  the range (whole seconds, 0 without any).
- `runs`: `total`, `perSession` (runs / sessions, 2 decimals) and histograms,
  zero-filled, keys as strings ascending: `seconds` by lower bounds
  0/30/60/180/600, `distance` per 100 m (0..5000), `score` per score bucket.
- `split`: sessions by `input`, `orientation`, `platform`, `kid`
  (`true`/`false`), `version`, `country`, `region`, `city`, largest first.
  Every country, region and city is listed from its first session on
  (`MIN_GROUP_SESSIONS` = 1); only unknown places are merged into `other`.
- `topScores`: the current top 20 (`name`, `score`, `date`), as `GET /top`.

Anything else answers `404 {"ok": false, "error": "not-found"}`.

## Privacy

### Highscores

Stored per device (its best run only): name, score, distance, duration, game
version, date and the SHA-256 hash of the device id. `GET /top?device=` hashes
the id the same way and stores nothing. No IP address and no request headers are read
or stored. The table keeps only the best 500 runs; the rate-limit log keeps a
day.

### Play statistics

Purpose: see how the game is played (how long, on which devices, where it is
popular) to improve it. Legal basis: legitimate interest, Art. 6(1)(f) DSGVO;
the data is anonymous and coarse, so a person cannot be identified from it.

- Stored per event (table `events`): a random session id that the game makes
  per page load and keeps in memory only (not linked to the device id or the
  highscore list), the kind, the UTC **day** and **hour** (no exact time), and
  the coarse values listed under `POST /event` (buckets, not exact scores).
  No name, no device id, no IP address.
- Location: on `session` rows only, `country`, `region` and `city` as
  Cloudflare derives them from the IP (`request.cf`, coarse IP geolocation,
  often only the nearest larger town). The worker never reads or stores the IP
  itself, and `run`/`end` rows carry no location.
- `GET /stats` returns aggregates only (session counts per place, no rows);
  places without a location are shown as `other`.
- Retention: events older than 90 days are deleted (checked on the first
  event of each UTC day); `event_days` keeps only today's counter and
  `event_meta` only the day of the last deletion.
- Access: only with the `STATS_TOKEN` secret.

## Keeping it in sync with the game

`src/plausibility.ts` derives its bounds from the game's top speed
(`TOP_SPEED` in `src/gameplay/difficulty.ts`, `PX_PER_METRE` in
`src/ui/layout.ts`) and point values. Raise the bounds there when the game gets
faster or more generous with points.
