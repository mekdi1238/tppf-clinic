-- Migration 0022: Add Department to Users and Created By to Visits
-- +migrate Up

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS department TEXT;

ALTER TABLE visits
    ADD COLUMN IF NOT EXISTS created_by_user_id TEXT;

-- +migrate Down

ALTER TABLE visits DROP COLUMN IF EXISTS created_by_user_id;
ALTER TABLE users DROP COLUMN IF EXISTS department;
