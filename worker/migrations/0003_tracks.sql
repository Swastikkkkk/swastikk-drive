-- Shared drawn tracks: the track code (the same compact text the game used to put in the link) under a short id.
-- About 1-3 KB each; D1 is plenty, no object storage needed.
CREATE TABLE IF NOT EXISTS tracks (
  id         TEXT PRIMARY KEY CHECK (length(id) = 8),
  code       TEXT NOT NULL CHECK (length(code) BETWEEN 40 AND 12000),
  name       TEXT NOT NULL DEFAULT 'Track' CHECK (length(name) BETWEEN 1 AND 40),
  points     INTEGER NOT NULL CHECK (points BETWEEN 6 AND 800),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  opens      INTEGER NOT NULL DEFAULT 0
);
