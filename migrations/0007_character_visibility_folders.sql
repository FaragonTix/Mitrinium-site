PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS character_list_preferences (
  user_email TEXT NOT NULL,
  character_id TEXT NOT NULL,
  hidden_at TEXT NOT NULL,
  PRIMARY KEY (user_email, character_id),
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_character_list_preferences_user
  ON character_list_preferences(user_email, hidden_at DESC);

CREATE TABLE IF NOT EXISTS character_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS character_folder_assignments (
  character_id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES character_folders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_character_folder_assignments_folder
  ON character_folder_assignments(folder_id, updated_at DESC);
