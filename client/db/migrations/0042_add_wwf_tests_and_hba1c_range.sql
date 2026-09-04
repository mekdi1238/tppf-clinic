-- Migration 0042: Add WWF (Widal & Weil-Felix) tests and HbA1c reference range
-- +migrate Up

-- 1. Update HbA1c normal range
UPDATE lab_test_catalog
SET normal_range = '5.7 - 6.4%'
WHERE code = 'HBA1C';

-- 2. Insert WWF tests (SO, SH, Ox19)
INSERT INTO lab_test_catalog (code, panel, display_name, normal_range, sort_order) VALUES
  ('SO',   'Hematology', 'SO (Salmonella ''O'' Antigen)',    NULL, 140),
  ('SH',   'Hematology', 'SH (Salmonella ''H'' Antigen)',    NULL, 150),
  ('Ox19', 'Hematology', 'Ox19 (Proteus OX19 Antigen)',      NULL, 160)
ON CONFLICT (code) DO UPDATE SET
  panel = EXCLUDED.panel,
  display_name = EXCLUDED.display_name,
  normal_range = EXCLUDED.normal_range,
  sort_order = EXCLUDED.sort_order;

-- +migrate Down

UPDATE lab_test_catalog
SET normal_range = NULL
WHERE code = 'HBA1C';

DELETE FROM lab_test_catalog WHERE code IN ('SO', 'SH', 'Ox19');
