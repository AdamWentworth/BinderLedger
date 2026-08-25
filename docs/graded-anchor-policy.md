# Graded Anchor Policy

Reviewed: 2026-08-24

BinderLedger keeps JustTCG's five raw-condition prices as the main valuation
model. Graded PriceCharting references are a complementary snapshot for exact
printings where grade materially changes the card's value or where the raw
condition ladder is unreliable.

## Selection Rule

Collect manually reviewed graded anchors when at least one condition applies:

- Near Mint is approximately $150 or more.
- A card near or above $100 has a conflicting condition ladder.
- The printing is unusually grade-driven, scarce, or easy to confuse with an
  error or promotional variant.
- A nearby iconic printing is useful for comparing editions in the card UI.

Do not collect graded values for every card merely for completeness. Each
snapshot needs an exact PriceCharting title, card number, printing, embedded
TCGplayer product ID, source link, and review date.

## Priority Pass

The 2026-08-23 priority pass added an ungraded benchmark, Grades 1 through 9,
Grade 9.5, and PSA 10 for 27 exact holo printings:

| Group | Printings | Ungraded range | PSA 10 range |
| --- | ---: | ---: | ---: |
| Base Set Shadowless, no stamp | 11 | $34.24-$868.28 | $3,355.00-$30,100.00 |
| Base Set Unlimited | 7 | $18.98-$399.50 | $2,675.00-$20,061.40 |
| Jungle First Edition | 6 | $55.92-$219.26 | $5,710.26-$33,592.48 |
| Jungle Unlimited | 3 | $38.08-$59.75 | $1,975.90-$4,677.15 |

The Shadowless group is explicitly the ordinary no-stamp printing. Existing
First Edition Shadowless references remain separate. Jungle no-symbol errors
and other exception variants are also excluded from these regular printings.

## Red Cheeks Exception

The 2026-08-24 pass added exact-printing anchors for both Base Set Red Cheeks
Pikachu printings. First Edition uses a $369.00 ungraded benchmark and an
$18,739.05 PSA 10 benchmark; ordinary Shadowless uses $53.81 and $3,022.35.
Both include Grades 1 through 9, Grade 9.5, and PSA 10.

The First Edition JustTCG ladder conflicts at DMG/HP and LP/NM, so its ungraded
reference can serve as a corrective fallback under the normal valuation rule.
The Shadowless ladder remains primary because it is coherent. PriceCharting's
individual grade estimates are stored as reported even when sparse sales make
adjacent grades non-monotonic; BinderLedger does not interpolate them.

## Base Set 2 And Gym Pass

The 2026-08-24 pass added 23 reviewed PriceCharting ladders for 22 exact
printings from Base Set 2, Gym Heroes, and Gym Challenge. Each ladder contains
Ungraded, Grades 1 through 9, Grade 9.5, and PSA 10. The selection covers the
two Base Set 2 headliners and the Gym cards that cross the normal value,
condition-conflict, scarcity, or iconic-printing thresholds.

| Group | Exact printings | Source ladders |
| --- | ---: | ---: |
| Base Set 2 Unlimited | 2 | 2 |
| Gym Heroes | 5 | 5 |
| Gym Challenge | 15 | 16 |

Blaine's Charizard accounts for the extra source ladder. First Edition is the
energy-error printing. Unlimited has separately labeled `Corrected` and
`Energy Misprint` ladders in the card detail view. Only the corrected Unlimited
ladder is eligible to supply the catalog's fallback value, preventing the two
markets from being blended while preserving both for comparison.

PriceCharting references are dated valuation snapshots rather than a scheduled
feed. The UI must continue identifying and linking to the exact source page,
and the deployment remains private unless PriceCharting grants written
permission or the data is replaced.
