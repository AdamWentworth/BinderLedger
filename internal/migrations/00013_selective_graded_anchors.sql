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
    (106996, 'Shadowless', 'shadowless', 'pokemon-base-set', 'alakazam-shadowless-1', 106.50, 155.78, 70.00, 95.14, 105.14, 143.00, 191.34, 295.48, 519.44, 1077.51, 1290.76, 14400.00),
    (106997, 'Shadowless', 'shadowless', 'pokemon-base-set', 'blastoise-shadowless-2', 220.00, 374.16, 152.54, 228.62, 243.25, 325.00, 475.00, 682.50, 1075.00, 2838.38, 6928.44, 20250.00),
    (106998, 'Shadowless', 'shadowless', 'pokemon-base-set', 'chansey-shadowless-3', 49.00, 77.28, 28.00, 41.00, 42.20, 65.50, 138.38, 194.35, 315.00, 929.63, 1850.30, 3440.56),
    (106999, 'Shadowless', 'shadowless', 'pokemon-base-set', 'charizard-shadowless-4', 868.28, 865.50, 865.35, 1145.00, 1325.43, 1706.00, 2091.35, 3000.00, 5161.83, 9900.00, 10890.00, 30100.00),
    (107001, 'Shadowless', 'shadowless', 'pokemon-base-set', 'clefairy-shadowless-5', 34.24, 110.00, 27.00, 30.00, 35.00, 41.00, 67.75, 130.45, 220.00, 531.68, 585.00, 5137.51),
    (107005, 'Shadowless', 'shadowless', 'pokemon-base-set', 'mewtwo-shadowless-10', 71.77, 173.75, 55.00, 61.21, 102.77, 107.58, 179.50, 276.91, 499.99, 1243.72, 1368.00, 13143.75),
    (107006, 'Shadowless', 'shadowless', 'pokemon-base-set', 'nidoking-shadowless-11', 68.25, 86.00, 33.82, 42.52, 48.00, 54.53, 82.44, 129.75, 213.75, 546.98, 602.00, 3901.00),
    (107007, 'Shadowless', 'shadowless', 'pokemon-base-set', 'poliwrath-shadowless-13', 43.13, 117.47, 20.00, 37.59, 42.00, 74.58, 78.24, 111.91, 203.75, 438.30, 482.00, 5500.00),
    (107009, 'Shadowless', 'shadowless', 'pokemon-base-set', 'raichu-shadowless-14', 72.72, 106.02, 51.00, 57.06, 61.28, 80.50, 123.99, 165.61, 310.00, 865.78, 952.00, 3734.82),
    (107010, 'Shadowless', 'shadowless', 'pokemon-base-set', 'venusaur-shadowless-15', 258.78, 240.53, 154.00, 175.50, 209.25, 255.38, 353.26, 474.50, 757.45, 1703.75, 2270.38, 7699.00),
    (107011, 'Shadowless', 'shadowless', 'pokemon-base-set', 'zapdos-shadowless-16', 58.64, 90.65, 34.00, 37.55, 61.00, 92.75, 108.11, 172.09, 340.53, 691.81, 761.00, 3355.00),
    (42346, 'Unlimited', 'unlimited', 'pokemon-base-set', 'alakazam-1', 31.00, 87.95, 29.51, 31.00, 36.00, 46.50, 55.00, 83.36, 132.12, 281.12, 322.62, 2675.00),
    (42360, 'Unlimited', 'unlimited', 'pokemon-base-set', 'blastoise-2', 80.75, 120.00, 72.50, 86.37, 113.02, 120.00, 143.40, 228.00, 356.91, 1017.50, 1119.00, 6700.00),
    (42371, 'Unlimited', 'unlimited', 'pokemon-base-set', 'chansey-3', 18.98, 79.50, 19.00, 21.25, 24.50, 25.23, 36.00, 53.00, 97.19, 307.50, 338.00, 9000.00),
    (42382, 'Unlimited', 'unlimited', 'pokemon-base-set', 'charizard-4', 399.50, 375.00, 309.00, 355.00, 358.62, 451.68, 533.63, 795.00, 1305.23, 2691.93, 6086.00, 20061.40),
    (42347, 'Unlimited', 'unlimited', 'pokemon-base-set', 'mewtwo-10', 23.50, 106.71, 31.00, 34.00, 40.55, 52.13, 60.69, 105.67, 167.50, 405.00, 446.00, 4200.00),
    (42354, 'Unlimited', 'unlimited', 'pokemon-base-set', 'raichu-14', 29.09, 87.58, 28.00, 31.19, 35.00, 41.01, 54.08, 85.08, 141.18, 333.34, 367.00, 3200.57),
    (42355, 'Unlimited', 'unlimited', 'pokemon-base-set', 'venusaur-15', 75.51, 131.50, 66.00, 73.51, 80.00, 92.00, 121.51, 180.54, 277.50, 589.86, 649.00, 3035.69),
    (45129, 'First Edition', 'first-edition', 'pokemon-jungle', 'flareon-1st-edition-3', 103.01, 248.44, 72.66, 73.12, 80.00, 119.56, 160.57, 236.80, 365.00, 1162.50, 1279.00, 7340.14),
    (45130, 'First Edition', 'first-edition', 'pokemon-jungle', 'jolteon-1st-edition-4', 119.12, 139.99, 55.96, 63.16, 80.15, 114.75, 135.50, 233.27, 504.50, 1050.00, 1155.00, 9057.90),
    (45134, 'First Edition', 'first-edition', 'pokemon-jungle', 'pidgeot-1st-edition-8', 55.92, 122.30, 32.00, 35.00, 41.00, 59.33, 77.12, 115.84, 181.14, 498.64, 549.00, 6995.55),
    (45121, 'First Edition', 'first-edition', 'pokemon-jungle', 'scyther-1st-edition-10', 95.00, 127.00, 30.00, 33.30, 55.66, 75.05, 90.00, 164.00, 184.44, 551.62, 607.00, 5710.26),
    (45122, 'First Edition', 'first-edition', 'pokemon-jungle', 'snorlax-1st-edition-11', 219.26, 258.51, 129.00, 143.00, 203.48, 253.25, 310.00, 553.03, 853.55, 2705.98, 2977.00, 33592.48),
    (45123, 'First Edition', 'first-edition', 'pokemon-jungle', 'vaporeon-1st-edition-12', 135.83, 124.88, 61.00, 67.22, 70.00, 107.50, 149.86, 227.27, 360.80, 942.65, 1037.00, 9603.00),
    (45129, 'Unlimited', 'unlimited', 'pokemon-jungle', 'flareon-3', 42.29, 69.69, 30.00, 33.45, 49.87, 56.85, 57.00, 76.07, 129.19, 220.75, 243.00, 1975.90),
    (45130, 'Unlimited', 'unlimited', 'pokemon-jungle', 'jolteon-4', 38.08, 70.00, 28.11, 31.62, 44.00, 44.59, 52.77, 74.02, 121.60, 243.73, 250.00, 2175.05),
    (45122, 'Unlimited', 'unlimited', 'pokemon-jungle', 'snorlax-11', 59.75, 130.00, 37.00, 41.34, 59.50, 85.00, 95.00, 144.01, 269.62, 705.89, 776.00, 4677.15)
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
    format('pricecharting-priority-%s-%s-%s', tcgplayer_product_id, printing_code, code),
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
WHERE id LIKE 'pricecharting-priority-%';

SELECT refresh_catalog_price_quality();
