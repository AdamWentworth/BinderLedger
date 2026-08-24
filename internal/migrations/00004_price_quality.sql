-- +goose Up
CREATE TABLE catalog_price_quality (
    card_id text NOT NULL REFERENCES catalog_cards(id) ON DELETE CASCADE,
    edition text NOT NULL,
    finish text NOT NULL,
    language text NOT NULL,
    status text NOT NULL CHECK (status IN ('current', 'historical', 'unavailable')),
    as_of date,
    reason text CHECK (reason IS NULL OR reason IN ('missing_conditions', 'condition_order')),
    damaged_price numeric(12, 2),
    heavily_played_price numeric(12, 2),
    moderately_played_price numeric(12, 2),
    lightly_played_price numeric(12, 2),
    near_mint_price numeric(12, 2),
    refreshed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (card_id, edition, finish, language),
    CONSTRAINT catalog_price_quality_historical_date
        CHECK (status <> 'historical' OR as_of IS NOT NULL),
    CONSTRAINT catalog_price_quality_unavailable_prices
        CHECK (
            status <> 'unavailable'
            OR (
                damaged_price IS NULL
                AND heavily_played_price IS NULL
                AND moderately_played_price IS NULL
                AND lightly_played_price IS NULL
                AND near_mint_price IS NULL
            )
        )
);

CREATE INDEX catalog_price_quality_status_idx
    ON catalog_price_quality (status, card_id);

-- +goose StatementBegin
CREATE FUNCTION refresh_catalog_price_quality()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    WITH current_snapshots AS (
        SELECT
            v.card_id,
            v.edition,
            v.finish,
            v.language,
            max(v.current_price) FILTER (WHERE v.condition = 'Damaged') AS damaged_price,
            max(v.current_price) FILTER (WHERE v.condition = 'Heavily Played') AS heavily_played_price,
            max(v.current_price) FILTER (WHERE v.condition = 'Moderately Played') AS moderately_played_price,
            max(v.current_price) FILTER (WHERE v.condition = 'Lightly Played') AS lightly_played_price,
            max(v.current_price) FILTER (WHERE v.condition = 'Near Mint') AS near_mint_price
        FROM catalog_card_variants v
        GROUP BY v.card_id, v.edition, v.finish, v.language
    ), current_quality AS (
        SELECT
            current_snapshots.*,
            damaged_price IS NOT NULL
                AND heavily_played_price IS NOT NULL
                AND moderately_played_price IS NOT NULL
                AND lightly_played_price IS NOT NULL
                AND near_mint_price IS NOT NULL AS complete,
            damaged_price < heavily_played_price
                AND heavily_played_price < moderately_played_price
                AND moderately_played_price < lightly_played_price
                AND lightly_played_price < near_mint_price AS coherent
        FROM current_snapshots
    ), daily_snapshots AS (
        SELECT
            v.card_id,
            v.edition,
            v.finish,
            v.language,
            o.observed_on,
            max(o.price) FILTER (WHERE v.condition = 'Damaged') AS damaged_price,
            max(o.price) FILTER (WHERE v.condition = 'Heavily Played') AS heavily_played_price,
            max(o.price) FILTER (WHERE v.condition = 'Moderately Played') AS moderately_played_price,
            max(o.price) FILTER (WHERE v.condition = 'Lightly Played') AS lightly_played_price,
            max(o.price) FILTER (WHERE v.condition = 'Near Mint') AS near_mint_price
        FROM catalog_card_variants v
        JOIN price_observations o ON o.variant_id = v.id
        GROUP BY v.card_id, v.edition, v.finish, v.language, o.observed_on
    ), latest_coherent_history AS (
        SELECT DISTINCT ON (card_id, edition, finish, language)
            card_id,
            edition,
            finish,
            language,
            observed_on,
            damaged_price,
            heavily_played_price,
            moderately_played_price,
            lightly_played_price,
            near_mint_price
        FROM daily_snapshots
        WHERE damaged_price < heavily_played_price
          AND heavily_played_price < moderately_played_price
          AND moderately_played_price < lightly_played_price
          AND lightly_played_price < near_mint_price
        ORDER BY card_id, edition, finish, language, observed_on DESC
    )
    INSERT INTO catalog_price_quality (
        card_id,
        edition,
        finish,
        language,
        status,
        as_of,
        reason,
        damaged_price,
        heavily_played_price,
        moderately_played_price,
        lightly_played_price,
        near_mint_price,
        refreshed_at
    )
    SELECT
        current.card_id,
        current.edition,
        current.finish,
        current.language,
        CASE
            WHEN current.coherent THEN 'current'
            WHEN historical.card_id IS NOT NULL THEN 'historical'
            ELSE 'unavailable'
        END,
        CASE WHEN NOT current.coherent THEN historical.observed_on END,
        CASE
            WHEN current.coherent THEN NULL
            WHEN NOT current.complete THEN 'missing_conditions'
            ELSE 'condition_order'
        END,
        CASE WHEN current.coherent THEN current.damaged_price ELSE historical.damaged_price END,
        CASE WHEN current.coherent THEN current.heavily_played_price ELSE historical.heavily_played_price END,
        CASE WHEN current.coherent THEN current.moderately_played_price ELSE historical.moderately_played_price END,
        CASE WHEN current.coherent THEN current.lightly_played_price ELSE historical.lightly_played_price END,
        CASE WHEN current.coherent THEN current.near_mint_price ELSE historical.near_mint_price END,
        now()
    FROM current_quality current
    LEFT JOIN latest_coherent_history historical
        ON historical.card_id = current.card_id
       AND historical.edition = current.edition
       AND historical.finish = current.finish
       AND historical.language = current.language
    ON CONFLICT (card_id, edition, finish, language) DO UPDATE SET
        status = EXCLUDED.status,
        as_of = EXCLUDED.as_of,
        reason = EXCLUDED.reason,
        damaged_price = EXCLUDED.damaged_price,
        heavily_played_price = EXCLUDED.heavily_played_price,
        moderately_played_price = EXCLUDED.moderately_played_price,
        lightly_played_price = EXCLUDED.lightly_played_price,
        near_mint_price = EXCLUDED.near_mint_price,
        refreshed_at = now();

    DELETE FROM catalog_price_quality quality
    WHERE NOT EXISTS (
        SELECT 1
        FROM catalog_card_variants variant
        WHERE variant.card_id = quality.card_id
          AND variant.edition = quality.edition
          AND variant.finish = quality.finish
          AND variant.language = quality.language
    );
END;
$$;
-- +goose StatementEnd

SELECT refresh_catalog_price_quality();

-- +goose Down
-- +goose StatementBegin
DROP FUNCTION refresh_catalog_price_quality();
-- +goose StatementEnd
DROP TABLE catalog_price_quality;
