-- +goose Up
DELETE FROM catalog_cards
WHERE id = 'pokemon-base-set-charizard-black-dot-error-holo-rare';

ALTER TABLE catalog_valuation_references
    ALTER COLUMN amount DROP NOT NULL;

-- JustTCG omits both Base Set Machamp printings. They share the erroneous First
-- Edition stamp, but Shadowless and Unlimited remain distinct market records.
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
        'https://product-images.tcgplayer.com/fit-in/437x437/107004.jpg'
    ),
    (
        'pokemon-base-set-machamp-first-edition-holo-rare',
        'base-set-pokemon',
        42425,
        'Machamp',
        '008/102',
        8,
        'Holo Rare',
        'https://product-images.tcgplayer.com/fit-in/437x437/42425.jpg'
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
    current_price = EXCLUDED.current_price,
    imported_at = now();

WITH card_values (
    tcgplayer_product_id,
    slug,
    ungraded,
    grade_1,
    grade_2,
    grade_3,
    grade_4,
    grade_5,
    grade_6,
    grade_7,
    grade_8,
    grade_9,
    grade_9_5,
    psa_10
) AS (VALUES
    (106996, 'alakazam-1st-edition-1', 651.00, 528.23, 350.00, 438.93, 599.99, 798.90, 978.49, 1625.00, 2010.83, 4700.00, 5170.00, 18264.94),
    (106997, 'blastoise-1st-edition-2', 1210.31, 1079.50, 881.26, 1176.00, 1575.00, 2050.00, 2333.00, 3585.56, 4371.73, 8948.33, 10373.66, 73810.00),
    (106998, 'chansey-1st-edition-3', 399.50, 320.00, 270.00, 299.99, 318.28, 505.08, 585.00, 810.00, 1415.58, 3657.00, 4199.09, 102500.00),
    (106999, 'charizard-1st-edition-4', 6500.00, 9100.00, 9000.00, 10033.63, 10804.67, 14000.00, 16421.93, 18605.00, 26420.00, 46354.76, 70401.00, 343098.00),
    (107001, 'clefairy-1st-edition-5', 275.64, 303.00, 107.50, 266.00, 305.72, 327.00, 409.00, 855.50, 1176.00, 3350.00, 3685.00, 9126.25),
    (107000, 'gyarados-1st-edition-6', 500.73, 663.54, 347.00, 620.00, 655.73, 797.34, 870.00, 1337.00, 2185.78, 3680.68, 3800.00, 26241.35),
    (107002, 'hitmonchan-1st-edition-7', 309.89, 275.00, 265.88, 329.00, 334.72, 417.50, 516.79, 599.50, 1049.66, 2214.96, 2436.00, 19763.39),
    (107004, 'machamp-shadowless-8', 99.99, NULL::numeric, 26.00, 29.00, 34.00, 39.99, 101.99, 109.52, 304.51, 1100.00, 1210.00, 8228.50),
    (107003, 'magneton-1st-edition-9', 254.73, 280.00, 207.00, 229.75, 237.39, 369.06, 406.84, 477.57, 727.36, 1862.50, 2049.00, 10454.58),
    (107005, 'mewtwo-1st-edition-10', 825.98, 620.00, 826.00, 936.00, 1023.50, 1025.00, 1541.69, 2400.00, 2999.50, 6394.32, 7758.00, 54069.56),
    (107006, 'nidoking-1st-edition-11', 375.00, 325.00, 225.00, 270.25, 349.27, 436.00, 550.25, 775.00, 1009.65, 2025.00, 5000.00, 14503.22),
    (107008, 'ninetales-1st-edition-12', 417.47, 399.99, 337.00, 374.00, 419.00, 599.18, 655.00, 881.78, 1458.18, 2731.95, 3005.00, 22514.87),
    (107007, 'poliwrath-1st-edition-13', 340.00, 292.50, 288.00, 320.00, 357.00, 448.44, 459.00, 689.99, 1008.14, 2235.54, 2459.00, 12689.32),
    (107009, 'raichu-1st-edition-14', 422.52, 430.57, 243.57, 332.05, 449.49, 502.30, 540.99, 875.00, 1700.00, 3407.66, 3748.00, 20740.00),
    (107010, 'venusaur-1st-edition-15', 1117.46, 746.46, 900.40, 980.00, 1163.00, 1446.50, 1765.00, 2493.04, 3655.15, 6236.87, 7413.66, 37210.00),
    (107011, 'zapdos-1st-edition-16', 354.63, 360.33, 169.76, 272.00, 340.00, 400.00, 499.99, 761.27, 1130.83, 2405.39, 3023.48, 8768.86),
    (42425, 'machamp-1st-edition-8', 13.82, 83.57, 31.33, 37.50, 46.51, 46.84, 53.50, 77.00, 121.87, 224.77, 263.75, 4602.00)
), valuation_rows AS (
    SELECT
        card_values.tcgplayer_product_id,
        card_values.slug,
        reference.code,
        reference.kind,
        reference.label,
        reference.grader,
        reference.grade,
        reference.amount,
        reference.sort_order
    FROM card_values
    CROSS JOIN LATERAL (VALUES
        ('ungraded', 'ungraded', 'Ungraded', NULL, NULL, card_values.ungraded, 0),
        ('grade-1', 'graded', 'Grade 1', NULL, '1', card_values.grade_1, 10),
        ('grade-2', 'graded', 'Grade 2', NULL, '2', card_values.grade_2, 20),
        ('grade-3', 'graded', 'Grade 3', NULL, '3', card_values.grade_3, 30),
        ('grade-4', 'graded', 'Grade 4', NULL, '4', card_values.grade_4, 40),
        ('grade-5', 'graded', 'Grade 5', NULL, '5', card_values.grade_5, 50),
        ('grade-6', 'graded', 'Grade 6', NULL, '6', card_values.grade_6, 60),
        ('grade-7', 'graded', 'Grade 7', NULL, '7', card_values.grade_7, 70),
        ('grade-8', 'graded', 'Grade 8', NULL, '8', card_values.grade_8, 80),
        ('grade-9', 'graded', 'Grade 9', NULL, '9', card_values.grade_9, 90),
        ('grade-9-5', 'graded', 'Grade 9.5', NULL, '9.5', card_values.grade_9_5, 95),
        ('psa-10', 'graded', 'PSA 10', 'PSA', '10', card_values.psa_10, 100)
    ) reference(code, kind, label, grader, grade, amount, sort_order)
)
INSERT INTO catalog_valuation_references (
    id,
    tcgplayer_product_id,
    edition,
    finish,
    language,
    kind,
    label,
    grader,
    grade,
    amount,
    currency,
    source_name,
    source_url,
    checked_on,
    note,
    sort_order
)
SELECT
    format('pricecharting-%s-first-edition-%s', tcgplayer_product_id, code),
    tcgplayer_product_id,
    'First Edition',
    'Holofoil',
    'English',
    kind,
    label,
    grader,
    grade,
    amount,
    'USD',
    'PriceCharting',
    'https://www.pricecharting.com/game/pokemon-base-set/' || slug,
    '2026-08-23',
    CASE kind
        WHEN 'ungraded' THEN 'Condition-neutral completed-sales benchmark; not a Near Mint price.'
        ELSE 'Completed-sales market benchmark for the stated grade.'
    END,
    sort_order
FROM valuation_rows
ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    source_name = EXCLUDED.source_name,
    source_url = EXCLUDED.source_url,
    checked_on = EXCLUDED.checked_on,
    note = EXCLUDED.note,
    sort_order = EXCLUDED.sort_order;

SELECT refresh_catalog_price_quality();

-- +goose Down
DELETE FROM catalog_valuation_references
WHERE source_name = 'PriceCharting'
  AND edition = 'First Edition'
  AND finish = 'Holofoil'
  AND tcgplayer_product_id <> 106999;

DELETE FROM catalog_cards
WHERE id IN (
    'pokemon-base-set-shadowless-machamp-holo-rare',
    'pokemon-base-set-machamp-first-edition-holo-rare'
);

ALTER TABLE catalog_valuation_references
    ALTER COLUMN amount SET NOT NULL;

SELECT refresh_catalog_price_quality();
