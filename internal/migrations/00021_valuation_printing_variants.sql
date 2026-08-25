-- +goose Up
ALTER TABLE catalog_valuation_references
    ADD COLUMN printing_variant text NOT NULL DEFAULT '',
    ADD COLUMN is_primary boolean NOT NULL DEFAULT true,
    ADD CONSTRAINT catalog_valuation_references_variant_check
        CHECK (is_primary OR btrim(printing_variant) <> '');

ALTER TABLE catalog_valuation_references
    DROP CONSTRAINT catalog_valuation_references_tcgplayer_product_id_edition_f_key,
    ADD CONSTRAINT catalog_valuation_references_source_variant_key UNIQUE (
        tcgplayer_product_id,
        edition,
        finish,
        language,
        source_name,
        printing_variant,
        kind,
        label
    );

CREATE UNIQUE INDEX catalog_valuation_references_primary_ungraded_idx
    ON catalog_valuation_references (
        tcgplayer_product_id,
        edition,
        finish,
        language
    )
    WHERE kind = 'ungraded' AND is_primary;

-- Provider observations are private operational data and are loaded separately.

-- +goose Down
DELETE FROM catalog_valuation_observations observation
USING catalog_valuation_references reference
WHERE observation.valuation_reference_id = reference.id
  AND NOT reference.is_primary;

DELETE FROM catalog_valuation_references
WHERE NOT is_primary;

DROP INDEX catalog_valuation_references_primary_ungraded_idx;

ALTER TABLE catalog_valuation_references
    DROP CONSTRAINT catalog_valuation_references_source_variant_key,
    ADD CONSTRAINT catalog_valuation_references_tcgplayer_product_id_edition_f_key UNIQUE (
        tcgplayer_product_id,
        edition,
        finish,
        language,
        source_name,
        kind,
        label
    ),
    DROP CONSTRAINT catalog_valuation_references_variant_check,
    DROP COLUMN printing_variant,
    DROP COLUMN is_primary;

SELECT refresh_catalog_price_quality();
