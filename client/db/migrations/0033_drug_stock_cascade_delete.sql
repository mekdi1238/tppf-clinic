-- +migrate Up
-- Allow cascading delete from drugs to drug_stock
ALTER TABLE drug_stock DROP CONSTRAINT IF EXISTS drug_stock_drug_id_fkey;
ALTER TABLE drug_stock ADD CONSTRAINT drug_stock_drug_id_fkey FOREIGN KEY (drug_id) REFERENCES drugs(id) ON DELETE CASCADE;

-- +migrate Down
ALTER TABLE drug_stock DROP CONSTRAINT IF EXISTS drug_stock_drug_id_fkey;
ALTER TABLE drug_stock ADD CONSTRAINT drug_stock_drug_id_fkey FOREIGN KEY (drug_id) REFERENCES drugs(id);
