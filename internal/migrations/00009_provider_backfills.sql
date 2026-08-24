-- +goose Up
ALTER TABLE price_observations
    ADD COLUMN source_provider text NOT NULL DEFAULT 'JustTCG',
    ADD COLUMN low_price numeric(12, 2),
    ADD COLUMN high_price numeric(12, 2),
    ADD COLUMN sale_count integer,
    ADD CONSTRAINT price_observations_low_nonnegative
        CHECK (low_price IS NULL OR low_price >= 0),
    ADD CONSTRAINT price_observations_high_nonnegative
        CHECK (high_price IS NULL OR high_price >= 0),
    ADD CONSTRAINT price_observations_sale_count_nonnegative
        CHECK (sale_count IS NULL OR sale_count >= 0);

UPDATE price_observations
SET source_provider = 'PokemonPriceTracker'
WHERE (
        variant_id LIKE 'curated-107004-first-edition-holofoil-%'
        OR variant_id LIKE 'curated-42425-first-edition-holofoil-%'
    )
  AND observed_on IN (DATE '2026-08-22', DATE '2026-08-23');

CREATE TABLE provider_api_usage (
    provider text NOT NULL,
    usage_on date NOT NULL,
    requests integer NOT NULL DEFAULT 0,
    credits integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, usage_on),
    CONSTRAINT provider_api_usage_requests_nonnegative CHECK (requests >= 0),
    CONSTRAINT provider_api_usage_credits_nonnegative CHECK (credits >= 0)
);

CREATE TABLE provider_backfill_progress (
    provider text NOT NULL,
    target_key text NOT NULL,
    sort_order integer NOT NULL,
    provider_card_id bigint NOT NULL,
    tcgplayer_product_id bigint NOT NULL,
    variant_id text NOT NULL REFERENCES catalog_card_variants(id) ON DELETE CASCADE,
    condition text NOT NULL,
    printing text NOT NULL,
    page_size integer NOT NULL,
    next_page integer NOT NULL DEFAULT 1,
    completed boolean NOT NULL DEFAULT false,
    completed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, target_key),
    CONSTRAINT provider_backfill_page_size_positive CHECK (page_size > 0),
    CONSTRAINT provider_backfill_next_page_positive CHECK (next_page > 0)
);

-- +goose Down
DROP TABLE provider_backfill_progress;
DROP TABLE provider_api_usage;

ALTER TABLE price_observations
    DROP CONSTRAINT price_observations_sale_count_nonnegative,
    DROP CONSTRAINT price_observations_high_nonnegative,
    DROP CONSTRAINT price_observations_low_nonnegative,
    DROP COLUMN sale_count,
    DROP COLUMN high_price,
    DROP COLUMN low_price,
    DROP COLUMN source_provider;
