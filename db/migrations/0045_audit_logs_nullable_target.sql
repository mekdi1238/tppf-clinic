-- Migration 0045: Make audit_log target columns nullable
-- Allows recording audit events where table_name, record_id, or user_id are optional.

-- +migrate Up
ALTER TABLE audit_log ALTER COLUMN table_name DROP NOT NULL;
ALTER TABLE audit_log ALTER COLUMN record_id DROP NOT NULL;
ALTER TABLE audit_log ALTER COLUMN user_id DROP NOT NULL;

-- +migrate Down
-- Kept nullable for safety across schema versions
