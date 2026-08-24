-- +goose Up
CREATE TABLE card_scan_sessions (
    id text PRIMARY KEY,
    status text NOT NULL DEFAULT 'captured'
        CHECK (status IN ('captured', 'processing', 'complete', 'failed')),
    client_platform text NOT NULL DEFAULT 'unknown'
        CHECK (client_platform IN ('android', 'ios', 'web', 'unknown')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE card_scan_images (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scan_session_id text NOT NULL REFERENCES card_scan_sessions(id) ON DELETE CASCADE,
    side text NOT NULL CHECK (side IN ('front', 'back')),
    storage_key text NOT NULL UNIQUE,
    mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png')),
    byte_size bigint NOT NULL CHECK (byte_size > 0),
    width integer NOT NULL CHECK (width > 0),
    height integer NOT NULL CHECK (height > 0),
    sha256 text NOT NULL CHECK (length(sha256) = 64),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (scan_session_id, side)
);

CREATE INDEX card_scan_sessions_created_at_idx
    ON card_scan_sessions (created_at DESC);

-- +goose Down
DROP TABLE card_scan_images;
DROP TABLE card_scan_sessions;
