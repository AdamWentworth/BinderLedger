-- +goose Up
CREATE TABLE market_snapshot_status (
    condition text PRIMARY KEY,
    as_of date NOT NULL,
    refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE market_variant_movements (
    period text NOT NULL CHECK (period IN ('1d', '1w', '1m', '1y', 'all')),
    variant_id text NOT NULL REFERENCES catalog_card_variants(id) ON DELETE CASCADE,
    condition text NOT NULL,
    set_id text NOT NULL REFERENCES catalog_sets(id) ON DELETE CASCADE,
    as_of date NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    start_price numeric(12, 2) NOT NULL CHECK (start_price > 0),
    end_price numeric(12, 2) NOT NULL CHECK (end_price >= 0),
    change_amount numeric(12, 2) NOT NULL,
    change_percent numeric(14, 2) NOT NULL,
    observation_count integer NOT NULL CHECK (observation_count > 0),
    signal text NOT NULL CHECK (signal IN ('limited', 'regular', 'volatile')),
    refreshed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (period, variant_id)
);

CREATE INDEX market_variant_movements_lookup_idx
    ON market_variant_movements (period, condition, set_id);

-- +goose StatementBegin
CREATE FUNCTION refresh_market_variant_movements()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    CREATE TEMP TABLE market_refresh_variants ON COMMIT DROP AS
    WITH variant_dates AS (
        SELECT
            variant.id AS variant_id,
            variant.condition,
            card.set_id,
            min(observation.observed_on) AS first_date,
            max(observation.observed_on) AS end_date
        FROM catalog_card_variants variant
        JOIN catalog_price_quality quality
          ON quality.card_id = variant.card_id
         AND quality.edition = variant.edition
         AND quality.finish = variant.finish
         AND quality.language = variant.language
         AND quality.status = 'current'
        JOIN catalog_cards card ON card.id = variant.card_id
        JOIN price_observations observation ON observation.variant_id = variant.id
        GROUP BY variant.id, variant.condition, card.set_id
    )
    SELECT
        variant_dates.*,
        max(end_date) OVER (PARTITION BY condition) AS as_of
    FROM variant_dates;

    ANALYZE market_refresh_variants;

    CREATE TEMP TABLE market_refresh_movements ON COMMIT DROP AS
    SELECT
        requested_period.key AS period,
        variant.variant_id AS variant_id,
        variant.condition AS condition,
        variant.set_id AS set_id,
        variant.as_of AS as_of,
        start_point.observed_on AS start_date,
        variant.end_date AS end_date,
        start_point.price AS start_price,
        end_point.price AS end_price,
        movement.amount AS change_amount,
        movement.percent AS change_percent,
        observation_count.value AS observation_count,
        CASE
            WHEN observation_count.value < CASE requested_period.key
                WHEN '1d' THEN 2
                WHEN '1w' THEN 4
                WHEN '1m' THEN 15
                WHEN '1y' THEN 180
                WHEN 'all' THEN 180
            END THEN 'limited'
            WHEN abs(movement.percent) >= 50 THEN 'volatile'
            ELSE 'regular'
        END AS signal,
        now() AS refreshed_at
    FROM market_refresh_variants variant
    CROSS JOIN (
        VALUES
            ('1d'::text, 1),
            ('1w'::text, 7),
            ('1m'::text, 30),
            ('1y'::text, 365),
            ('all'::text, 0)
    ) AS requested_period(key, days)
    JOIN price_observations first_point
      ON first_point.variant_id = variant.variant_id
     AND first_point.observed_on = variant.first_date
    JOIN price_observations end_point
      ON end_point.variant_id = variant.variant_id
     AND end_point.observed_on = variant.end_date
    LEFT JOIN LATERAL (
        SELECT observation.observed_on, observation.price
        FROM price_observations observation
        WHERE requested_period.days > 0
          AND observation.variant_id = variant.variant_id
          AND observation.observed_on <= variant.as_of - requested_period.days
        ORDER BY observation.observed_on DESC
        LIMIT 1
    ) target_point ON true
    CROSS JOIN LATERAL (
        SELECT
            coalesce(target_point.observed_on, first_point.observed_on) AS observed_on,
            coalesce(target_point.price, first_point.price) AS price
    ) start_point
    CROSS JOIN LATERAL (
        SELECT
            round(end_point.price - start_point.price, 2) AS amount,
            round(
                round(end_point.price - start_point.price, 2)
                    / start_point.price * 100,
                2
            ) AS percent
    ) movement
    JOIN LATERAL (
        SELECT count(*)::integer AS value
        FROM price_observations observation
        WHERE observation.variant_id = variant.variant_id
          AND observation.observed_on BETWEEN start_point.observed_on AND variant.end_date
    ) observation_count ON true
    WHERE variant.end_date >= variant.as_of - 7
      AND variant.end_date > start_point.observed_on
      AND start_point.price > 0;

    ANALYZE market_refresh_movements;

    TRUNCATE market_variant_movements, market_snapshot_status;

    INSERT INTO market_snapshot_status (condition, as_of, refreshed_at)
    SELECT condition, max(as_of), now()
    FROM market_refresh_variants
    GROUP BY condition;

    INSERT INTO market_variant_movements (
        period,
        variant_id,
        condition,
        set_id,
        as_of,
        start_date,
        end_date,
        start_price,
        end_price,
        change_amount,
        change_percent,
        observation_count,
        signal,
        refreshed_at
    )
    SELECT
        period,
        variant_id,
        condition,
        set_id,
        as_of,
        start_date,
        end_date,
        start_price,
        end_price,
        change_amount,
        change_percent,
        observation_count,
        signal,
        refreshed_at
    FROM market_refresh_movements;

    ANALYZE market_variant_movements;
END;
$$;
-- +goose StatementEnd

SELECT refresh_market_variant_movements();

-- +goose Down
-- +goose StatementBegin
DROP FUNCTION refresh_market_variant_movements();
-- +goose StatementEnd
DROP TABLE market_variant_movements;
DROP TABLE market_snapshot_status;
