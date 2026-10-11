-- "Mein Feedback" in the game (ROADMAP 70). Adds columns only, so all feedback is
-- kept; schema.sql has them for fresh databases.
-- Not idempotent: SQLite cannot add a column twice, so a second run fails at the
-- first statement ("duplicate column name: key_hash") and changes nothing. Apply it
-- exactly once, after a backup, and before deploying the worker that uses it. Both
-- columns are nullable, so no statement can fail on existing rows.
--   key_hash: SHA-256 (hex) of the report's secret key, which the game made on the
--     device and sends with the report. POST /feedback/status answers only for
--     id + matching key. NULL for reports sent before (they never get a status).
--   done_version: the game version (YYYY-MM-DD.n) the report was done in, set on the
--     board together with status done and cleared when the status leaves done.
ALTER TABLE feedback ADD COLUMN key_hash TEXT;
ALTER TABLE feedback ADD COLUMN done_version TEXT;
