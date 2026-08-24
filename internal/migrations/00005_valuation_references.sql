-- +goose Up
CREATE TABLE catalog_valuation_references (
    id text PRIMARY KEY,
    tcgplayer_product_id bigint NOT NULL,
    edition text NOT NULL,
    finish text NOT NULL,
    language text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('ungraded', 'graded')),
    label text NOT NULL,
    grader text,
    grade text,
    amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
    currency text NOT NULL DEFAULT 'USD',
    source_name text NOT NULL,
    source_url text NOT NULL,
    checked_on date NOT NULL,
    note text,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (
        tcgplayer_product_id,
        edition,
        finish,
        language,
        source_name,
        kind,
        label
    )
);

CREATE INDEX catalog_valuation_references_printing_idx
    ON catalog_valuation_references (
        tcgplayer_product_id,
        edition,
        finish,
        language,
        kind,
        sort_order
    );

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
    source_name,
    source_url,
    checked_on,
    note,
    sort_order
)
VALUES
    (
        'pricecharting-106999-first-edition-ungraded',
        106999,
        'First Edition',
        'Holofoil',
        'English',
        'ungraded',
        'Ungraded',
        NULL,
        NULL,
        6500.00,
        'PriceCharting',
        'https://www.pricecharting.com/game/pokemon-base-set/charizard-1st-edition-4',
        '2026-08-23',
        'Condition-neutral estimate based on completed sales; not a Near Mint price.',
        0
    ),
    ('pricecharting-106999-first-edition-grade-1', 106999, 'First Edition', 'Holofoil', 'English', 'graded', 'Grade 1', NULL, '1', 9100.00, 'PriceCharting', 'https://www.pricecharting.com/game/pokemon-base-set/charizard-1st-edition-4', '2026-08-23', 'Completed-sales market benchmark.', 10),
    ('pricecharting-106999-first-edition-grade-2', 106999, 'First Edition', 'Holofoil', 'English', 'graded', 'Grade 2', NULL, '2', 9000.00, 'PriceCharting', 'https://www.pricecharting.com/game/pokemon-base-set/charizard-1st-edition-4', '2026-08-23', 'Completed-sales market benchmark.', 20),
    ('pricecharting-106999-first-edition-grade-3', 106999, 'First Edition', 'Holofoil', 'English', 'graded', 'Grade 3', NULL, '3', 10033.63, 'PriceCharting', 'https://www.pricecharting.com/game/pokemon-base-set/charizard-1st-edition-4', '2026-08-23', 'Completed-sales market benchmark.', 30),
    ('pricecharting-106999-first-edition-grade-4', 106999, 'First Edition', 'Holofoil', 'English', 'graded', 'Grade 4', NULL, '4', 10804.67, 'PriceCharting', 'https://www.pricecharting.com/game/pokemon-base-set/charizard-1st-edition-4', '2026-08-23', 'Completed-sales market benchmark.', 40),
    ('pricecharting-106999-first-edition-grade-5', 106999, 'First Edition', 'Holofoil', 'English', 'graded', 'Grade 5', NULL, '5', 14000.00, 'PriceCharting', 'https://www.pricecharting.com/game/pokemon-base-set/charizard-1st-edition-4', '2026-08-23', 'Completed-sales market benchmark.', 50),
    ('pricecharting-106999-first-edition-grade-6', 106999, 'First Edition', 'Holofoil', 'English', 'graded', 'Grade 6', NULL, '6', 16421.93, 'PriceCharting', 'https://www.pricecharting.com/game/pokemon-base-set/charizard-1st-edition-4', '2026-08-23', 'Completed-sales market benchmark.', 60),
    ('pricecharting-106999-first-edition-grade-7', 106999, 'First Edition', 'Holofoil', 'English', 'graded', 'Grade 7', NULL, '7', 18605.00, 'PriceCharting', 'https://www.pricecharting.com/game/pokemon-base-set/charizard-1st-edition-4', '2026-08-23', 'Completed-sales market benchmark.', 70),
    ('pricecharting-106999-first-edition-grade-8', 106999, 'First Edition', 'Holofoil', 'English', 'graded', 'Grade 8', NULL, '8', 26420.00, 'PriceCharting', 'https://www.pricecharting.com/game/pokemon-base-set/charizard-1st-edition-4', '2026-08-23', 'Completed-sales market benchmark.', 80),
    ('pricecharting-106999-first-edition-grade-9', 106999, 'First Edition', 'Holofoil', 'English', 'graded', 'Grade 9', NULL, '9', 46354.76, 'PriceCharting', 'https://www.pricecharting.com/game/pokemon-base-set/charizard-1st-edition-4', '2026-08-23', 'Completed-sales market benchmark.', 90),
    ('pricecharting-106999-first-edition-grade-9-5', 106999, 'First Edition', 'Holofoil', 'English', 'graded', 'Grade 9.5', NULL, '9.5', 70401.00, 'PriceCharting', 'https://www.pricecharting.com/game/pokemon-base-set/charizard-1st-edition-4', '2026-08-23', 'Completed-sales market benchmark.', 95),
    ('pricecharting-106999-first-edition-psa-10', 106999, 'First Edition', 'Holofoil', 'English', 'graded', 'PSA 10', 'PSA', '10', 343098.00, 'PriceCharting', 'https://www.pricecharting.com/game/pokemon-base-set/charizard-1st-edition-4', '2026-08-23', 'Completed-sales market benchmark.', 100);

-- +goose Down
DROP TABLE catalog_valuation_references;
