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

CREATE INDEX idx_lab_orders_visit_id ON lab_orders(visit_id);
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
