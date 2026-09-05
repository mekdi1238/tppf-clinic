-- Migration 0046: Automatic Backup Scheduling Configuration
-- +migrate Up
CREATE TABLE IF NOT EXISTS backup_schedule (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT false,
  frequency TEXT NOT NULL DEFAULT 'daily',
  time_of_day TEXT NOT NULL DEFAULT '02:00',
  day_of_week INT NOT NULL DEFAULT 0,
  retention_count INT NOT NULL DEFAULT 14,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO backup_schedule (id, enabled, frequency, time_of_day, day_of_week, retention_count)
VALUES (1, false, 'daily', '02:00', 0, 14)
ON CONFLICT (id) DO NOTHING;

-- +migrate Down
DROP TABLE IF EXISTS backup_schedule;
