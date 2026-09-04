-- +migrate Up

ALTER TABLE roles ADD COLUMN display_name TEXT;
UPDATE roles SET display_name = name WHERE display_name IS NULL;
ALTER TABLE roles ALTER COLUMN display_name SET NOT NULL;

-- +migrate Down

ALTER TABLE roles DROP COLUMN display_name;
