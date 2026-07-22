-- Migration 0005: Clinical Encounter (Visits & Vitals)
-- Depends on: patients (0003), physicians (0001), users (0002).
-- Maps to Entity Dictionary section 4.
--
-- "visits" is the most structurally important table in the whole schema —
-- it's the central record everything else (labs, prescriptions, referrals,
-- sick leave, admissions) attaches to. See the roadmap's explanation of
-- why a visit-centered design was chosen over the old system's disconnected
-- tables.

-- +migrate Up

CREATE TABLE visits (
    id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id         INTEGER NOT NULL REFERENCES patients(id),
    physician_id       INTEGER NOT NULL REFERENCES physicians(id),
    visit_date         TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- This status column is a state machine: a visit moves through these
    -- states in order, and the application layer (not this migration) is
    -- responsible for rejecting illegal jumps, e.g. going straight from
    -- 'open' to 'closed' without an examination ever being recorded.
    status             TEXT NOT NULL DEFAULT 'open',
    chief_complaint    TEXT,
    examination_notes  TEXT,
    diagnosis          TEXT,
    -- Nullable until the visit closes.
    disposition        TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_visits_status
        CHECK (status IN ('open', 'examined', 'awaiting_lab', 'lab_completed', 'diagnosed', 'closed')),
    CONSTRAINT chk_visits_disposition
        CHECK (disposition IS NULL OR disposition IN ('discharged', 'admitted', 'referred'))
);

CREATE INDEX idx_visits_patient_id ON visits(patient_id);
CREATE INDEX idx_visits_physician_id ON visits(physician_id);
CREATE INDEX idx_visits_visit_date ON visits(visit_date);

CREATE TABLE vitals (
    id                       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    visit_id                 INTEGER NOT NULL REFERENCES visits(id),
    recorded_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by              INTEGER REFERENCES users(id),
    temperature_c            NUMERIC(4,1),
    blood_pressure_systolic  INTEGER,
    blood_pressure_diastolic INTEGER,
    pulse_rate               INTEGER,
    respiratory_rate         INTEGER,
    weight_kg                NUMERIC(5,2),
    height_cm                NUMERIC(5,1)
);
COMMENT ON TABLE vitals IS 'One-to-many with visits on purpose: a reading might be taken at intake and re-checked later in the same visit.';

CREATE INDEX idx_vitals_visit_id ON vitals(visit_id);

-- +migrate Down

DROP TABLE IF EXISTS vitals;
DROP TABLE IF EXISTS visits;
