-- Migration 0028: Add hr_note to visits
-- Allows physicians to leave advice notes for the HR department

-- +migrate Up

ALTER TABLE visits ADD COLUMN IF NOT EXISTS hr_note TEXT;

-- +migrate Down

ALTER TABLE visits DROP COLUMN IF EXISTS hr_note;
