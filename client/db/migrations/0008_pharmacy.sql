-- Migration 0008: Pharmacy
-- Depends on: drugs (0001), visits (0005), patients (0003), physicians (0001), users (0002).
-- Maps to Entity Dictionary section 7.
--
-- Entirely new — nothing like this exists in the old Access system.

-- +migrate Up

CREATE TABLE drug_stock (
    id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    drug_id            INTEGER NOT NULL UNIQUE REFERENCES drugs(id),
    quantity_on_hand   NUMERIC(10,2) NOT NULL DEFAULT 0,
    reorder_threshold  NUMERIC(10,2),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- This is the database-level backstop for "stock must never go
    -- negative". The application layer should also check this before
    -- attempting a dispense (so the user gets a clean error message
    -- instead of a raw database failure), but this CHECK is what makes
    -- it actually impossible, even if application logic has a bug.
    CONSTRAINT chk_drug_stock_non_negative CHECK (quantity_on_hand >= 0)
);
COMMENT ON TABLE drug_stock IS 'Simple running-quantity model — no batch/lot or expiry-date tracking in this version, per the Day 1 working assumption (flagged for confirmation before this module is built on Day 7).';

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
COMMENT ON TABLE prescription_items IS 'This structured, itemized list is what replaces the old system''s single 255-character free-text Rx field. It is what makes dispensing against real stock possible at all: you cannot decrement stock for "whatever is written in a paragraph".';

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
COMMENT ON TABLE dispensing_records IS 'Supports partial dispensing — a patient may not collect a full course in one pharmacy visit. NOTE: the rule "total dispensed for one item can never exceed quantity_prescribed" spans MULTIPLE rows (a sum across all dispensing_records for one prescription_item), which a single-row CHECK constraint cannot express. That rule has to be enforced either in the application layer or with a database trigger — it is intentionally NOT a CHECK constraint here, and this is flagged as a real to-do for Day 7, not an oversight.';

CREATE INDEX idx_dispensing_records_prescription_item_id ON dispensing_records(prescription_item_id);

-- +migrate Down

DROP TABLE IF EXISTS dispensing_records;
DROP TABLE IF EXISTS prescription_items;
DROP TABLE IF EXISTS prescriptions;
DROP TABLE IF EXISTS drug_stock;
