PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS character_shares (
  character_id TEXT NOT NULL,
  user_email TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  PRIMARY KEY (character_id, user_email),
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_character_shares_user
  ON character_shares(user_email, character_id);
