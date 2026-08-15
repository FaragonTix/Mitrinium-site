ALTER TABLE roll_log ADD COLUMN admin_only INTEGER NOT NULL DEFAULT 0;
ALTER TABLE roll_log ADD COLUMN details_json TEXT;

UPDATE roll_log
SET admin_only = 1
WHERE class_name = 'Противник'
   OR character_name = 'Калькулятор боя';

CREATE INDEX IF NOT EXISTS idx_roll_log_visibility_created
  ON roll_log(admin_only, created_at DESC);
