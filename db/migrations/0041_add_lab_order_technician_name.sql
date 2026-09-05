-- Migration 0041: Add technician_name to lab_orders
-- +migrate Up

ALTER TABLE lab_orders
  ADD COLUMN IF NOT EXISTS technician_name TEXT;

-- +migrate Down

ALTER TABLE lab_orders
  DROP COLUMN IF EXISTS technician_name;
