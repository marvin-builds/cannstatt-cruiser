-- Highscore list, one row per device (its best run). Stores no IP and no
-- request headers; `device` is the SHA-256 hex of the client's random device id.
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  distance INTEGER NOT NULL,
  duration INTEGER NOT NULL,
  version TEXT NOT NULL,
  date TEXT NOT NULL,
  device TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_rank ON scores (score DESC, date ASC, id ASC);
-- Databases created before this index need migrations/0002_one_row_per_device.sql first.
CREATE UNIQUE INDEX IF NOT EXISTS scores_device ON scores (device);

-- One row per accepted submission, for the per-device rate limit.
-- Rows older than a day are deleted on every submission.
CREATE TABLE IF NOT EXISTS submissions (
  device TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS submissions_device ON submissions (device, at);

-- Anonymous play statistics (POST /event, GET /stats). Databases created before
-- these tables get them from migrations/0003_play_statistics.sql (same statements).
-- No IP, no device id, no exact time: day (UTC) and hour only, coarse buckets.
-- country/region/city are Cloudflare's coarse IP location, on session rows only.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session TEXT NOT NULL,
  kind TEXT NOT NULL,
  day TEXT NOT NULL,
  hour INTEGER NOT NULL,
  version TEXT,
  input TEXT,
  orientation TEXT,
  platform TEXT,
  kid INTEGER,
  country TEXT,
  region TEXT,
  city TEXT,
  seconds INTEGER,
  score_bucket INTEGER,
  distance_bucket INTEGER
);
CREATE INDEX IF NOT EXISTS events_day_kind ON events (day, kind);
CREATE INDEX IF NOT EXISTS events_session ON events (session, kind);
CREATE UNIQUE INDEX IF NOT EXISTS events_once_per_session ON events (session, kind) WHERE kind IN ('session', 'end');

-- Accepted events per UTC day, for the global daily cap.
CREATE TABLE IF NOT EXISTS event_days (
  day TEXT PRIMARY KEY,
  accepted INTEGER NOT NULL
);

-- Small key-value store; 'pruned' holds the UTC day of the last condense + retention prune.
CREATE TABLE IF NOT EXISTS event_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Daily summaries of the play statistics, kept for good after the raw events are
-- pruned. Databases created before this table get it from
-- migrations/0004_day_summaries.sql (same statement, which documents the rows).
-- Counts only: no session id, no hour.
CREATE TABLE IF NOT EXISTS day_summaries (
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  key TEXT NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY (day, metric, key)
);
