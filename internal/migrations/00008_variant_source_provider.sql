-- +goose Up
ALTER TABLE catalog_card_variants
    ADD COLUMN source_provider text NOT NULL DEFAULT 'JustTCG';

-- Provider observations are private operational data and are loaded separately.

-- +goose Down
ALTER TABLE catalog_card_variants
    DROP COLUMN source_provider;
