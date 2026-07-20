-- +migrate Up

CREATE TABLE drug_stock (
    id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    drug_id            INTEGER NOT NULL UNIQUE REFERENCES drugs(id),
    quantity_on_hand   NUMERIC(10,2) NOT NULL DEFAULT 0,
    reorder_threshold  NUMERIC(10,2),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_drug_stock_non_negative CHECK (quantity_on_hand >= 0)
);

CREATE TABLE prescriptions (
    id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    visit_id         INTEGER NOT NULL REFERENCES visits(id),
    patient_id       INTEGER REFERENCES patients(id),
    physician_id     INTEGER REFERENCES physicians(id),
    prescribed_date  TIMESTAMPTZ NOT NULL DEFAULT now(),
    diagnosis_note   TEXT
);

CREATE INDEX idx_prescriptions_visit_id ON prescriptions(visit_id);
CREATE INDEX idx_prescriptions_patient_id ON prescriptions(patient_id);

CREATE TABLE prescription_items (
    id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    prescription_id       INTEGER NOT NULL REFERENCES prescriptions(id),
    drug_id               INTEGER NOT NULL REFERENCES drugs(id),
    dosage                TEXT,
    frequency             TEXT,
    duration              TEXT,
    quantity_prescribed   NUMERIC(10,2) NOT NULL,
    instructions          TEXT,

    CONSTRAINT chk_prescription_items_quantity_positive CHECK (quantity_prescribed > 0)
);

CREATE INDEX idx_prescription_items_prescription_id ON prescription_items(prescription_id);
CREATE INDEX idx_prescription_items_drug_id ON prescription_items(drug_id);

CREATE TABLE dispensing_records (
    id                     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    prescription_item_id   INTEGER NOT NULL REFERENCES prescription_items(id),
    quantity_dispensed     NUMERIC(10,2) NOT NULL,
    dispensed_by           INTEGER REFERENCES users(id),
    dispensed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes                  TEXT,

    CONSTRAINT chk_dispensing_records_quantity_positive CHECK (quantity_dispensed > 0)
);

CREATE INDEX idx_dispensing_records_prescription_item_id ON dispensing_records(prescription_item_id);

-- +migrate Down

DROP TABLE IF EXISTS dispensing_records;
DROP TABLE IF EXISTS prescription_items;
DROP TABLE IF EXISTS prescriptions;
DROP TABLE IF EXISTS drug_stock;
