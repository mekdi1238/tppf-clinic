-- Migration 0017: Update Employee Registrations with Dept/Position
-- Adds upfront department/position selection to candidate registration.

-- +migrate Up

ALTER TABLE employee_registrations
    ADD COLUMN department TEXT;

ALTER TABLE employee_registrations
    ADD COLUMN position TEXT;

-- Relax clinic_staff format constraint to allow CI (Medical) and E (Employee) prefixes.
ALTER TABLE clinic_staff DROP CONSTRAINT IF EXISTS chk_staff_code_format;
ALTER TABLE clinic_staff ADD CONSTRAINT chk_staff_code_format CHECK (staff_code ~ '^(CI|E)[0-9]+$');

-- +migrate Down

ALTER TABLE clinic_staff DROP CONSTRAINT IF EXISTS chk_staff_code_format;
ALTER TABLE clinic_staff ADD CONSTRAINT chk_staff_code_format CHECK (staff_code ~ '^CI[0-9]+$');

ALTER TABLE employee_registrations DROP COLUMN IF EXISTS position;
ALTER TABLE employee_registrations DROP COLUMN IF EXISTS department;
