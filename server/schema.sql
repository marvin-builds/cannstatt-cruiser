-- Highscore list. Stores no IP and no request headers; `device` is the
-- SHA-256 hex of the client's random device id.
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

-- One row per accepted submission, for the per-device rate limit.
-- Rows older than a day are deleted on every submission.
CREATE TABLE IF NOT EXISTS submissions (
  device TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS submissions_device ON submissions (device, at);
