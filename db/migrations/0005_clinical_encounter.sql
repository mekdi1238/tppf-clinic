-- +migrate Up

CREATE TABLE visits (
    id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id         INTEGER NOT NULL REFERENCES patients(id),
    physician_id       INTEGER NOT NULL REFERENCES physicians(id),
    visit_date         TIMESTAMPTZ NOT NULL DEFAULT now(),
    status             TEXT NOT NULL DEFAULT 'open',
    chief_complaint    TEXT,
    examination_notes  TEXT,
    diagnosis          TEXT,
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

CREATE INDEX idx_vitals_visit_id ON vitals(visit_id);

-- +migrate Down

DROP TABLE IF EXISTS vitals;
DROP TABLE IF EXISTS visits;
