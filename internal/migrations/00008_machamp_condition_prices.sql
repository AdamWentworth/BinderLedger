-- +goose Up
ALTER TABLE catalog_card_variants
    ADD COLUMN source_provider text NOT NULL DEFAULT 'JustTCG';

WITH prices(tcgplayer_product_id, condition_code, current_price) AS (VALUES
    (107004, 'near-mint', 85.77),
    (107004, 'lightly-played', 70.53),
    (107004, 'moderately-played', 42.96),
    (107004, 'heavily-played', 24.90),
    (107004, 'damaged', 15.88),
    (42425, 'near-mint', 24.79),
    (42425, 'lightly-played', 14.32),
    (42425, 'moderately-played', 9.22),
    (42425, 'heavily-played', 5.95),
    (42425, 'damaged', 3.52)
)
UPDATE catalog_card_variants variant
SET
    current_price = prices.current_price,
    source_provider = 'PokemonPriceTracker',
    source_updated_at = '2026-08-23T12:02:05.994Z',
    imported_at = now()
FROM prices
WHERE variant.id = 'curated-' || prices.tcgplayer_product_id
    || '-first-edition-holofoil-' || prices.condition_code;

WITH prices(tcgplayer_product_id, condition_code, current_price) AS (VALUES
    (107004, 'near-mint', 85.77),
    (107004, 'lightly-played', 70.53),
    (107004, 'moderately-played', 42.96),
    (107004, 'heavily-played', 24.90),
    (107004, 'damaged', 15.88),
    (42425, 'near-mint', 24.79),
    (42425, 'lightly-played', 14.32),
    (42425, 'moderately-played', 9.22),
    (42425, 'heavily-played', 5.95),
    (42425, 'damaged', 3.52)
), observations AS (
    SELECT
        'curated-' || tcgplayer_product_id || '-first-edition-holofoil-' || condition_code AS variant_id,
        observed_on,
        current_price
    FROM prices
    CROSS JOIN (VALUES (DATE '2026-08-22'), (DATE '2026-08-23')) dates(observed_on)
)
INSERT INTO price_observations (variant_id, observed_on, price)
SELECT variant_id, observed_on, current_price
FROM observations
ON CONFLICT (variant_id, observed_on) DO UPDATE SET
    price = EXCLUDED.price,
    imported_at = now();

SELECT refresh_catalog_price_quality();

-- +goose Down
DELETE FROM price_observations
WHERE variant_id LIKE 'curated-107004-first-edition-holofoil-%'
   OR variant_id LIKE 'curated-42425-first-edition-holofoil-%';

UPDATE catalog_card_variants
SET
    current_price = NULL,
    source_updated_at = NULL
WHERE id LIKE 'curated-107004-first-edition-holofoil-%'
   OR id LIKE 'curated-42425-first-edition-holofoil-%';

ALTER TABLE catalog_card_variants
    DROP COLUMN source_provider;

SELECT refresh_catalog_price_quality();
