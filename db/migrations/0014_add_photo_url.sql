-- +migrate Up

ALTER TABLE patients ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE employee_registrations ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE physicians ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- +migrate Down

ALTER TABLE physicians DROP COLUMN IF EXISTS photo_url;
ALTER TABLE employee_registrations DROP COLUMN IF EXISTS photo_url;
ALTER TABLE patients DROP COLUMN IF EXISTS photo_url;
