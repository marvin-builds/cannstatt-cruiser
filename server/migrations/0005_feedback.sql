-- Player feedback (ROADMAP 50). Only adds tables and an index, so it is safe on
-- an existing database and safe to apply twice; schema.sql has the same statements.
-- feedback: one row per accepted report or idea. Day (UTC) only, no exact time,
-- no session id, no device id, no IP. log is a JSON array of strings ('[]' when none).
-- Rows older than 365 days are deleted once a day.
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY,
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  input TEXT NOT NULL,
  orientation TEXT NOT NULL,
  view_width INTEGER NOT NULL,
  log TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_day ON feedback (day, id);

-- Rate-limit counters per UTC day: session_hash is the SHA-256 hex of the session id
-- (never linked to a feedback row), 'all' counts every session of that day.
-- Rows of past days are deleted once a day.
CREATE TABLE IF NOT EXISTS feedback_counts (
  day TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, session_hash)
);
