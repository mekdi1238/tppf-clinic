-- +migrate Up
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- +migrate Down
ALTER TABLE users DROP COLUMN IF EXISTS photo_url;
