-- GitHub issue state on the board's tickets (ROADMAP 82). Adds columns only, so all
-- feedback is kept; schema.sql has them for fresh databases.
-- Not idempotent: SQLite cannot add a column twice, so a second run fails at the
-- first statement ("duplicate column name: issue_state") and changes nothing. Apply it
-- exactly once, after a backup, and before deploying the worker that uses it. Both
-- columns are nullable, so no statement can fail on existing rows; rows that already
-- have an issue get their state on the next board load (GET /feedback reads GitHub).
--   issue_state: the linked issue as the worker last read it from GitHub: open,
--     completed (closed as done), notPlanned (closed as not planned or duplicate),
--     missing (404/410, deleted or transferred away), or NULL (no issue, not read yet).
--   issue_closed_day: UTC day (YYYY-MM-DD) the issue was closed, NULL while open.
-- The once-a-minute throttle of those reads lives in event_meta ('issues-read'), which
-- needs no change.
ALTER TABLE feedback ADD COLUMN issue_state TEXT CHECK (issue_state IN ('open', 'completed', 'notPlanned', 'missing'));
ALTER TABLE feedback ADD COLUMN issue_closed_day TEXT;
