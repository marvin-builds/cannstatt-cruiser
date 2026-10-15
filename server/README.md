# Cannstatt Cruiser highscores

Online highscore list, anonymous play statistics and player feedback for the game: a
Cloudflare Worker with a D1 database (free plan). Self-contained: its own `package.json`, `tsconfig.json` and tests;
the game's root build and tests ignore this folder.

URL after deploy: **https://cannstatt-cruiser-scores.marvin-builds.workers.dev**

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
| `src/auth.ts` | Bearer token check for `GET /stats` and the feedback routes of the board (SHA-256 + constant-time compare; the secret is trimmed) |
| `src/signed-token.ts` | Stateless HMAC-SHA-256 tokens under `BOARD_SESSION_KEY` with a prefix per kind (session `v1`, tester pass `tester.v1`), so one kind never passes as another |
| `src/board-session.ts` | Board session tokens (ROADMAP 74): `POST /board/session` signs a 7-day expiry; every board route accepts the real token or a valid session token |
| `src/tester-pass.ts` | Tester passes (ROADMAP 75): `POST /board/tester-pass` signs a 180-day expiry with scope `tester`; a valid pass with `POST /feedback` lifts the per-session limit |
| `src/stats.ts`, `src/summary-stats.ts`, `src/tallies.ts`, `src/aggregate.ts` | The `GET /stats` aggregates (raw events up to 90 days, day summaries beyond) |
| `src/feedback-rules.ts`, `src/feedback-types.ts` | Feedback contract: limits and shapes (mirror of the game's `src/net/feedback-types.ts`) |
| `src/feedback-parse.ts` | Strict `POST /feedback` body check (with the optional secret key and tester pass) and text normalisation |
| `src/feedback-store.ts` | Per-session and daily feedback limits, storing (with the key hash; returns the new id), once-a-day 365-day prune, the `GET /feedback` list |
| `src/feedback-status-parse.ts` | Strict `{items: [{id, key}]}` check of `POST /feedback/status` (ROADMAP 70) and `{id, key}` of `POST /feedback/delete` (ROADMAP 78); their queries are `feedbackStatuses` and `deleteOwnFeedback` in `src/feedback-triage-store.ts` |
| `src/feedback-triage-rules.ts`, `src/feedback-triage-types.ts` | Triage contract (ROADMAP 56): statuses, issue draft and reply limits, shapes (board copy: the game's `src/insights/triage-types.ts`) |
| `src/feedback-triage-parse.ts`, `src/feedback-triage-store.ts` | Triage route parsing (id, issue draft with player message, issue link, status/reply/done-version patch) and D1 access |
| `src/github.ts`, `src/issue-body.ts` | Creates the GitHub issue and reads issue states (REST API, injected `fetch`, 3 s read timeout); the issue text with the developer addition in its own section |
| `src/issue-sync.ts` | Refreshes the stored states of linked issues on `GET /feedback`, at most once a minute (ROADMAP 82) |
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
curl https://cannstatt-cruiser-scores.marvin-builds.workers.dev/top   # -> {"entries":[]}
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

### GitHub token (secret)

`POST /feedback/:id/issue` (the board's "Umsetzen") and `POST /feedback/:id/link`
need the Wrangler secret `GITHUB_TOKEN`; without it they answer
`503 {"ok": false, "error": "github-token-missing"}` and nothing else changes.
`GET /feedback` uses it to read the states of linked issues (ROADMAP 82); without
it the board shows the last stored states.
Use a **fine-grained** personal access token that can do nothing else:

1. GitHub (signed in as `marvin-builds`) -> Settings -> Developer settings ->
   Personal access tokens -> Fine-grained tokens -> "Generate new token".
2. Name it e.g. `cannstatt-cruiser-feedback`, pick an expiration (renew it then
   with the same steps), resource owner `marvin-builds`.
3. Repository access: **Only select repositories** -> `marvin-builds/cannstatt-cruiser`.
4. Repository permissions: **Issues: Read and write** (Metadata: read-only is
   added automatically). Nothing else.
5. Generate, copy the token into your password manager, and set it:

```sh
cd server
npx wrangler secret put GITHUB_TOKEN   # paste it when asked
```

Create the labels `feedback`, `bug` and `idea` in the repository once (Issues ->
Labels), so the new issues are labelled as intended. Like `STATS_TOKEN`, the
GitHub token never goes into `wrangler.toml` (`[vars]`), a `VITE_` variable,
the board, the game or git; the worker sends it only to `api.github.com`, and
no answer ever contains it. Revoking it on GitHub stops issue creation and the
state reads at once. The worker never comments on, closes or edits an issue.

### Board session key (secret)

The insights board's "Angemeldet bleiben" (ROADMAP 74) trades the real
`STATS_TOKEN` once for a **board session token** that the board may keep in
`localStorage` for 7 days (`BOARD_SESSION_DAYS`); the real token is never
stored. The worker signs the session's expiry with HMAC-SHA-256 under the
Wrangler secret `BOARD_SESSION_KEY` and stores nothing about sessions. Without
the secret, `POST /board/session` answers `503 {"ok": false, "error":
"session-key-missing"}`, no session token is ever accepted, and the board falls
back to asking for the token after each reload. Create and set it once:

```sh
cd server
openssl rand -base64 32 | npx wrangler secret put BOARD_SESSION_KEY
```

The key never needs to be known by anyone, so it goes straight from `openssl`
into the secret (no password manager, never in `wrangler.toml` `[vars]`, a
`VITE_` variable, the board, the game or git).

**Rotation signs out every device at once:** running the same command again
makes every kept session invalid (the board then asks for the token again with
"Anmeldung abgelaufen"). Do it when a device with a kept session is lost, or
when in doubt. Rotating `STATS_TOKEN` alone does **not** end kept sessions;
rotate both if the token may have leaked.

**Release order** for the first release with board sessions: 1. set the secret
(above), 2. deploy the worker (`npx wrangler deploy`), 3. release the game (tag).
A board from before step 3 simply never asks for a session; a board after it
against a worker without the secret gets the 503 and keeps the token in memory
only, with a short note.

**Tester passes use the same key (ROADMAP 75).** When the owner marks a device
as a test device on the board ("Dieses Gerät ist ein Testgerät"), the board
fetches a **tester pass** (`POST /board/tester-pass`) and keeps it in that
device's `localStorage`, where the game reads it and sends it as `testerPass`
with `POST /feedback`. A valid pass unlocks exactly one thing: the
per-session feedback limit (3 a day) no longer applies to that device; the
global daily cap (200) still does. A pass opens no board route, and a board
session token is no pass. Passes last 180 days (`TESTER_PASS_DAYS`) and are
refreshed on every unlock of the board on a marked device. **Rotating
`BOARD_SESSION_KEY` also invalidates every tester pass**: test devices then
fall back to the normal limit (an invalid pass is ignored, never an error)
until the board is unlocked on them again.

Secrets are trimmed before use (`STATS_TOKEN`, `GITHUB_TOKEN`,
`BOARD_SESSION_KEY`), so a line break pasted into `wrangler secret put` does no
harm.

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

`0007_feedback_triage.sql` (feedback triage, ROADMAP 56): adds
`feedback.status` (`open`/`todo`/`done`/`rejected`, `NOT NULL DEFAULT 'open'`
with a `CHECK`), `feedback.issue` and `feedback.reply` (both nullable); every
existing row becomes `open` without issue or reply. Like 0006 it is **not**
safe to apply twice: a second run fails at its first statement ("duplicate
column name: status") and changes nothing. The new worker reads and writes
these columns (also in `GET /feedback` and the daily prune), so the order is:

```sh
cd server
npx wrangler d1 export cannstatt-cruiser-scores --remote --output=backup-before-0007.sql   # 1. backup
npx wrangler d1 execute cannstatt-cruiser-scores --remote --file=migrations/0007_feedback_triage.sql   # 2. migrate, once
npx wrangler d1 execute cannstatt-cruiser-scores --remote --file=schema.sql   # 3. schema (no-op now)
npx wrangler secret put GITHUB_TOKEN   # 4. token (see "GitHub token"), once
npx wrangler deploy   # 5. new worker
```

Locally: `npx wrangler d1 execute cannstatt-cruiser-scores --local --file=migrations/0007_feedback_triage.sql`.

`0008_feedback_keys.sql` ("Mein Feedback", ROADMAP 70): adds the nullable
columns `feedback.key_hash` (SHA-256 of the report's secret key) and
`feedback.done_version` (the game version a done report shipped in). Existing
rows get `NULL` in both, so reports sent before it never get a status (the
game drops them). Like 0007 it is **not** safe to apply twice: a second run
fails at its first statement ("duplicate column name: key_hash") and changes
nothing. The new worker writes `key_hash` on every `POST /feedback` and reads
both columns, and the game release that sends keys and uses
`POST /feedback/status` needs the new worker (the old one rejects the `key`
field and has no `POST /feedback/status`), so the order is:

```sh
cd server
npx wrangler d1 export cannstatt-cruiser-scores --remote --output=backup-before-0008.sql   # 1. backup
npx wrangler d1 execute cannstatt-cruiser-scores --remote --file=migrations/0008_feedback_keys.sql   # 2. migrate, once
npx wrangler d1 execute cannstatt-cruiser-scores --remote --file=schema.sql   # 3. schema (no-op now)
npx wrangler deploy   # 4. new worker, before the game release
```

Then release the game (tag). Between steps 4 and the release, the live game
still sends reports without a key (accepted, never get a status) and its old
`GET /feedback/status` gets a 404, which it treats as a failed check.

Locally: `npx wrangler d1 execute cannstatt-cruiser-scores --local --file=migrations/0008_feedback_keys.sql`.

`0009_issue_state.sql` (GitHub issue state on the board, ROADMAP 82): adds the
nullable columns `feedback.issue_state` (`open`, `completed`, `notPlanned`,
`missing`, with a `CHECK`) and `feedback.issue_closed_day` (UTC day the issue
was closed). Existing rows get `NULL` in both; rows with an issue get their
state on the next board load. The once-a-minute throttle of the GitHub reads
uses the existing `event_meta` table (key `issues-read`), so nothing else
changes. Like 0008 it is **not** safe to apply twice: a second run fails at its
first statement ("duplicate column name: issue_state") and changes nothing. The
new worker reads and writes both columns on `GET /feedback`, `PATCH` and the
issue routes, so the migration must come **before** the deploy:

```sh
cd server
npx wrangler d1 export cannstatt-cruiser-scores --remote --output=backup-before-0009.sql   # 1. backup
npx wrangler d1 execute cannstatt-cruiser-scores --remote --file=migrations/0009_issue_state.sql   # 2. migrate, once
npx wrangler d1 execute cannstatt-cruiser-scores --remote --file=schema.sql   # 3. schema (no-op now)
npx wrangler deploy   # 4. new worker, before the board and game release
```

The old worker ignores the new columns, so the order only matters for the new
one. Then release the game (the board's workflow and "Löschen" in "Mein Feedback"
need the new routes).

Locally: `npx wrangler d1 execute cannstatt-cruiser-scores --local --file=migrations/0009_issue_state.sql`.

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
| `input`, `platform`, `kid`, `version`, `country`, `region`, `city` | the value (`kid` as `true`/`false`, `''` = unknown) | sessions |
| `orientation` | `landscape`/`portrait` | sessions; only on days summarised before ROADMAP 69, no longer read |
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
`https://marvin-builds.github.io` and `http://localhost:*` / `http://127.0.0.1:*`
with the methods `GET, POST, PATCH, DELETE, OPTIONS` and the headers `Content-Type,
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
| `session` | `session`, `version`, `input`, `platform`, `kid`, optional `tester`, `returning` | once per page load; `session` 32 lowercase hex chars, `version` `YYYY-MM-DD.n`, `input` `touch`/`keys`, `platform` `android`/`ios`/`other`, `kid` boolean; `tester` (owner's test device, stored as `tester` 1/0, omitted = 0) and `returning` (game data stored before this page load, stored as `is_returning` 1/0, omitted = `NULL`, unknown) booleans when present; an `orientation` (`landscape`/`portrait`) from builds before ROADMAP 69 is accepted but not stored (the `events.orientation` column stays `NULL` for new rows) |
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

### `POST /board/session`

Starts a board session (ROADMAP 74). Needs `Authorization: Bearer <STATS_TOKEN>`
(the real token only: a session token cannot extend itself); otherwise `401`
before anything else. No body. Not cached.

- `200 {"token": "v1.<expiresAt>.<signature>", "expiresAt": <ms since epoch>}`:
  the token carries only its expiry (7 days from now, `BOARD_SESSION_MS`) and
  its HMAC-SHA-256 signature (base64url) under `BOARD_SESSION_KEY`.
- `503 {"ok": false, "error": "session-key-missing"}` without the secret.
- Other methods answer `404`.

A session token is accepted, in the same `Authorization: Bearer` header, by
every route that accepts `STATS_TOKEN` (`GET /stats`, `GET /feedback`, the
triage routes) while it has not expired, its signature matches the current
key (compared in constant time) and its expiry is at most 7 days ahead.

Rate limiting: failed attempts are not counted. Both tokens are 256-bit random
values (`openssl rand -base64 32`), so online guessing is hopeless at any
request rate the free plan allows (100,000 requests a day would need about
10^69 years on average), and every failure answers 401 before any database
access, so a flood of wrong tokens costs no database reads or writes. A counter
would need either the database on every failed request (turning a flood into
database writes) or the client IP, which the worker never reads. The session
route adds nothing to guess that `GET /stats` did not already offer.

### `POST /board/tester-pass`

Issues a tester pass for a test device (ROADMAP 75). Needs `Authorization:
Bearer <STATS_TOKEN>` or a board session token (a tester pass cannot get
another); otherwise `401` before anything else. No body. Not cached.

- `200 {"pass": "tester.v1.<expiresAt>.<signature>", "scope": "tester", "expiresAt": <ms since epoch>}`:
  the pass carries only its expiry (180 days from now, `TESTER_PASS_MS`) and its
  HMAC-SHA-256 signature under `BOARD_SESSION_KEY`; the `tester.v1` prefix is
  part of the signed text, so it can never pass as a session token or the
  other way round.
- `503 {"ok": false, "error": "session-key-missing"}` without the secret.
- Other methods answer `404`.

### `GET /stats?days=7|30|90|365|0[&testers=1]`

The insights board's data. Needs `Authorization: Bearer <STATS_TOKEN>` or a
valid board session token (see `POST /board/session`);
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
- `split`: sessions by `input`, `platform`, `kid`
  (`true`/`false`), `version`, `country`, `region`, `city`, largest first.
  Every country, region and city is listed from its first session on
  (`MIN_GROUP_SESSIONS` = 1); only unknown places are merged into `other`.
- `topScores`: the current top 20 (`name`, `score`, `date`), as `GET /top`.

### `POST /feedback`

A bug report or an idea from the game. `Content-Type` `text/plain` or
`application/json`, at most 16384 bytes (`MAX_FEEDBACK_BYTES`). The body must
have exactly these fields, `key` and `testerPass` optional (`FeedbackBody` in `src/feedback-types.ts`, limits in
`src/feedback-rules.ts`):

| Field | Rule |
| --- | --- |
| `session` | the telemetry session id of the page load, 32 lowercase hex chars (rate limit only, see "Privacy") |
| `kind` | `bug` or `idea` |
| `text` | 3-500 chars after trimming; no control characters except newline (`\r\n` counts as newline); stored trimmed, with more than two blank lines in a row cut to two |
| `version` | `YYYY-MM-DD.n` |
| `platform`, `input` | as in `POST /event` |
| `orientation` | `landscape`/`portrait` |
| `viewWidth` | integer 320..427 |
| `log` | array of at most 20 strings of at most 200 chars without control characters; must be `[]` for an `idea` |
| `testerPass` | optional: a tester pass from `POST /board/tester-pass`, a string of at most 512 chars (`MAX_TESTER_PASS_CHARS`, longer or not a string: 400). A valid, unexpired pass lifts the per-session limit; an invalid or expired one is ignored (normal limit, no error). Never stored |
| `key` | optional: the report's secret key, exactly 32 lowercase hex chars (`FEEDBACK_KEY_PATTERN`, 128 random bits made by the game); only its SHA-256 is stored (`key_hash`), the key itself never. Games before ROADMAP 70 send none |

Responses:

- `201 {"ok": true, "id": 42}`: stored; `id` is the new entry's id (`FeedbackSent`). The game keeps it with the
  key on the device to ask for the entry's status later (`POST /feedback/status`). Older games ignore it.
- `400 {"ok": false, "error": "bad-request"}`: other content type, too large,
  not JSON, unknown or missing fields, values outside the rules, a malformed `key`.
- `403 {"ok": false, "error": "forbidden"}`: the `Origin` header is missing or
  not one of the game origins.
- `429 {"ok": false, "error": "rate"}`: this session already sent 3 today
  (`FEEDBACK_PER_SESSION_PER_DAY`, per UTC day), or 200 were accepted from all
  sessions today (`FEEDBACK_DAILY_CAP` in `src/feedback-store.ts`); with a valid
  tester pass only the global cap applies. The game
  shows "heute schon genug Feedback".

On the first accepted feedback of a UTC day, after it is stored, the worker
deletes feedback older than 365 days (except status `todo`) and the counters of past days, in one
transaction that also marks the day as done (`event_meta` key
`feedback-pruned`). A failure is logged, the feedback stays stored and is
answered with 201, and the next feedback retries.

### `GET /feedback`

The insights board's feedback list. Needs `Authorization: Bearer <STATS_TOKEN>`
(or a board session token) like `GET /stats` (401 before any database access otherwise). Not cached
(`Cache-Control: no-store`). `200 {"entries": [...]}` (`FeedbackList`): the
newest 100 (`FEEDBACK_LIST_LIMIT`), newest day first and, within a day, the
latest first; each entry has `id`, `day` (`YYYY-MM-DD`, UTC), `kind`, `text`,
`version`, `platform`, `input`, `orientation`, `viewWidth` and `log` (array),
and the triage fields `status` (`open`, `todo`, `done`, `rejected`), `issue`
(GitHub issue number or `null`), `reply` (string or `null`), `doneVersion`
(`YYYY-MM-DD.n` or `null`), `issueState` and `issueClosedDay` (below; both
`null` without an issue). Never the key hash.

Issue states (ROADMAP 82): with `GITHUB_TOKEN` set, the request first refreshes
the stored states of the linked issues, at most once per 60 s
(`ISSUE_SYNC_INTERVAL_MS`; an attempt counts, so a failing GitHub is not asked on
every load): one `GET /repos/marvin-builds/cannstatt-cruiser/issues?state=all&per_page=100&sort=updated`
(pull requests skipped), and for linked issues not in that answer up to 10
(`MAX_SINGLE_ISSUE_READS`, never-read ones first) single `GET .../issues/{n}` in
parallel. `issueState`: `open`; `completed` (closed, any reason but the next);
`notPlanned` (closed as `not_planned` or `duplicate`); `missing` (404/410 or a
pull request). `issueClosedDay`: UTC day of `closed_at`, `null` while open. Each
GitHub read gives up after 3 s; a failing, slow or unusable GitHub leaves the
stored states and the answer is still `200` (nothing of GitHub's answer is passed on).

### `POST /feedback/status`

What happened to the player's own feedback (ROADMAP 57, 70, "Mein Feedback").
No token: the game asks for the reports it sent from this device, each by the
id it got from `POST /feedback` and the secret key it sent with the report, so
nobody can read another report's status or reply by trying ids. A POST, so the
keys never appear in a URL or a log. `Content-Type` `text/plain` or
`application/json`, at most 2048 bytes (`MAX_STATUS_BYTES`), body exactly
`{"items": [{"id": 3, "key": "<32 lowercase hex>"}, ...]}` (`FeedbackStatusQuery`)
with 1-20 items (`MAX_STATUS_ITEMS`), each with exactly `id` (positive integer)
and `key` (`FEEDBACK_KEY_PATTERN`). The worker hashes every key (the same work
per item) and reads the matching rows in one query. Only reads: no write, no
counter, no housekeeping. Needs a game `Origin` like `POST /feedback`.

- `200 {"entries": [{"id": 3, "status": "done", "reply": null, "doneVersion": "2026-10-12.1"}, ...]}`
  (`FeedbackStatusList`), ascending by id: only `id`, `status`, `reply` and
  `doneVersion`, never the text, the log or anything else. Rows that are
  unknown (deleted or pruned), have no key hash (sent before 0008) or whose
  key does not match are left out; the game shows a left-out report as
  "Entfernt". `Cache-Control: no-store`.
- `400` bad body; `403` missing or foreign `Origin` (both before any database access).
- Any other method on `/feedback/status` answers `404`; the old
  `GET /feedback/status?ids=` of ROADMAP 57 is gone.

### `POST /feedback/delete`

The player deletes one of their own reports (ROADMAP 78, "Löschen" in "Mein
Feedback"). No token: like `POST /feedback/status`, a game `Origin` (`403`
otherwise, before any database access) and the report's secret key prove
ownership. `Content-Type` `text/plain` or `application/json`, at most 256 bytes
(`MAX_DELETE_BYTES`), body exactly `{"id": 3, "key": "<32 lowercase hex>"}`
(`FeedbackDeleteBody`).

- `204` the row whose id and key hash both match was deleted (it disappears
  from the board; a linked GitHub issue stays).
- `404 {"ok": false, "error": "not-found"}` when nothing matched: the same
  answer for an unknown id, a wrong key and a report without a key.
- `400` bad body; `403` missing or foreign `Origin`. Other methods: `404`.

### Feedback triage (ROADMAP 56)

All four routes need `Authorization: Bearer <STATS_TOKEN>` (or a board session token) and check it first:
without it they answer `401` before any database access or GitHub call. The id
is the entry's `id` (a positive integer; anything else is 400). JSON bodies
(`application/json` or `text/plain`) of at most 32 KB. Not cached.

- `POST /feedback/:id/issue`, body `{"title", "body"}` and optionally `"addition"` and `"reply"` as the operator
  edited them on the board: title 3-120 chars (one line, spaces collapsed),
  body 1-8000 chars after trimming (line breaks and tabs allowed, no other
  control characters); `addition` ("Ergänzung (Entwickler)", ROADMAP 75) at most
  2000 chars after trimming (`MAX_ISSUE_ADDITION`, same characters as the body;
  empty means none). The issue text is the body, then, with an addition, a rule
  and a section headed `**Ergänzung des Entwicklers**` (`src/issue-body.ts`), so
  the developer's words never land inside the player's quote. Creates an issue in `marvin-builds/cannstatt-cruiser`
  with the labels `feedback` plus the entry's kind (`bug` or `idea`), stores
  its number with the issue state `open` and sets the status to `todo` ("Geplant" on the board) in the same
  request; `reply` (the player message, ROADMAP 83, same rules as in `PATCH`; `""` or `null`
  clears it, a missing field keeps the stored one) is stored with it. When the issue cannot be
  created nothing changes.
  - `201 {"ok": true, "issue": 12}`.
  - `400` bad id or body; `404` no such entry; `409 {"ok": false, "error":
    "exists", "issue": 5}` when the entry already has an issue.
  - `503 {"ok": false, "error": "github-token-missing"}` without the secret.
  - `502 {"ok": false, "error": "github", "status": 403}` when GitHub refuses
    (its HTTP status) or cannot be reached / answers unusably (`status` 0).
    Nothing of GitHub's answer is passed on, and nothing is stored.
- `POST /feedback/:id/link`, body `{"issue": 12}` and optionally `"reply"` (`IssueLink`, ROADMAP 83):
  links an existing issue instead of creating one (duplicates). Reads the issue
  from GitHub (`GET .../issues/12`), then stores the number, its state, `todo`
  and the reply (as in `/issue`) in one update; clears the done version.
  - `200 {"ok": true, "issue": 12, "issueState": "open", "issueClosedDay": null}`.
  - `422 {"ok": false, "error": "issue-not-found"}` when GitHub has no such issue
    in the repository (404/410) or the number is a pull request; nothing is stored.
  - `400`, `404`, `409 exists`, `503 github-token-missing` and `502 github` as for `/issue`;
    except that an entry whose stored issue state is `missing` may get another issue linked
    (the board offers "Issue verknüpfen" there), which replaces the lost one.
- `PATCH /feedback/:id`, body with `status`, `reply` and/or `doneVersion` (no other fields):
  `status` one of the four; `reply` a single line of at most 140 chars after
  trimming (`MAX_REPLY_CHARS`, shown to the player in "Mein Feedback", see `POST /feedback/status`), `""` or
  `null` clears it; `doneVersion` (`YYYY-MM-DD.n` or `null`) only together
  with `status: "done"`. Every patch with a `status` sets the done version:
  the given one with `done` (none given: `null`), `null` for any other status
  (creating an issue, which sets `todo`, clears it too). Only the given fields
  change; the issue number stays. `status: "todo"` needs a linked issue
  (ROADMAP 83: Geplant always has one): without it `409 {"ok": false, "error": "no-issue"}`
  and nothing changes. Otherwise the workflow is up to the board.
  `200 {"ok": true, "status", "issue", "reply", "doneVersion", "issueState", "issueClosedDay"}`, `400`, `404`.
- `DELETE /feedback/:id`: deletes the entry. `204`, `404`.

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
- Access: only with the `STATS_TOKEN` secret or a board session made with it.

### Feedback

Purpose: let players report bugs and suggest ideas so the game can be fixed
and improved. Legal basis: legitimate interest, Art. 6(1)(f) DSGVO.

- Stored per feedback (table `feedback`): kind, the text (normalised), game
  version, platform, input, orientation, view width, the UTC **day** (no time) and, only when the player
  ticked "Fehlerprotokoll mitsenden" on a bug report, up to 20 error log lines,
  and the SHA-256 hash of the report's secret key (the key itself is never
  stored). No name, no device id, no session id, no IP address.
- Status check: the game keeps what it sent (text, details, log) on the device
  and sends only report ids with their secret keys to `POST /feedback/status`;
  the answer holds only status, reply and done version of reports whose key matches.
- Rate limit (table `feedback_counts`): per UTC day the SHA-256 hash of the
  session id with a count, and one count for all sessions. It is not linked to
  any feedback row and is deleted on the first feedback of the next day.
- Retention: feedback is deleted after 365 days (checked on the first
  feedback of each UTC day), except entries with status `todo`, which are
  kept until their status changes.
- Triage: the operator may publish an entry as an anonymous GitHub issue
  after reviewing and editing the text on the board (the log only when it is
  needed), and store a status, a short reply and the version it was done in on the row.
  The worker reads the state of linked issues from GitHub (open/closed, reason, closing day) and stores it on the row.
- Deletion by the player: `POST /feedback/delete` with the report's id and secret key removes the row
  at once (a published GitHub issue stays, it holds only the operator's edited text).
- Access: only with the `STATS_TOKEN` secret or a board session made with it (`GET /feedback` and the triage routes).

### Board sessions

A board session token holds only its expiry and a signature: no name, no
device, no IP. The worker stores nothing about sessions; the board keeps the
token and its expiry in the operator's `localStorage` until it expires, a
request answers 401, or the operator presses "Abmelden".

A tester pass likewise holds only its expiry, its scope and a signature. It is
sent with the feedback of a test device but never stored and never linked to
the report; it only decides which daily limit applies.

## Keeping it in sync with the game

`src/plausibility.ts` derives its bounds from the game's top speed
(`TOP_SPEED` in `src/gameplay/difficulty.ts`, `PX_PER_METRE` in
`src/ui/layout.ts`) and point values. Raise the bounds there when the game gets
faster or more generous with points.
