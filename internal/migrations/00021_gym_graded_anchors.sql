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

WITH card_values (
    tcgplayer_product_id,
    edition,
    finish,
    printing_code,
    printing_variant,
    is_primary,
    source_url,
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
    (42464, 'Unlimited', 'Holofoil', 'base2-blastoise', '', true, 'https://www.pricecharting.com/game/pokemon-base-set-2/blastoise-2', 80.44, 107.30, 52.00, 58.00, 68.50, 93.53, 112.50, 156.95, 243.00, 533.67, 688.31, 7765.91),
    (42479, 'Unlimited', 'Holofoil', 'base2-charizard', '', true, 'https://www.pricecharting.com/game/pokemon-base-set-2/charizard-4', 259.67, 300.00, 234.00, 260.00, 271.52, 307.75, 352.50, 462.12, 675.38, 1489.59, 1639.00, 11764.45),
    (85290, 'First Edition', 'Holofoil', 'heroes-erikas-dragonair-first', '', true, 'https://www.pricecharting.com/game/pokemon-gym-heroes/erika%27s-dragonair-1st-edition-4', 274.99, 89.88, 54.00, 60.00, 70.39, 96.00, 162.50, 228.75, 322.50, 575.00, 818.21, 2860.00),
    (88781, 'First Edition', 'Holofoil', 'heroes-rockets-moltres-first', '', true, 'https://www.pricecharting.com/game/pokemon-gym-heroes/rocket%27s-moltres-1st-edition-12', 156.73, 221.00, 43.00, 48.00, 56.91, 114.33, 156.97, 232.40, 246.50, 540.00, 807.00, 5000.00),
    (88788, 'First Edition', 'Holofoil', 'heroes-rockets-scyther-first', '', true, 'https://www.pricecharting.com/game/pokemon-gym-heroes/rocket%27s-scyther-1st-edition-13', 189.53, 104.50, 40.00, 44.54, 98.00, 115.00, 175.00, 220.25, 312.50, 610.00, 671.00, 6800.00),
    (88874, 'First Edition', 'Holofoil', 'heroes-sabrinas-gengar-first', '', true, 'https://www.pricecharting.com/game/pokemon-gym-heroes/sabrina%27s-gengar-1st-edition-14', 1260.05, 449.99, 574.00, 580.00, 581.00, 683.53, 1163.55, 1251.47, 1812.50, 2862.08, 8600.00, 29100.00),
    (88874, 'Unlimited', 'Holofoil', 'heroes-sabrinas-gengar-unlimited', '', true, 'https://www.pricecharting.com/game/pokemon-gym-heroes/sabrina%27s-gengar-14', 327.44, 357.85, 191.25, 280.50, 300.00, 371.00, 400.00, 522.92, 755.00, 1456.00, 1602.00, 18467.50),
    (83860, 'First Edition', 'Holofoil', 'challenge-blaines-arcanine-first', '', true, 'https://www.pricecharting.com/game/pokemon-gym-challenge/blaine%27s-arcanine-1st-edition-1', 305.07, 160.50, 102.00, 113.00, 133.00, 156.25, 299.08, 409.98, 584.50, 1125.00, 1731.97, 5833.50),
    (83861, 'First Edition', 'Holofoil', 'challenge-blaines-charizard-first-error', 'Energy Misprint', true, 'https://www.pricecharting.com/game/pokemon-gym-challenge/blaine%27s-charizard-1st-edition-2', 972.85, 629.76, 402.00, 447.00, 526.00, 619.10, 1090.43, 1475.00, 1971.80, 3401.20, 3530.00, 17249.50),
    (83861, 'Unlimited', 'Holofoil', 'challenge-blaines-charizard-corrected', 'Corrected', true, 'https://www.pricecharting.com/game/pokemon-gym-challenge/blaine%27s-charizard-2', 422.10, 271.09, 255.00, 283.00, 333.09, 387.96, 475.00, 582.31, 779.85, 1207.76, 1386.17, 6000.00),
    (83861, 'Unlimited', 'Holofoil', 'challenge-blaines-charizard-error', 'Energy Misprint', false, 'https://www.pricecharting.com/game/pokemon-gym-challenge/blaine%27s-charizard-energy-misprint-2', 146.17, NULL, 111.00, 123.00, 145.00, 171.00, 213.38, NULL, 220.70, 399.95, 440.00, 1341.72),
    (85307, 'First Edition', 'Holofoil', 'challenge-erikas-venusaur-first', '', true, 'https://www.pricecharting.com/game/pokemon-gym-challenge/erika%27s-venusaur-1st-edition-4', 397.90, 229.99, 66.00, 72.94, 193.01, 227.50, 299.99, 366.00, 592.50, 907.02, 2042.87, 9100.00),
    (85307, 'Unlimited', 'Holofoil', 'challenge-erikas-venusaur-unlimited', '', true, 'https://www.pricecharting.com/game/pokemon-gym-challenge/erika%27s-venusaur-4', 115.63, 99.00, 53.36, 67.00, 77.00, 105.00, 140.00, 158.75, 230.00, 413.74, 650.00, 2911.00),
    (85710, 'First Edition', 'Holofoil', 'challenge-giovannis-gyarados-first', '', true, 'https://www.pricecharting.com/game/pokemon-gym-challenge/giovanni%27s-gyarados-1st-edition-5', 222.00, 201.25, 75.00, 83.22, 149.00, 199.99, 205.92, 337.50, 427.00, 773.20, 851.00, 5365.16),
    (85718, 'First Edition', 'Holofoil', 'challenge-giovannis-nidoking-first', '', true, 'https://www.pricecharting.com/game/pokemon-gym-challenge/giovanni%27s-nidoking-1st-edition-7', 170.00, 165.00, 44.00, 49.00, 57.33, 123.22, 127.51, 166.75, 240.84, 412.14, 451.02, 2703.42),
    (85724, 'First Edition', 'Holofoil', 'challenge-giovannis-persian-first', '', true, 'https://www.pricecharting.com/game/pokemon-gym-challenge/giovanni%27s-persian-1st-edition-8', 167.50, NULL, 36.00, 40.00, 47.00, 55.02, 140.50, 182.68, 260.43, 572.52, 854.50, 9916.51),
    (87531, 'First Edition', 'Holofoil', 'challenge-mistys-gyarados-first', '', true, 'https://www.pricecharting.com/game/pokemon-gym-challenge/misty%27s-gyarados-1st-edition-13', 300.94, 180.50, 59.00, 83.00, 97.51, 190.49, 344.56, 362.50, 450.00, 930.89, 1100.00, 4585.56),
    (88777, 'First Edition', 'Holofoil', 'challenge-rockets-mewtwo-first', '', true, 'https://www.pricecharting.com/game/pokemon-gym-challenge/rocket%27s-mewtwo-1st-edition-14', 382.50, 350.00, 167.00, 185.00, 217.50, 367.22, 510.00, 580.00, 830.00, 1674.50, 1793.25, 8950.00),
    (88777, 'Unlimited', 'Holofoil', 'challenge-rockets-mewtwo-unlimited', '', true, 'https://www.pricecharting.com/game/pokemon-gym-challenge/rocket%27s-mewtwo-14', 228.58, 157.09, 105.98, 128.77, 131.50, 150.02, 208.57, 275.86, 356.75, 581.09, 639.00, 4548.87),
    (88800, 'First Edition', 'Holofoil', 'challenge-rockets-zapdos-first', '', true, 'https://www.pricecharting.com/game/pokemon-gym-challenge/rocket%27s-zapdos-1st-edition-15', 236.39, 159.99, 85.00, 94.00, 110.00, 118.00, 148.00, 203.37, 320.00, 600.00, 938.32, 2900.00),
    (88866, 'First Edition', 'Holofoil', 'challenge-sabrinas-alakazam-first', '', true, 'https://www.pricecharting.com/game/pokemon-gym-challenge/sabrina%27s-alakazam-1st-edition-16', 212.00, NULL, 70.00, 78.00, 91.23, 168.63, 231.78, 300.00, 390.00, 726.65, 799.00, 4250.00),
    (88875, 'First Edition', 'Normal', 'challenge-sabrinas-gengar-29-first', '', true, 'https://www.pricecharting.com/game/pokemon-gym-challenge/sabrina%27s-gengar-1st-edition-29', 325.00, 220.00, 46.94, 115.50, 131.00, 154.05, 447.50, 508.00, 685.01, 1203.56, 1324.00, 5398.14),
    (88875, 'Unlimited', 'Normal', 'challenge-sabrinas-gengar-29-unlimited', '', true, 'https://www.pricecharting.com/game/pokemon-gym-challenge/sabrina%27s-gengar-29', 128.05, 237.50, 103.24, 106.00, 125.00, 146.53, 154.63, 288.88, 322.88, 531.11, 584.00, 3700.00)
), valuation_rows AS (
    SELECT
        card_values.*,
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
    printing_variant,
    is_primary,
    checked_on,
    note,
    sort_order
)
SELECT
    format('pricecharting-gym-base2-%s-%s-%s', tcgplayer_product_id, printing_code, code),
    tcgplayer_product_id,
    edition,
    finish,
    'English',
    kind,
    label,
    grader,
    grade,
    amount,
    'USD',
    'PriceCharting',
    source_url,
    printing_variant,
    is_primary,
    '2026-08-24',
    CASE
        WHEN NOT is_primary THEN 'Alternate energy-error printing; excluded from catalog fallback valuation.'
        WHEN kind = 'ungraded' THEN 'Condition-neutral completed-sales benchmark; not a Near Mint price.'
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
    printing_variant = EXCLUDED.printing_variant,
    is_primary = EXCLUDED.is_primary,
    checked_on = EXCLUDED.checked_on,
    note = EXCLUDED.note,
    sort_order = EXCLUDED.sort_order;

INSERT INTO catalog_valuation_observations (
    valuation_reference_id,
    observed_on,
    amount,
    currency,
    collection_method
)
SELECT
    reference.id,
    reference.checked_on,
    reference.amount,
    reference.currency,
    'seed'
FROM catalog_valuation_references reference
WHERE reference.id LIKE 'pricecharting-gym-base2-%'
ON CONFLICT (valuation_reference_id, observed_on) DO NOTHING;

SELECT refresh_catalog_price_quality();

-- +goose Down
DELETE FROM catalog_valuation_observations
WHERE valuation_reference_id LIKE 'pricecharting-gym-base2-%';

DELETE FROM catalog_valuation_references
WHERE id LIKE 'pricecharting-gym-base2-%';

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
