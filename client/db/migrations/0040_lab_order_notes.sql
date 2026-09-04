-- Migration 0040: Lab Order Notes
-- Adds a physician note (set when ordering) and a lab technician note
-- (set when entering results) to each lab order, so the two roles can
-- communicate the clinical context and findings of an order in detail.

-- +migrate Up

ALTER TABLE lab_orders
  ADD COLUMN IF NOT EXISTS physician_note   TEXT,
  ADD COLUMN IF NOT EXISTS technician_note  TEXT;

COMMENT ON COLUMN lab_orders.physician_note  IS 'Optional clinical context written by the ordering physician for the lab technician.';
COMMENT ON COLUMN lab_orders.technician_note IS 'Optional finding note written by the lab technician, visible to the physician in the visit record.';

-- +migrate Down

ALTER TABLE lab_orders
  DROP COLUMN IF EXISTS physician_note,
  DROP COLUMN IF EXISTS technician_note;
