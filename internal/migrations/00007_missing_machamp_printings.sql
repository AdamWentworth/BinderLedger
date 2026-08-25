-- +goose Up
DELETE FROM catalog_cards
WHERE id = 'pokemon-base-set-charizard-black-dot-error-holo-rare';

ALTER TABLE catalog_valuation_references
    ALTER COLUMN amount DROP NOT NULL;

-- Keep the schema independently bootstrappable. The normal importer replaces
-- this minimal metadata from the configured catalog provider.
INSERT INTO catalog_sets (id, game, name, provider, source_file)
VALUES
    (
        'base-set-shadowless-pokemon',
        'Pokemon',
        'Base Set Shadowless',
        'curated',
        'migration'
    ),
    (
        'base-set-pokemon',
        'Pokemon',
        'Base Set',
        'curated',
        'migration'
    )
ON CONFLICT (id) DO NOTHING;

-- These two Machamp printings are absent from the primary catalog feed and
-- remain distinct market records.
INSERT INTO catalog_cards (
    id,
    set_id,
    tcgplayer_product_id,
    name,
    number,
    number_sort,
    rarity,
    image_url
)
VALUES
    (
        'pokemon-base-set-shadowless-machamp-holo-rare',
        'base-set-shadowless-pokemon',
        107004,
        'Machamp',
        '008/102',
        8,
        'Holo Rare',
        NULL
    ),
    (
        'pokemon-base-set-machamp-first-edition-holo-rare',
        'base-set-pokemon',
        42425,
        'Machamp',
        '008/102',
        8,
        'Holo Rare',
        NULL
    )
ON CONFLICT (id) DO UPDATE SET
    set_id = EXCLUDED.set_id,
    tcgplayer_product_id = EXCLUDED.tcgplayer_product_id,
    name = EXCLUDED.name,
    number = EXCLUDED.number,
    number_sort = EXCLUDED.number_sort,
    rarity = EXCLUDED.rarity,
    image_url = COALESCE(catalog_cards.image_url, EXCLUDED.image_url),
    imported_at = now();

INSERT INTO catalog_card_variants (
    id,
    card_id,
    printing,
    condition,
    edition,
    finish,
    language,
    current_price
)
SELECT
    'curated-' || card.tcgplayer_product_id || '-first-edition-holofoil-' || condition_code,
    card.id,
    '1st Edition Holofoil',
    condition,
    'First Edition',
    'Holofoil',
    'English',
    NULL
FROM (VALUES
    ('near-mint', 'Near Mint'),
    ('lightly-played', 'Lightly Played'),
    ('moderately-played', 'Moderately Played'),
    ('heavily-played', 'Heavily Played'),
    ('damaged', 'Damaged')
) conditions(condition_code, condition)
CROSS JOIN (VALUES
    ('pokemon-base-set-shadowless-machamp-holo-rare', 107004),
    ('pokemon-base-set-machamp-first-edition-holo-rare', 42425)
) card(id, tcgplayer_product_id)
ON CONFLICT (id) DO UPDATE SET
    card_id = EXCLUDED.card_id,
    printing = EXCLUDED.printing,
    condition = EXCLUDED.condition,
    edition = EXCLUDED.edition,
    finish = EXCLUDED.finish,
    language = EXCLUDED.language,
    imported_at = now();

SELECT refresh_catalog_price_quality();

-- +goose Down
DELETE FROM catalog_cards
WHERE id IN (
    'pokemon-base-set-shadowless-machamp-holo-rare',
    'pokemon-base-set-machamp-first-edition-holo-rare'
);

ALTER TABLE catalog_valuation_references
    ALTER COLUMN amount SET NOT NULL;

SELECT refresh_catalog_price_quality();
