-- Migration 0026: Periodic 6-Month Medical Fitness Checkups and Renewals

-- +migrate Up

ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_fitness_exam_date DATE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS next_checkup_due_date DATE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS fitness_status VARCHAR(50) DEFAULT 'fit';

ALTER TABLE visits ADD COLUMN IF NOT EXISTS visit_type VARCHAR(50) DEFAULT 'regular';

ALTER TABLE medical_certifications ADD COLUMN IF NOT EXISTS certification_type VARCHAR(50) DEFAULT 'pre_employment';
ALTER TABLE medical_certifications ADD COLUMN IF NOT EXISTS approved_by_hr BOOLEAN DEFAULT true;

-- Backfill initial last_fitness_exam_date for existing patients based on registered_date or certifications
UPDATE patients 
SET last_fitness_exam_date = COALESCE(last_fitness_exam_date, registered_date::date, CURRENT_DATE),
    next_checkup_due_date = COALESCE(next_checkup_due_date, (COALESCE(registered_date::date, CURRENT_DATE) + INTERVAL '6 months')::date)
WHERE last_fitness_exam_date IS NULL;

-- +migrate Down

-- No rollback
