CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO app_settings (key, value, updated_at, updated_by)
VALUES ('character_deletion_policy', 'forbidden', datetime('now'), 'system');
