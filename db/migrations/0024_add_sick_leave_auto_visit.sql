-- Migration 0024: Add auto_visit tracking to sick_leaves table
-- +migrate Up

ALTER TABLE sick_leaves
    ADD COLUMN IF NOT EXISTS auto_visit_created_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS auto_visit_id INT REFERENCES visits(id) ON DELETE SET NULL;

-- +migrate Down

ALTER TABLE sick_leaves
    DROP COLUMN IF EXISTS auto_visit_id,
    DROP COLUMN IF EXISTS auto_visit_created_at;
