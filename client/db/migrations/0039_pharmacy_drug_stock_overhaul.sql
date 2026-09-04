-- Migration 0039: Pharmacy Drug Stock Overhaul
-- Adds unique drug item codes (D001...), categories, batch numbers, max thresholds, and backfills existing drugs.

-- +migrate Up

-- 1. Create drug code sequence
CREATE SEQUENCE IF NOT EXISTS drug_code_seq START WITH 1;

-- 2. Add columns to drugs table
ALTER TABLE drugs ADD COLUMN IF NOT EXISTS drug_code TEXT UNIQUE;
ALTER TABLE drugs ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE drugs ADD COLUMN IF NOT EXISTS batch_no TEXT;
ALTER TABLE drugs ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- 3. Add max_threshold to drug_stock table
ALTER TABLE drug_stock ADD COLUMN IF NOT EXISTS max_threshold NUMERIC(10,2);

-- 4. Backfill drug_code for any existing drugs
DO $$
DECLARE
    d RECORD;
BEGIN
    FOR d IN SELECT id FROM drugs WHERE drug_code IS NULL ORDER BY id ASC LOOP
        UPDATE drugs
        SET drug_code = 'D' || lpad(nextval('drug_code_seq')::text, 3, '0')
        WHERE id = d.id;
    END LOOP;
END $$;

-- 5. Add index for fast drug_code lookup
CREATE INDEX IF NOT EXISTS idx_drugs_drug_code ON drugs(drug_code);
CREATE INDEX IF NOT EXISTS idx_drugs_category ON drugs(category);

-- +migrate Down
