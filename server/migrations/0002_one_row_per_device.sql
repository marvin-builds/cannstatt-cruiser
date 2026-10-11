-- One row per device: keep only each device's best run, in the list order
-- (highest score, then earliest date, then lowest id), then enforce it with a
-- unique index. Run once on the existing database before re-applying schema.sql.
DELETE FROM scores
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY device ORDER BY score DESC, date ASC, id ASC) AS place
    FROM scores
  )
  WHERE place = 1
);
CREATE UNIQUE INDEX IF NOT EXISTS scores_device ON scores (device);
