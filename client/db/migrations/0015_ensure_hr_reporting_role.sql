-- Migration 0015: Ensure hr_reporting role exists
-- The seed.js file creates this role, but production environments
-- that don't run seed.js would be missing it entirely, making the
-- role-based access control incomplete.

-- +migrate Up

INSERT INTO roles (name, display_name)
VALUES ('hr_reporting', 'HR Reporting')
ON CONFLICT (name) DO NOTHING;

-- +migrate Down

-- Intentionally no-op: we don't want to delete a role that may
-- already have user assignments, and ON CONFLICT DO NOTHING means
-- this migration is safe to re-run.
