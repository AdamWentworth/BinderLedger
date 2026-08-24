-- +goose Up
ALTER TABLE card_scan_sessions
    ADD COLUMN purpose text NOT NULL DEFAULT 'identify'
        CHECK (purpose IN ('identify', 'condition')),
    ADD COLUMN recognizer_version text,
    ADD COLUMN failure_reason text,
    ADD COLUMN processing_started_at timestamptz,
    ADD COLUMN completed_at timestamptz;

CREATE INDEX card_scan_sessions_pending_idx
    ON card_scan_sessions (created_at)
    WHERE status = 'captured';

CREATE TABLE card_scan_candidates (
    scan_session_id text NOT NULL REFERENCES card_scan_sessions(id) ON DELETE CASCADE,
    rank smallint NOT NULL CHECK (rank BETWEEN 1 AND 3),
    card_id text NOT NULL,
    edition text NOT NULL,
    finish text NOT NULL,
    language text NOT NULL,
    score numeric(6, 5) NOT NULL CHECK (score BETWEEN 0 AND 1),
    signals jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (scan_session_id, rank),
    FOREIGN KEY (card_id, edition, finish, language)
        REFERENCES catalog_printing_images (card_id, edition, finish, language)
        ON DELETE RESTRICT
);

CREATE TABLE card_scan_confirmations (
    scan_session_id text PRIMARY KEY REFERENCES card_scan_sessions(id) ON DELETE CASCADE,
    decision text NOT NULL CHECK (decision IN ('confirmed', 'rejected')),
    candidate_rank smallint,
    card_id text REFERENCES catalog_cards(id) ON DELETE RESTRICT,
    edition text,
    finish text,
    language text,
    confirmed_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (scan_session_id, candidate_rank)
        REFERENCES card_scan_candidates (scan_session_id, rank)
        ON DELETE RESTRICT,
    CHECK (
        (decision = 'confirmed'
            AND candidate_rank IS NOT NULL
            AND card_id IS NOT NULL
            AND edition IS NOT NULL
            AND finish IS NOT NULL
            AND language IS NOT NULL)
        OR
        (decision = 'rejected'
            AND candidate_rank IS NULL
            AND card_id IS NULL
            AND edition IS NULL
            AND finish IS NULL
            AND language IS NULL)
    )
);

-- +goose Down
DROP TABLE card_scan_confirmations;
DROP TABLE card_scan_candidates;
DROP INDEX card_scan_sessions_pending_idx;
ALTER TABLE card_scan_sessions
    DROP COLUMN completed_at,
    DROP COLUMN processing_started_at,
    DROP COLUMN failure_reason,
    DROP COLUMN recognizer_version,
    DROP COLUMN purpose;
