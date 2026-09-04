-- +migrate Up

CREATE TABLE database_backups (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  filename text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  notes text DEFAULT ''
);

-- +migrate Down

DROP TABLE IF EXISTS database_backups;
