# Graded Price Monitoring

Reviewed: 2026-08-24

BinderLedger records manually reviewed PriceCharting values as append-only
observations. The goal is to measure how often these estimates move before
paying for automated API access, not to reproduce PriceCharting's dataset.

Migrations `00016_valuation_observations.sql` and
`00021_gym_graded_anchors.sql` seed one baseline observation for every
valuation reference using its original `checked_on` date. The baseline
contains 984 reference observations across 81 exact card printings;
979 currently have numeric prices and five record an unavailable grade. The 81
printings correspond to 82 source ladders because corrected and energy-error
Unlimited Blaine's Charizard are monitored independently.

## Monthly Review

Divide the 82 source ladders into four stable cohorts of roughly 20 ladders. Review
one cohort each week so every tracked printing is checked approximately once
per month. High-value corrective anchors may be checked more often when their
stored condition prices are known to conflict.

Each review is manual:

1. Open the exact stored `source_url` and confirm the printing title and card
   number.
2. Record Ungraded, Grades 1 through 9, Grade 9.5, and PSA 10 exactly as shown.
3. Record the complete snapshot even when every value is unchanged.
4. Keep snapshot JSON under the ignored `data/` directory.
5. Import it with `go run ./cmd/record-valuation-snapshot -input <path>`.

The importer requires every stored label, rejects unknown labels and prices
with more than two decimal places, and refuses to replace a different
observation already recorded for the same date. Recording is transactional:
the history rows and current card-detail anchors either all update or none do.

Example input shape:

```json
{
  "observedOn": "2026-09-24",
  "sourceUrl": "https://www.pricecharting.com/game/pokemon-base-set/example-card-1",
  "values": {
    "Ungraded": 0.00,
    "Grade 1": 0.00,
    "Grade 2": 0.00,
    "Grade 3": 0.00,
    "Grade 4": 0.00,
    "Grade 5": 0.00,
    "Grade 6": 0.00,
    "Grade 7": 0.00,
    "Grade 8": 0.00,
    "Grade 9": 0.00,
    "Grade 9.5": 0.00,
    "PSA 10": 0.00
  }
}
```

Replace every zero and the example URL with the reviewed source values. Do not
use this example itself as an import. Use `null` when the exact source reports
that a grade is unavailable.

## Volatility Report

This query compares every observation with the preceding check:

```sql
WITH changes AS (
    SELECT
        reference.source_url,
        reference.edition,
        reference.label,
        observation.observed_on,
        observation.amount,
        lag(observation.amount) OVER (
            PARTITION BY observation.valuation_reference_id
            ORDER BY observation.observed_on
        ) AS previous_amount
    FROM catalog_valuation_observations observation
    JOIN catalog_valuation_references reference
      ON reference.id = observation.valuation_reference_id
    WHERE reference.source_name = 'PriceCharting'
)
SELECT
    source_url,
    edition,
    label,
    observed_on,
    previous_amount,
    amount,
    round(
        100 * (amount - previous_amount) / nullif(previous_amount, 0),
        2
    ) AS change_percent
FROM changes
WHERE previous_amount IS NOT NULL
ORDER BY observed_on DESC, source_url, label;
```

After two or three complete monthly cycles, compare the percentage of values
that changed, median absolute change, and frequency of changes above 2%. That
evidence determines whether monthly manual checks remain sufficient.
