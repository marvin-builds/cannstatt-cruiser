-- Test devices and new vs. returning players (ROADMAP 55). Adds nullable columns
-- only, so all data is kept; schema.sql has them for fresh databases.
-- Not idempotent: SQLite cannot add a column twice, so a second run fails at the
-- first statement and changes nothing. Apply it exactly once, after a backup.
--   events.tester: 1 = session from one of the owner's test devices; 0 or NULL
--     (rows from before this migration) = a player.
--   events.is_returning: 1 = the game had stored data on the device before the
--     page load, 0 = it had none (new player), NULL = unknown (older builds).
--     Not named `returning`, which is an SQL keyword.
--   day_summaries.player_value: the row's count without test devices; NULL on
--     days summarised before this migration, which count as players (= value).
ALTER TABLE events ADD COLUMN tester INTEGER;
ALTER TABLE events ADD COLUMN is_returning INTEGER;
ALTER TABLE day_summaries ADD COLUMN player_value INTEGER;
