-- +migrate Up

CREATE TABLE roles (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE physicians (
    id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name      TEXT NOT NULL,
    gender         TEXT,
    date_recruited DATE,
    license_no     TEXT,
    qualification  TEXT,
    is_active      BOOLEAN NOT NULL DEFAULT true
);

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
    CONSTRAINT chk_employee_registrations_code_format
        CHECK (registration_code ~ '^R[0-9]+$')
);

CREATE TABLE lab_test_catalog (
    id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code         TEXT NOT NULL UNIQUE,
    panel        TEXT,
    display_name TEXT
);

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
