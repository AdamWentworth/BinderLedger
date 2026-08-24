-- +goose Up
WITH card_values (
    tcgplayer_product_id,
    edition,
    printing_code,
    console_slug,
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
    (106521, 'First Edition', 'first-edition', 'pokemon-fossil', 'gengar-1st-edition-5', 322.53, 323.15, 157.50, 237.50, 294.45, 377.72, 457.51, 674.20, 874.18, 2460.50, 2507.16, 17078.90),
    (106520, 'First Edition', 'first-edition', 'pokemon-fossil', 'dragonite-1st-edition-4', 280.97, 360.00, 161.00, 178.35, 282.10, 326.52, 405.00, 556.00, 804.18, 1962.50, 2159.00, 19412.17),
    (106521, 'Unlimited', 'unlimited', 'pokemon-fossil', 'gengar-5', 131.00, 156.26, 76.00, 84.00, 101.87, 112.07, 146.03, 211.75, 293.66, 602.03, 662.00, 4435.85),
    (106518, 'First Edition', 'first-edition', 'pokemon-fossil', 'articuno-1st-edition-2', 127.89, 77.09, 59.00, 66.00, 89.75, 112.69, 122.73, 168.09, 301.00, 760.00, 836.00, 11762.50),
    (44421, 'First Edition', 'first-edition', 'pokemon-fossil', 'moltres-1st-edition-12', 129.20, 99.79, 48.00, 53.00, 61.97, 88.60, 123.00, 172.39, 223.69, 582.92, 641.00, 4363.59),
    (84572, 'First Edition', 'first-edition', 'pokemon-team-rocket', 'dark-charizard-1st-edition-4', 649.91, 437.15, 301.00, 334.00, 393.00, 462.00, 578.00, 858.42, 1323.18, 2135.00, 2247.00, 19642.87),
    (84568, 'First Edition', 'first-edition', 'pokemon-team-rocket', 'dark-blastoise-1st-edition-3', 308.86, 238.75, 154.85, 202.51, 214.25, 270.00, 340.00, 428.00, 598.60, 1200.00, 2110.87, 9795.63),
    (84584, 'First Edition', 'first-edition', 'pokemon-team-rocket', 'dark-dragonite-1st-edition-5', 300.00, 237.50, 161.00, 178.61, 300.00, 306.43, 357.77, 450.00, 679.30, 1240.87, 1365.00, 14016.86),
    (84572, 'Unlimited', 'unlimited', 'pokemon-team-rocket', 'dark-charizard-4', 238.28, 188.98, 109.12, 145.76, 198.77, 230.75, 270.00, 332.89, 495.00, 816.00, 1468.45, 11119.98),
    (84647, 'First Edition', 'first-edition', 'pokemon-team-rocket', 'dark-raichu-1st-edition-83', 232.50, 134.18, 113.00, 125.00, 145.00, 181.36, 200.57, 279.61, 357.31, 719.80, 792.00, 7638.99),
    (84606, 'First Edition', 'first-edition', 'pokemon-team-rocket', 'dark-gyarados-1st-edition-8', 129.23, 47.75, 35.00, 39.00, 46.01, 70.99, 140.13, 179.25, 236.97, 437.70, 481.00, 3550.00),
    (84568, 'Unlimited', 'unlimited', 'pokemon-team-rocket', 'dark-blastoise-3', 113.26, 134.97, 51.00, 85.55, 86.88, 98.57, 130.00, 175.00, 268.45, 408.44, 650.00, 1393.41),
    (84584, 'Unlimited', 'unlimited', 'pokemon-team-rocket', 'dark-dragonite-holo-5', 122.20, 147.89, 70.00, 78.00, 92.00, 108.63, 146.88, 210.00, 352.75, 453.67, 475.50, 7600.00)
), valuation_rows AS (
    SELECT
        card_values.tcgplayer_product_id,
        card_values.edition,
        card_values.printing_code,
        card_values.console_slug,
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
    format('pricecharting-anchor-%s-%s-%s', tcgplayer_product_id, printing_code, code),
    tcgplayer_product_id,
    edition,
    'Holofoil',
    'English',
    kind,
    label,
    grader,
    grade,
    amount,
    'USD',
    'PriceCharting',
    format('https://www.pricecharting.com/game/%s/%s', console_slug, product_slug),
    '2026-08-23',
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
WHERE id LIKE 'pricecharting-anchor-%';

SELECT refresh_catalog_price_quality();
