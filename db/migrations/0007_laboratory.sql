-- Migration 0007: Laboratory
-- Depends on: visits (0005), physicians (0001), lab_test_catalog (0001), users (0002).
-- Maps to Entity Dictionary section 6.

-- +migrate Up

CREATE TABLE lab_orders (
    id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    visit_id      INTEGER NOT NULL REFERENCES visits(id),
    physician_id  INTEGER REFERENCES physicians(id),
    order_date    TIMESTAMPTZ NOT NULL DEFAULT now(),
    status        TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT chk_lab_orders_status
        CHECK (status IN ('pending', 'in_progress', 'completed'))
);
COMMENT ON TABLE lab_orders IS 'The status column is what gives the lab technician a real work queue on Day 6 — the old Access system had no such concept, just a flat table mixing "ordered" and "resulted" together.';

CREATE INDEX idx_lab_orders_visit_id ON lab_orders(visit_id);
-- Speeds up exactly the query the lab tech's queue screen will run:
-- "show me everything still pending or in progress".
CREATE INDEX idx_lab_orders_status ON lab_orders(status) WHERE status != 'completed';

CREATE TABLE lab_order_items (
    id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lab_order_id  INTEGER NOT NULL REFERENCES lab_orders(id),
    test_id       INTEGER NOT NULL REFERENCES lab_test_catalog(id),
    result_value  TEXT,
    entered_by    INTEGER REFERENCES users(id),
    entered_at    TIMESTAMPTZ
);

CREATE INDEX idx_lab_order_items_lab_order_id ON lab_order_items(lab_order_id);
CREATE INDEX idx_lab_order_items_test_id ON lab_order_items(test_id);

-- +migrate Down

DROP TABLE IF EXISTS lab_order_items;
DROP TABLE IF EXISTS lab_orders;
