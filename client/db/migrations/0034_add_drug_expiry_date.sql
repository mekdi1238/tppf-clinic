-- +migrate Up
ALTER TABLE drugs ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- +migrate Down
ALTER TABLE drugs DROP COLUMN IF EXISTS expiry_date;
