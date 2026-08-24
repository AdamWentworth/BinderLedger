-- +goose Up
ALTER TABLE catalog_sets
    ADD COLUMN display_order integer NOT NULL DEFAULT 100;

INSERT INTO catalog_sets (
    id,
    game,
    name,
    release_date,
    declared_card_count,
    provider,
    source_file,
    source_collected_at,
    logo_url,
    symbol_url,
    display_order,
    imported_at
)
SELECT
    'base-set-first-edition-pokemon',
    game,
    'Base Set First Edition',
    release_date,
    declared_card_count,
    provider,
    source_file,
    source_collected_at,
    logo_url,
    symbol_url,
    10,
    now()
FROM catalog_sets
WHERE id = 'base-set-shadowless-pokemon'
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    release_date = EXCLUDED.release_date,
    declared_card_count = EXCLUDED.declared_card_count,
    provider = EXCLUDED.provider,
    source_file = EXCLUDED.source_file,
    source_collected_at = EXCLUDED.source_collected_at,
    logo_url = EXCLUDED.logo_url,
    symbol_url = EXCLUDED.symbol_url,
    display_order = EXCLUDED.display_order,
    imported_at = now();

UPDATE catalog_sets
SET name = 'Base Set Shadowless', display_order = 20
WHERE id = 'base-set-shadowless-pokemon';

UPDATE catalog_sets
SET display_order = 30
WHERE id = 'base-set-pokemon';

INSERT INTO catalog_cards (
    id,
    uuid,
    set_id,
    tcgplayer_product_id,
    name,
    number,
    number_sort,
    rarity,
    image_url,
    imported_at
)
SELECT
    replace(
        card.id,
        'pokemon-base-set-shadowless-',
        'pokemon-base-set-first-edition-'
    ),
    NULL,
    'base-set-first-edition-pokemon',
    card.tcgplayer_product_id,
    card.name,
    card.number,
    card.number_sort,
    card.rarity,
    card.image_url,
    now()
FROM catalog_cards card
WHERE card.set_id = 'base-set-shadowless-pokemon'
  AND card.id <> 'pokemon-base-set-shadowless-machamp-holo-rare'
  AND EXISTS (
      SELECT 1
      FROM catalog_card_variants variant
      WHERE variant.card_id = card.id
        AND variant.edition = 'First Edition'
  )
ON CONFLICT (id) DO UPDATE SET
    set_id = EXCLUDED.set_id,
    tcgplayer_product_id = EXCLUDED.tcgplayer_product_id,
    name = EXCLUDED.name,
    number = EXCLUDED.number,
    number_sort = EXCLUDED.number_sort,
    rarity = EXCLUDED.rarity,
    image_url = EXCLUDED.image_url,
    imported_at = now();

UPDATE catalog_card_variants variant
SET card_id = replace(
    source_card.id,
    'pokemon-base-set-shadowless-',
    'pokemon-base-set-first-edition-'
)
FROM catalog_cards source_card
WHERE variant.card_id = source_card.id
  AND source_card.set_id = 'base-set-shadowless-pokemon'
  AND source_card.id <> 'pokemon-base-set-shadowless-machamp-holo-rare'
  AND variant.edition = 'First Edition';

UPDATE catalog_cards
SET set_id = 'base-set-first-edition-pokemon', imported_at = now()
WHERE id = 'pokemon-base-set-shadowless-machamp-holo-rare';

UPDATE catalog_card_variants variant
SET edition = 'Shadowless', imported_at = now()
FROM catalog_cards card
WHERE variant.card_id = card.id
  AND card.set_id = 'base-set-shadowless-pokemon'
  AND variant.edition = 'Unlimited';

SELECT refresh_catalog_price_quality();

-- +goose Down
UPDATE catalog_card_variants
SET card_id = replace(
    card_id,
    'pokemon-base-set-first-edition-',
    'pokemon-base-set-shadowless-'
)
WHERE card_id IN (
    SELECT id
    FROM catalog_cards
    WHERE set_id = 'base-set-first-edition-pokemon'
      AND id <> 'pokemon-base-set-shadowless-machamp-holo-rare'
);

UPDATE catalog_cards
SET set_id = 'base-set-shadowless-pokemon', imported_at = now()
WHERE id = 'pokemon-base-set-shadowless-machamp-holo-rare';

UPDATE catalog_card_variants variant
SET edition = 'Unlimited', imported_at = now()
FROM catalog_cards card
WHERE variant.card_id = card.id
  AND card.set_id = 'base-set-shadowless-pokemon'
  AND variant.edition = 'Shadowless';

DELETE FROM catalog_sets
WHERE id = 'base-set-first-edition-pokemon';

UPDATE catalog_sets
SET name = 'Base Set (Shadowless)'
WHERE id = 'base-set-shadowless-pokemon';

ALTER TABLE catalog_sets
    DROP COLUMN display_order;

SELECT refresh_catalog_price_quality();
