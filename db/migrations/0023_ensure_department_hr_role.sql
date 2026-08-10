-- Migration 0023: Ensure department_hr role exists in roles table
-- +migrate Up

INSERT INTO roles (name, display_name)
VALUES ('department_hr', 'Department HR')
ON CONFLICT (name) DO NOTHING;

-- +migrate Down
