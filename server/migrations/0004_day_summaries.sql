-- Daily summaries of the play statistics, kept for good (ROADMAP 48). Only adds
-- a table, so it is safe on an existing database and safe to apply twice;
-- schema.sql has the same statement for fresh databases.
-- One row per finished UTC day, metric and key: counts only, no session id, no hour.
--   metric 'total': key sessions | runs | ends | end_seconds (sum) | end_median (that day's median, whole seconds)
--   metric input | orientation | platform | kid | version | country | region | city: sessions per value ('' = unknown)
--   metric run_seconds | run_distance | run_score: runs per reported bucket value
CREATE TABLE IF NOT EXISTS day_summaries (
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  key TEXT NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY (day, metric, key)
);
