# Cannstatt Cruiser highscores

Online highscore list, anonymous play statistics and player feedback for the game: a
Cloudflare Worker with a D1 database (free plan). Self-contained: its own `package.json`, `tsconfig.json` and tests;
the game's root build and tests ignore this folder.

URL after deploy: **https://cannstatt-cruiser-scores.marvinmai.workers.dev**

## Layout

| File | Purpose |
| --- | --- |
| `wrangler.toml` | Worker name, D1 binding `DB` (database `cannstatt-cruiser-scores`) |
| `schema.sql` | Tables `scores` (the list, one row per device), `submissions` (rate-limit log), `events`, `event_days`, `event_meta`, `day_summaries` (play statistics), `feedback`, `feedback_counts` (player feedback) |
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
| `src/event-store.ts`, `src/location.ts` | Daily cap, once-a-day condense + 90-day prune, storing events; coarse location from `request.cf` |
| `src/day-summary.ts` | Condensing finished days into `day_summaries` (kept for good) |
| `src/auth.ts` | Bearer token check for `GET /stats` and `GET /feedback` (SHA-256 + constant-time compare) |
| `src/stats.ts`, `src/summary-stats.ts`, `src/tallies.ts`, `src/aggregate.ts` | The `GET /stats` aggregates (raw events up to 90 days, day summaries beyond) |
| `src/feedback-rules.ts`, `src/feedback-types.ts` | Feedback contract: limits and shapes (mirror of the game's `src/net/feedback-types.ts`) |
| `src/feedback-parse.ts` | Strict `POST /feedback` body check and text normalisation |
| `src/feedback-store.ts` | Per-session and daily feedback limits, storing, once-a-day 365-day prune, the `GET /feedback` list |
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

`0004_day_summaries.sql` (long-term statistics): only adds the table
`day_summaries` (`IF NOT EXISTS`, safe to apply twice, keeps all data). The
new worker writes into it before every prune, so the table must exist first:

```sh
cd server
npx wrangler d1 export cannstatt-cruiser-scores --remote --output=backup-before-0004.sql   # 1. backup
npx wrangler d1 execute cannstatt-cruiser-scores --remote --file=migrations/0004_day_summaries.sql   # 2. migrate
npx wrangler d1 execute cannstatt-cruiser-scores --remote --file=schema.sql   # 3. schema (no-op now)
npx wrangler deploy   # 4. new worker
```

`0005_feedback.sql` (player feedback): only adds the tables `feedback` and
`feedback_counts` and the index `feedback_day` (`IF NOT EXISTS`, safe to apply
twice, keeps all data). `POST /feedback` and `GET /feedback` need them, so the
order is:

```sh
cd server
npx wrangler d1 export cannstatt-cruiser-scores --remote --output=backup-before-0005.sql   # 1. backup
npx wrangler d1 execute cannstatt-cruiser-scores --remote --file=migrations/0005_feedback.sql   # 2. migrate
npx wrangler d1 execute cannstatt-cruiser-scores --remote --file=schema.sql   # 3. schema (no-op now)
npx wrangler deploy   # 4. new worker
```

`GET /feedback` uses the existing `STATS_TOKEN` secret; nothing new to set.

On the first event of the next UTC day the worker summarises every finished
day that still has raw events (at most 100 days per run, oldest first), so the
statistics already collected are kept before the 90-day prune deletes them.

`0006_test_devices_and_returning.sql` (test devices and new vs. returning
players, ROADMAP 55): adds the nullable columns `events.tester`,
`events.is_returning` and `day_summaries.player_value`; old rows stay `NULL`
(a player, flag unknown, day counted wholly as players). Unlike the earlier
migrations it is **not** safe to apply twice: SQLite cannot add a column twice,
so a second run fails at its first statement and changes nothing. The new
worker writes these columns, so the order is:

```sh
cd server
npx wrangler d1 export cannstatt-cruiser-scores --remote --output=backup-before-0006.sql   # 1. backup
npx wrangler d1 execute cannstatt-cruiser-scores --remote --file=migrations/0006_test_devices_and_returning.sql   # 2. migrate, once
npx wrangler d1 execute cannstatt-cruiser-scores --remote --file=schema.sql   # 3. schema (no-op now)
npx wrangler deploy   # 4. new worker (accepts events with and without the new fields)
```

Deploy the worker before the game release that sends `tester` and
`returning`: the old worker rejects session events with unknown fields.

## Daily summaries

Raw events live for 90 days; the daily counts are kept for good in
`day_summaries`, one row per finished UTC day, `metric` and `key` with an
integer `value` and `player_value`, the same count without test devices (no
session id, no hour, no device id, no IP). `player_value` is `NULL` on days
summarised before migration 0006; those days count wholly as players:

| `metric` | `key` | `value` |
| --- | --- | --- |
| `total` | `sessions`, `runs`, `ends` | counts of that day |
| `total` | `new_players`, `returning_visits` | sessions with `is_returning` 0 / 1 (0 on days before 0006) |
| `total` | `end_seconds` | sum of the `end` seconds |
| `total` | `end_median` | that day's median `end` seconds (only on days with an `end`; `player_value` 0 when all ends are from test devices) |
| `input`, `orientation`, `platform`, `kid`, `version`, `country`, `region`, `city` | the value (`kid` as `true`/`false`, `''` = unknown) | sessions |
| `run_seconds`, `run_distance`, `run_score` | the reported bucket value | runs |

Condensing runs on the same trigger as the prune (the first accepted event of
a UTC day, after that event is stored), in one transaction and before it: it summarises the oldest days
before today that have raw rows and are newer than the last summarised day
(at most 100 per run; the rest follow on the next days). A day is summarised
exactly once (`INSERT OR IGNORE` on the primary key), and the prune only
deletes raw rows of days that are already summarised, so no day is lost. A day
without events gets no rows. A session that runs across midnight can still
raise its `end` after its day was summarised; the summary keeps the value it
had then.

D1 allows at most 5 terms in one compound `SELECT`, so the summary query is a
list of statements of at most 5 `UNION ALL` parts each (`SUMMARY_SELECTS` in
`src/day-summary.ts`): condensing runs one `INSERT OR IGNORE` per statement in
the same batch, and long `GET /stats` ranges run them all for the raw days and
concatenate the rows. The day is marked as done (`event_meta`) inside that
batch, so a failed run is retried on the next event; the failure is logged and
the event is still stored and answered with 204.

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
| `session` | `session`, `version`, `input`, `orientation`, `platform`, `kid`, optional `tester`, `returning` | once per page load; `session` 32 lowercase hex chars, `version` `YYYY-MM-DD.n`, `input` `touch`/`keys`, `orientation` `landscape`/`portrait`, `platform` `android`/`ios`/`other`, `kid` boolean; `tester` (owner's test device, stored as `tester` 1/0, omitted = 0) and `returning` (game data stored before this page load, stored as `is_returning` 1/0, omitted = `NULL`, unknown) booleans when present |
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

### `GET /stats?days=7|30|90|365|0[&testers=1]`

The insights board's data. Needs `Authorization: Bearer <STATS_TOKEN>`;
without the secret, without the header or with a wrong token it answers
`401 {"ok": false, "error": "unauthorized"}` before any database access.
`days` other than exactly `7`, `30`, `90`, `365` or `0` ("Alles": every day
since the first recorded one, at most 3650 days) answers 400. Not cached
(`Cache-Control: no-store`).

Test devices (ROADMAP 55): by default every number leaves out the sessions
with `tester` = 1 and the `run` and `end` rows of those sessions (matched by
session id, also across midnight); exactly one `testers=1` includes them, any
other value leaves them out. The long ranges use `player_value` of the day
summaries. The highscore numbers (`entries`, `topScores`) are not affected.

`200` with the `InsightsStats` shape (`src/insights-types.ts`), aggregates only.
Ranges up to 90 days are counted from the raw events. `365` and `0` add the
daily summaries of the summarised days to the raw events of the days after the
last summarised one (usually today), so no day counts twice; for them
`medianSeconds` is the mean of the daily medians weighted by each day's `end`
count (approximate) and `avgSeconds` the exact total `end` seconds / `end` count.

- `perDay`: every UTC day of the range (today included), oldest first,
  zero-filled: `sessions`, `runs`, `newPlayers` (sessions with `returning:
  false`), `returningVisits` (sessions with `returning: true`; visits, not
  people), and `entries` = rows of the highscore list
  whose `date` falls on that day (one row per device, so a device that beats
  its best moves to the new day).
- `sessions`: `total`, `medianSeconds` and `avgSeconds` over the `end` rows of
  the range (whole seconds, 0 without any).
- `visits`: `new`, `returning` and `unknown` (sessions without the flag, from
  builds before ROADMAP 55) over the range; they add up to `sessions.total`.
- `runs`: `total`, `perSession` (runs / sessions, 2 decimals) and histograms,
  zero-filled, keys as strings ascending: `seconds` by lower bounds
  0/30/60/180/600, `distance` per 100 m (0..5000), `score` per score bucket.
- `split`: sessions by `input`, `orientation`, `platform`, `kid`
  (`true`/`false`), `version`, `country`, `region`, `city`, largest first.
  Every country, region and city is listed from its first session on
  (`MIN_GROUP_SESSIONS` = 1); only unknown places are merged into `other`.
- `topScores`: the current top 20 (`name`, `score`, `date`), as `GET /top`.

### `POST /feedback`

A bug report or an idea from the game. `Content-Type` `text/plain` or
`application/json`, at most 16384 bytes (`MAX_FEEDBACK_BYTES`). The body must
have exactly these fields (`FeedbackBody` in `src/feedback-types.ts`, limits in
`src/feedback-rules.ts`):

| Field | Rule |
| --- | --- |
| `session` | the telemetry session id of the page load, 32 lowercase hex chars (rate limit only, see "Privacy") |
| `kind` | `bug` or `idea` |
| `text` | 3-500 chars after trimming; no control characters except newline (`\r\n` counts as newline); stored trimmed, with more than two blank lines in a row cut to two |
| `version` | `YYYY-MM-DD.n` |
| `platform`, `input`, `orientation` | as in `POST /event` |
| `viewWidth` | integer 320..427 |
| `log` | array of at most 20 strings of at most 200 chars without control characters; must be `[]` for an `idea` |

Responses:

- `201 {"ok": true}`: stored.
- `400 {"ok": false, "error": "bad-request"}`: other content type, too large,
  not JSON, unknown or missing fields, values outside the rules.
- `403 {"ok": false, "error": "forbidden"}`: the `Origin` header is missing or
  not one of the game origins.
- `429 {"ok": false, "error": "rate"}`: this session already sent 3 today
  (`FEEDBACK_PER_SESSION_PER_DAY`, per UTC day), or 200 were accepted from all
  sessions today (`FEEDBACK_DAILY_CAP` in `src/feedback-store.ts`). The game
  shows "heute schon genug Feedback".

On the first accepted feedback of a UTC day, after it is stored, the worker
deletes feedback older than 365 days and the counters of past days, in one
transaction that also marks the day as done (`event_meta` key
`feedback-pruned`). A failure is logged, the feedback stays stored and is
answered with 201, and the next feedback retries.

### `GET /feedback`

The insights board's feedback list. Needs `Authorization: Bearer <STATS_TOKEN>`
like `GET /stats` (401 before any database access otherwise). Not cached
(`Cache-Control: no-store`). `200 {"entries": [...]}` (`FeedbackList`): the
newest 100 (`FEEDBACK_LIST_LIMIT`), newest day first and, within a day, the
latest first; each entry has `id`, `day` (`YYYY-MM-DD`, UTC), `kind`, `text`,
`version`, `platform`, `input`, `orientation`, `viewWidth` and `log` (array).

Anything else answers `404 {"ok": false, "error": "not-found"}`.
An unexpected server error (for example a failing database) answers
`500 {"error": "server"}` with the CORS headers of the request, so the browser
can read it.

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
  the coarse values listed under `POST /event` (buckets, not exact scores),
  and on `session` rows whether the game had stored data on the device before
  (new vs. returning, no id) and whether it is one of the operator's test
  devices. No name, no device id, no IP address.
- Location: on `session` rows only, `country`, `region` and `city` as
  Cloudflare derives them from the IP (`request.cf`, coarse IP geolocation,
  often only the nearest larger town). The worker never reads or stores the IP
  itself, and `run`/`end` rows carry no location.
- `GET /stats` returns aggregates only (session counts per place, no rows);
  places without a location are shown as `other`.
- Retention: raw events older than 90 days are deleted (checked on the first
  event of each UTC day, after that day's condensing); `event_days` keeps only
  today's counter and `event_meta` only the day of the last deletion.
- Daily counts are kept for good (table `day_summaries`, see "Daily
  summaries"): per UTC day only totals and per-value counts, no session id, no
  hour, no device id, no IP.
- Access: only with the `STATS_TOKEN` secret.

### Feedback

Purpose: let players report bugs and suggest ideas so the game can be fixed
and improved. Legal basis: legitimate interest, Art. 6(1)(f) DSGVO.

- Stored per feedback (table `feedback`): kind, the text (normalised), game
  version, platform, input, orientation, view width, the UTC **day** (no time) and, only when the player
  ticked "Fehlerprotokoll mitsenden" on a bug report, up to 20 error log lines.
  No name, no device id, no session id, no IP address.
- Rate limit (table `feedback_counts`): per UTC day the SHA-256 hash of the
  session id with a count, and one count for all sessions. It is not linked to
  any feedback row and is deleted on the first feedback of the next day.
- Retention: feedback is deleted after 365 days (checked on the first
  feedback of each UTC day).
- Access: only with the `STATS_TOKEN` secret (`GET /feedback`).

## Keeping it in sync with the game

`src/plausibility.ts` derives its bounds from the game's top speed
(`TOP_SPEED` in `src/gameplay/difficulty.ts`, `PX_PER_METRE` in
`src/ui/layout.ts`) and point values. Raise the bounds there when the game gets
faster or more generous with points.
