-- +migrate Up

CREATE SEQUENCE patient_code_seq START 1;
CREATE SEQUENCE registration_code_seq START 1;

-- +migrate Down

DROP SEQUENCE IF EXISTS registration_code_seq;
DROP SEQUENCE IF EXISTS patient_code_seq;
