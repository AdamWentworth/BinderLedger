-- +goose Up
ALTER TABLE catalog_sets
    ADD COLUMN logo_url text,
    ADD COLUMN symbol_url text;

ALTER TABLE catalog_card_variants
    ADD COLUMN edition text NOT NULL DEFAULT 'Unlimited',
    ADD COLUMN finish text NOT NULL DEFAULT 'Normal';

UPDATE catalog_card_variants
SET
    edition = CASE
        WHEN lower(printing) LIKE '%1st edition%' OR lower(printing) LIKE '%first edition%'
            THEN 'First Edition'
        ELSE 'Unlimited'
    END,
    finish = CASE
        WHEN lower(printing) LIKE '%reverse holo%'
            THEN 'Reverse Holofoil'
        WHEN lower(printing) LIKE '%holo%'
            THEN 'Holofoil'
        ELSE 'Normal'
    END;

UPDATE catalog_sets
SET
    logo_url = 'https://images.pokemontcg.io/base1/logo.png',
    symbol_url = 'https://images.pokemontcg.io/base1/symbol.png'
WHERE id IN ('base-set-pokemon', 'base-set-shadowless-pokemon');

UPDATE catalog_sets
SET
    logo_url = 'https://images.pokemontcg.io/base2/logo.png',
    symbol_url = 'https://images.pokemontcg.io/base2/symbol.png'
WHERE id = 'jungle-pokemon';

CREATE INDEX catalog_card_variants_set_pricing_idx
    ON catalog_card_variants (card_id, edition, condition, finish);

-- +goose Down
DROP INDEX catalog_card_variants_set_pricing_idx;

ALTER TABLE catalog_card_variants
    DROP COLUMN finish,
    DROP COLUMN edition;

ALTER TABLE catalog_sets
    DROP COLUMN symbol_url,
    DROP COLUMN logo_url;
