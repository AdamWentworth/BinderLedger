-- +goose Up
CREATE TABLE app_metadata (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_metadata (key, value)
VALUES ('schema', '{"version": 1}'::jsonb);

-- +goose Down
DROP TABLE app_metadata;
