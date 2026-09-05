-- +migrate Up
ALTER TABLE visits ADD COLUMN IF NOT EXISTS treatment TEXT;

-- +migrate Down
ALTER TABLE visits DROP COLUMN IF EXISTS treatment;
