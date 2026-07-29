CREATE TABLE IF NOT EXISTS calculator_encounters (
  user_email TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calculator_enemies (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  name TEXT NOT NULL,
  type_key TEXT NOT NULL,
  class_key TEXT NOT NULL,
  tag_key TEXT NOT NULL,
  level INTEGER NOT NULL,
  bp INTEGER NOT NULL,
  difficulty_key TEXT NOT NULL,
  data_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calculator_enemies_updated
  ON calculator_enemies(updated_at DESC);

