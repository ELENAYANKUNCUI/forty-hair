CREATE TABLE IF NOT EXISTS scores (
  client_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  hair INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scores_rank
ON scores(score DESC, hair DESC, created_at ASC);
