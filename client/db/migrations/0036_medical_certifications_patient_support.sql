-- Migration 0036: Add patient_id support to medical_certifications and make employee_registration_id nullable

-- +migrate Up
ALTER TABLE medical_certifications ADD COLUMN IF NOT EXISTS patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE medical_certifications ALTER COLUMN employee_registration_id DROP NOT NULL;

-- Index on patient_id for fast lookup
CREATE INDEX IF NOT EXISTS idx_medical_certifications_patient_id ON medical_certifications(patient_id);

-- Backfill patient_id for existing medical_certifications where matching patient exists
UPDATE medical_certifications c
SET patient_id = p.id
FROM patients p
WHERE p.source_employee_registration_id = c.employee_registration_id
  AND c.patient_id IS NULL;

-- +migrate Down
ALTER TABLE medical_certifications DROP COLUMN IF EXISTS patient_id;
