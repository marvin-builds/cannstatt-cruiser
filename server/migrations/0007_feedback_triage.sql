-- Feedback triage on the insights board (ROADMAP 56). Adds columns only, so all
-- feedback is kept; schema.sql has them for fresh databases.
-- Not idempotent: SQLite cannot add a column twice, so a second run fails at the
-- first statement ("duplicate column name: status") and changes nothing. Apply it
-- exactly once, after a backup. Every column is nullable or has a default, so no
-- statement can fail on existing rows.
--   status: open (new, the default for every old row), todo (a GitHub issue was
--     made or it is planned), done, rejected. Rows with status todo survive the
--     365-day prune.
--   issue: the number of the GitHub issue in marvinmai/cannstatt-cruiser, or NULL.
--   reply: the operator's short answer for the player (ROADMAP 57), or NULL.
ALTER TABLE feedback ADD COLUMN status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'todo', 'done', 'rejected'));
ALTER TABLE feedback ADD COLUMN issue INTEGER;
ALTER TABLE feedback ADD COLUMN reply TEXT;
