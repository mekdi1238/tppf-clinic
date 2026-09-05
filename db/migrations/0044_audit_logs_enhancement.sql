-- Migration 0044: Audit Log Enhancements
-- Relaxes action constraint to support all action types (login, logout, dispense, import, etc.)
-- Adds user_name, description, module, ip_address columns and performance indexes.

-- +migrate Up

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS chk_audit_log_action;

ALTER TABLE audit_log
    ADD COLUMN IF NOT EXISTS user_name TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS module TEXT,
    ADD COLUMN IF NOT EXISTS ip_address TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_log_performed_at ON audit_log(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_module ON audit_log(module);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- +migrate Down

DROP INDEX IF EXISTS idx_audit_log_performed_at;
DROP INDEX IF EXISTS idx_audit_log_module;
DROP INDEX IF EXISTS idx_audit_log_action;

ALTER TABLE audit_log
    DROP COLUMN IF EXISTS ip_address,
    DROP COLUMN IF EXISTS module,
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS user_name;
