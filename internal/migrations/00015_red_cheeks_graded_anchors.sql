-- +goose Up
WITH card_values (
    tcgplayer_product_id,
    edition,
    printing_code,
    product_slug,
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
    (
        147229,
        'First Edition',
        'first-edition',
        'pikachu-1st-edition-red-cheeks-58',
        369.00,
        653.73,
        387.00,
        429.72,
        580.00,
        582.50,
        689.00,
        920.94,
        1062.94,
        2583.67,
        2842.00,
        18739.05
    ),
    (
        147229,
        'Shadowless',
        'shadowless',
        'pikachu-shadowless-red-cheeks-58',
        53.81,
        132.64,
        41.00,
        45.85,
        50.50,
        62.98,
        74.51,
        95.48,
        157.50,
        356.52,
        392.00,
        3022.35
    )
), valuation_rows AS (
    SELECT
        card_values.tcgplayer_product_id,
        card_values.edition,
        card_values.printing_code,
        card_values.product_slug,
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
    format(
        'pricecharting-red-cheeks-%s-%s-%s',
        tcgplayer_product_id,
        printing_code,
        code
    ),
    tcgplayer_product_id,
    edition,
    'Normal',
    'English',
    kind,
    label,
    grader,
    grade,
    amount,
    'USD',
    'PriceCharting',
    format(
        'https://www.pricecharting.com/game/pokemon-base-set/%s',
        product_slug
    ),
    '2026-08-24',
    CASE kind
        WHEN 'ungraded' THEN 'Condition-neutral completed-sales benchmark; not a Near Mint price.'
        ELSE 'Completed-sales market benchmark for the stated grade.'
    END,
    sort_order
FROM valuation_rows
ON CONFLICT (id) DO UPDATE SET
    tcgplayer_product_id = EXCLUDED.tcgplayer_product_id,
    edition = EXCLUDED.edition,
    finish = EXCLUDED.finish,
    language = EXCLUDED.language,
    kind = EXCLUDED.kind,
    label = EXCLUDED.label,
    grader = EXCLUDED.grader,
    grade = EXCLUDED.grade,
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
WHERE id LIKE 'pricecharting-red-cheeks-147229-%';

SELECT refresh_catalog_price_quality();
