-- Migration 0001: Foundation tables
-- These five tables reference nothing else in the schema, so they have to
-- exist before anything that has a foreign key pointing at them.
-- Maps to Entity Dictionary sections: 1 (roles), 2 (physicians,
-- employee_registrations), 6 (lab_test_catalog), 7 (drugs).

-- +migrate Up

-- Every PK in this schema uses GENERATED ALWAYS AS IDENTITY rather than the
-- older SERIAL type. Functionally similar (auto-incrementing integer), but
-- IDENTITY is the modern SQL-standard way to do it and avoids some
-- historical quirks SERIAL has around sequence ownership. Worth knowing:
-- SERIAL is still extremely common in older tutorials, so don't be
-- surprised to see it elsewhere.

CREATE TABLE roles (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT
);
COMMENT ON TABLE roles IS 'Fixed-ish set of permission roles (Receptionist, Physician, Lab Technician, Pharmacist, HR/Admin, System Administrator). Deliberately no CHECK constraint on name — roles are data, not hardcoded, so adding one later is an INSERT, not a migration.';

CREATE TABLE physicians (
    id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name      TEXT NOT NULL,
    gender         TEXT,
    date_recruited DATE,
    license_no     TEXT,
    qualification  TEXT,
    is_active      BOOLEAN NOT NULL DEFAULT true
);
COMMENT ON COLUMN physicians.is_active IS 'Deactivate, never delete — historical visits still need to reference this physician.';

CREATE TABLE employee_registrations (
    id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    registration_code TEXT NOT NULL UNIQUE,
    full_name         TEXT NOT NULL,
    date_of_birth     DATE,
    gender            TEXT,
    location          TEXT,
    occupation        TEXT,
    registration_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    status            TEXT NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_employee_registrations_status
        CHECK (status IN ('pending', 'certified_fit', 'certified_unfit', 'hired', 'withdrawn')),
    -- Enforces the R0xx format at the database level, not just in the app.
    -- Belt-and-braces: even if application code has a bug, the database
    -- itself refuses a badly formatted code.
    CONSTRAINT chk_employee_registrations_code_format
        CHECK (registration_code ~ '^R[0-9]+$')
);

CREATE TABLE lab_test_catalog (
    id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code         TEXT NOT NULL UNIQUE,
    panel        TEXT,
    display_name TEXT
);
COMMENT ON TABLE lab_test_catalog IS 'Replaces the old Access system''s ~65 fixed test columns with real rows. Adding a new lab test later is an INSERT here, not a schema change.';

CREATE TABLE drugs (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT NOT NULL,
    unit        TEXT,
    description TEXT
);

-- +migrate Down

DROP TABLE IF EXISTS drugs;
DROP TABLE IF EXISTS lab_test_catalog;
DROP TABLE IF EXISTS employee_registrations;
DROP TABLE IF EXISTS physicians;
DROP TABLE IF EXISTS roles;
