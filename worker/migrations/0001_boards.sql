-- Leaderboards. Real-time race state lives in the RaceRoom Durable Object; only finished results land here.
-- The CHECKs mirror the old Supabase tables so a bad client can't post an impossible time.

CREATE TABLE IF NOT EXISTS race_results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  track       TEXT    NOT NULL CHECK (length(track) BETWEEN 1 AND 64),
  mode        TEXT    NOT NULL CHECK (mode IN ('gp','story','daily','race','lap')),
  laps        INTEGER NOT NULL CHECK (laps BETWEEN 1 AND 80),
  name        TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 24),
  ms          INTEGER NOT NULL CHECK (ms BETWEEN 5000 AND 10800000),
  best_lap_ms INTEGER CHECK (best_lap_ms IS NULL OR best_lap_ms BETWEEN 5000 AND ms),
  pos         INTEGER NOT NULL CHECK (pos BETWEEN 1 AND 60),
  field       INTEGER NOT NULL CHECK (field BETWEEN 1 AND 60 AND pos <= field),
  story_level INTEGER CHECK (story_level IS NULL OR story_level BETWEEN 1 AND 50)
);
CREATE INDEX IF NOT EXISTS race_board ON race_results (track, mode, laps, ms);
CREATE INDEX IF NOT EXISTS race_mine  ON race_results (track, mode, laps, name, ms);

CREATE TABLE IF NOT EXISTS daily_times (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  day        TEXT    NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  name       TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 24),
  ms         INTEGER NOT NULL CHECK (ms BETWEEN 20000 AND 3600000),
  best_ms    INTEGER CHECK (best_ms IS NULL OR (best_ms BETWEEN 6000 AND 3600000 AND best_ms <= ms)),
  laps       INTEGER NOT NULL CHECK (laps BETWEEN 1 AND 10),
  CHECK (ms >= laps * 20000)
);
CREATE INDEX IF NOT EXISTS daily_board ON daily_times (day, laps, ms);

CREATE TABLE IF NOT EXISTS typing_times (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  day        TEXT    NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  name       TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 24),
  ms         INTEGER NOT NULL CHECK (ms BETWEEN 3000 AND 600000),
  wpm        REAL    NOT NULL CHECK (wpm > 0 AND wpm <= 230),
  acc        REAL    NOT NULL CHECK (acc BETWEEN 50 AND 100),
  chars      INTEGER NOT NULL CHECK (chars BETWEEN 20 AND 400),
  keys       INTEGER NOT NULL CHECK (keys >= chars AND keys <= chars * 3),
  max_kmh    INTEGER CHECK (max_kmh IS NULL OR max_kmh BETWEEN 0 AND 400),
  CHECK (abs(acc - chars * 100.0 / keys) <= 1),
  CHECK (abs(wpm - chars * 12000.0 / ms) <= 2)
);
CREATE INDEX IF NOT EXISTS typing_board ON typing_times (day, ms);
