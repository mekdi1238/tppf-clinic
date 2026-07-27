-- +migrate Up

CREATE TABLE clinic_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  clinic_name text NOT NULL DEFAULT 'TPPF Clinic',
  clinic_tagline text DEFAULT '',
  clinic_address text DEFAULT '',
  clinic_phone text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

-- +migrate Down

DROP TABLE IF EXISTS clinic_settings;
