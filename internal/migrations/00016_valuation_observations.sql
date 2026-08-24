-- +goose Up
CREATE TABLE catalog_valuation_observations (
    valuation_reference_id text NOT NULL
        REFERENCES catalog_valuation_references(id) ON DELETE CASCADE,
    observed_on date NOT NULL,
    amount numeric(12, 2) CHECK (amount IS NULL OR amount >= 0),
    currency text NOT NULL,
    collection_method text NOT NULL
        CHECK (collection_method IN ('seed', 'manual', 'api', 'import')),
    recorded_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (valuation_reference_id, observed_on)
);

CREATE INDEX catalog_valuation_observations_date_idx
    ON catalog_valuation_observations (observed_on DESC);

INSERT INTO catalog_valuation_observations (
    valuation_reference_id,
    observed_on,
    amount,
    currency,
    collection_method
)
SELECT
    reference.id,
    reference.checked_on,
    reference.amount,
    reference.currency,
    'seed'
FROM catalog_valuation_references reference
ON CONFLICT (valuation_reference_id, observed_on) DO NOTHING;

-- +goose Down
DROP TABLE catalog_valuation_observations;
