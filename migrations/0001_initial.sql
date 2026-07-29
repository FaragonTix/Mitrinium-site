PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  player TEXT NOT NULL DEFAULT '',
  class_name TEXT NOT NULL DEFAULT '',
  owner_email TEXT NOT NULL,
  data_json TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_characters_owner
  ON characters(owner_email, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_characters_visible
  ON characters(hidden, updated_at DESC);

CREATE TABLE IF NOT EXISTS character_states (
  character_id TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL,
  data_json TEXT NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS roll_log (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  user_email TEXT NOT NULL,
  character_id TEXT NOT NULL DEFAULT '',
  character_name TEXT NOT NULL DEFAULT '',
  class_name TEXT NOT NULL DEFAULT '',
  class_icon TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  final_result TEXT NOT NULL DEFAULT '',
  ef INTEGER,
  complication TEXT NOT NULL DEFAULT '',
  breakthrough TEXT NOT NULL DEFAULT '',
  dice_json TEXT NOT NULL DEFAULT '[]',
  control_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_roll_log_created
  ON roll_log(created_at DESC);

