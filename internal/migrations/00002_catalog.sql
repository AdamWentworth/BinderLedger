-- +goose Up
CREATE TABLE catalog_sets (
    id text PRIMARY KEY,
    game text NOT NULL,
    name text NOT NULL,
    release_date date,
    declared_card_count integer,
    provider text NOT NULL,
    source_file text NOT NULL,
    source_collected_at timestamptz,
    imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog_cards (
    id text PRIMARY KEY,
    uuid text,
    set_id text NOT NULL REFERENCES catalog_sets(id) ON DELETE CASCADE,
    tcgplayer_product_id bigint,
    name text NOT NULL,
    number text,
    number_sort integer,
    rarity text,
    image_url text,
    imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX catalog_cards_set_number_idx
    ON catalog_cards (set_id, number_sort, name);
CREATE INDEX catalog_cards_name_lower_idx
    ON catalog_cards ((lower(name)));

CREATE TABLE catalog_card_variants (
    id text PRIMARY KEY,
    uuid text,
    card_id text NOT NULL REFERENCES catalog_cards(id) ON DELETE CASCADE,
    tcgplayer_sku_id bigint,
    printing text NOT NULL,
    condition text NOT NULL,
    language text NOT NULL,
    current_price numeric(12, 2),
    price_change_24h numeric(12, 2),
    source_updated_at timestamptz,
    imported_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT catalog_card_variants_current_price_nonnegative
        CHECK (current_price IS NULL OR current_price >= 0)
);

CREATE INDEX catalog_card_variants_card_idx
    ON catalog_card_variants (card_id, printing, condition);

CREATE TABLE price_observations (
    variant_id text NOT NULL REFERENCES catalog_card_variants(id) ON DELETE CASCADE,
    observed_on date NOT NULL,
    price numeric(12, 2) NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (variant_id, observed_on),
    CONSTRAINT price_observations_price_nonnegative CHECK (price >= 0)
);

CREATE INDEX price_observations_date_idx
    ON price_observations (observed_on DESC);

-- +goose Down
DROP TABLE price_observations;
DROP TABLE catalog_card_variants;
DROP TABLE catalog_cards;
DROP TABLE catalog_sets;
