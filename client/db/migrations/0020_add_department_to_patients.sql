-- Migration 0020: Add Department and Position to Patients
-- Allows assigning and filtering patients by department and position.

-- +migrate Up

ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS department TEXT;

ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS position TEXT;

-- +migrate Down

ALTER TABLE patients DROP COLUMN IF EXISTS position;
ALTER TABLE patients DROP COLUMN IF EXISTS department;
