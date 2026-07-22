-- Migration 0003: Patients & Attachments
-- Depends on: employee_registrations (0001).
-- Maps to Entity Dictionary section 2 (patients), section 9 (attachments).

-- +migrate Up

CREATE TABLE patients (
    id                                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_code                      TEXT NOT NULL UNIQUE,
    full_name                         TEXT NOT NULL,
    date_of_birth                     DATE,
    gender                            TEXT,
    location                          TEXT,
    address                           TEXT,
    phone                             TEXT,
    -- Nullable: only set when this patient originated as a hired
    -- employee_registrations candidate. NULL means a direct/walk-in
    -- registration. This is the R -> S lifecycle link agreed on Day 1:
    -- hiring creates a NEW patient row and permanently links back to the
    -- original registration, rather than converting/overwriting it.
    source_employee_registration_id  INTEGER REFERENCES employee_registrations(id),
    registered_date                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active                         BOOLEAN NOT NULL DEFAULT true,
    created_at                        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_patients_code_format CHECK (patient_code ~ '^S[0-9]+$')
);

CREATE INDEX idx_patients_source_employee_registration_id
    ON patients(source_employee_registration_id);

CREATE TABLE attachments (
    id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- owner_table + owner_id is a "polymorphic" reference: this one table
    -- stores photos for three different parent tables (patients,
    -- physicians, employee_registrations), so it can't use a normal single
    -- foreign key. The CHECK constraint below is the trade-off: it can't
    -- guarantee owner_id actually exists (a real FK would), but it at
    -- least rejects garbage/typo values in owner_table.
    owner_table  TEXT NOT NULL,
    owner_id     INTEGER NOT NULL,
    file_name    TEXT,
    content_type TEXT,
    file_path    TEXT,
    uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_attachments_owner_table
        CHECK (owner_table IN ('patients', 'physicians', 'employee_registrations'))
);

CREATE INDEX idx_attachments_owner ON attachments(owner_table, owner_id);

-- +migrate Down

DROP TABLE IF EXISTS attachments;
DROP TABLE IF EXISTS patients;
