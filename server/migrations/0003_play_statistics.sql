-- Anonymous play statistics (POST /event, GET /stats). Only adds tables and
-- indexes, so it is safe on an existing database and safe to apply twice;
-- schema.sql has the same statements for fresh databases.
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

-- Small key-value store; 'pruned' holds the UTC day of the last retention prune.
CREATE TABLE IF NOT EXISTS event_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
