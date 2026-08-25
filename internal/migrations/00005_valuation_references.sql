-- +goose Up
CREATE TABLE catalog_valuation_references (
    id text PRIMARY KEY,
    tcgplayer_product_id bigint NOT NULL,
    edition text NOT NULL,
    finish text NOT NULL,
    language text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('ungraded', 'graded')),
    label text NOT NULL,
    grader text,
    grade text,
    amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
    currency text NOT NULL DEFAULT 'USD',
    source_name text NOT NULL,
    source_url text NOT NULL,
    checked_on date NOT NULL,
    note text,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (
        tcgplayer_product_id,
        edition,
        finish,
        language,
        source_name,
        kind,
        label
    )
);

CREATE INDEX catalog_valuation_references_printing_idx
    ON catalog_valuation_references (
        tcgplayer_product_id,
        edition,
        finish,
        language,
        kind,
        sort_order
    );

-- Reference values are private operational data and are loaded separately.

-- +goose Down
DROP TABLE catalog_valuation_references;
