package watchlist

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/AdamWentworth/BinderLedger/internal/catalog"
	"github.com/AdamWentworth/BinderLedger/internal/market"
)

func (repository *Repository) cards(ctx context.Context, filter Filter) ([]Card, error) {
	rows, err := repository.db.Query(ctx, `
		SELECT
			item.id,
			card.id,
			card.name,
			card.number,
			catalog_set.id,
			catalog_set.name,
			coalesce(
				catalog_printing_image_url(
					card.id,
					item.edition,
					item.finish,
					item.language
				),
				card.image_url
			),
			item.edition,
			item.finish,
			item.language,
			selected.id,
			selected.printing,
			CASE
				WHEN $2 = 'Near Mint' AND fallback.amount IS NOT NULL
					THEN greatest(
						coalesce(quality.near_mint_price, fallback.amount),
						fallback.amount
					)
				WHEN (quality.status = 'unavailable' OR quality.reason IS NOT NULL)
					AND fallback.amount IS NOT NULL
					THEN fallback.amount
				ELSE CASE $2
					WHEN 'Damaged' THEN quality.damaged_price
					WHEN 'Heavily Played' THEN quality.heavily_played_price
					WHEN 'Moderately Played' THEN quality.moderately_played_price
					WHEN 'Lightly Played' THEN quality.lightly_played_price
					WHEN 'Near Mint' THEN quality.near_mint_price
				END
			END::double precision,
			CASE
				WHEN $2 = 'Near Mint'
					AND fallback.amount IS NOT NULL
					AND (quality.near_mint_price IS NULL OR fallback.amount > quality.near_mint_price)
					THEN 'ungraded_reference'
				WHEN $2 <> 'Near Mint'
					AND (quality.status = 'unavailable' OR quality.reason IS NOT NULL)
					AND fallback.amount IS NOT NULL
					THEN 'ungraded_reference'
				WHEN quality.status <> 'unavailable' THEN 'condition'
			END,
			quality.status,
			quality.as_of,
			quality.reason,
			start_point.price::double precision,
			end_point.price::double precision,
			start_point.observed_on,
			end_point.observed_on,
			coalesce(observation_count.value, 0)
		FROM watchlist_card_items item
		JOIN catalog_cards card ON card.id = item.card_id
		JOIN catalog_sets catalog_set ON catalog_set.id = card.set_id
		JOIN catalog_price_quality quality
		  ON quality.card_id = item.card_id
		 AND quality.edition = item.edition
		 AND quality.finish = item.finish
		 AND quality.language = item.language
		LEFT JOIN LATERAL (
			SELECT variant.id, variant.printing
			FROM catalog_card_variants variant
			WHERE variant.card_id = item.card_id
			  AND variant.edition = item.edition
			  AND variant.finish = item.finish
			  AND variant.language = item.language
			  AND variant.condition = $2
			ORDER BY variant.id
			LIMIT 1
		) selected ON true
		LEFT JOIN LATERAL (
			SELECT reference.amount
			FROM catalog_valuation_references reference
			WHERE reference.tcgplayer_product_id = card.tcgplayer_product_id
			  AND reference.edition = item.edition
			  AND reference.finish = item.finish
			  AND reference.language = item.language
			  AND reference.kind = 'ungraded'
			ORDER BY reference.checked_on DESC, reference.sort_order, reference.id
			LIMIT 1
		) fallback ON true
		LEFT JOIN LATERAL (
			SELECT observation.observed_on, observation.price
			FROM price_observations observation
			WHERE observation.variant_id = selected.id
			ORDER BY observation.observed_on DESC
			LIMIT 1
		) end_point ON true
		LEFT JOIN LATERAL (
			SELECT observation.observed_on, observation.price
			FROM price_observations observation
			WHERE observation.variant_id = selected.id
			  AND observation.observed_on <= end_point.observed_on
			ORDER BY
				CASE WHEN $3::integer = 0 THEN observation.observed_on END ASC,
				CASE
					WHEN $3::integer <> 0
					 AND observation.observed_on <= end_point.observed_on - $3::integer THEN 0
					ELSE 1
				END,
				CASE
					WHEN $3::integer <> 0
					 AND observation.observed_on <= end_point.observed_on - $3::integer
					THEN observation.observed_on
				END DESC,
				CASE WHEN $3::integer <> 0 THEN observation.observed_on END ASC
			LIMIT 1
		) start_point ON true
		LEFT JOIN LATERAL (
			SELECT count(*)::integer AS value
			FROM price_observations observation
			WHERE observation.variant_id = selected.id
			  AND observation.observed_on BETWEEN start_point.observed_on AND end_point.observed_on
		) observation_count ON true
		WHERE item.watchlist_id = $1
		ORDER BY item.added_at DESC, item.id DESC
	`, filter.WatchlistID, filter.Condition, filter.Period.Days)
	if err != nil {
		return nil, fmt.Errorf("query watched cards: %w", err)
	}
	defer rows.Close()

	cards := make([]Card, 0)
	for rows.Next() {
		var card Card
		var qualityAsOf *time.Time
		var startDate, endDate *time.Time
		if err := rows.Scan(
			&card.ItemID,
			&card.CardID,
			&card.CardName,
			&card.CardNumber,
			&card.SetID,
			&card.SetName,
			&card.ImageURL,
			&card.Edition,
			&card.Finish,
			&card.Language,
			&card.VariantID,
			&card.Printing,
			&card.CurrentPrice,
			&card.ValuationKind,
			&card.PriceQuality.Status,
			&qualityAsOf,
			&card.PriceQuality.Reason,
			&card.StartPrice,
			&card.EndPrice,
			&startDate,
			&endDate,
			&card.ObservationCount,
		); err != nil {
			return nil, fmt.Errorf("scan watched card: %w", err)
		}
		card.Condition = filter.Condition
		card.Signal = "limited"
		if qualityAsOf != nil {
			value := qualityAsOf.Format(time.DateOnly)
			card.PriceQuality.AsOf = &value
		}
		if hasTrustedConditionMovement(card.ValuationKind) {
			applyMovement(&card.PriceMovement, filter.Period, startDate, endDate)
		} else {
			card.VariantID = nil
			card.StartPrice = nil
			card.EndPrice = nil
			card.ObservationCount = 0
		}
		cards = append(cards, card)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read watched cards: %w", err)
	}
	return cards, nil
}

func hasTrustedConditionMovement(valuationKind *string) bool {
	return valuationKind != nil && *valuationKind == catalog.ValuationKindCondition
}

type setTargetRow struct {
	ItemID    int64
	SetID     string
	SetName   string
	SymbolURL *string
	Edition   string
}

func (repository *Repository) sets(ctx context.Context, filter Filter) ([]Set, error) {
	rows, err := repository.db.Query(ctx, `
		SELECT item.id, catalog_set.id, catalog_set.name, catalog_set.symbol_url, item.edition
		FROM watchlist_set_items item
		JOIN catalog_sets catalog_set ON catalog_set.id = item.set_id
		WHERE item.watchlist_id = $1
		ORDER BY item.added_at DESC, item.id DESC
	`, filter.WatchlistID)
	if err != nil {
		return nil, fmt.Errorf("query watched sets: %w", err)
	}
	defer rows.Close()

	targets := make([]setTargetRow, 0)
	for rows.Next() {
		var target setTargetRow
		if err := rows.Scan(
			&target.ItemID,
			&target.SetID,
			&target.SetName,
			&target.SymbolURL,
			&target.Edition,
		); err != nil {
			return nil, fmt.Errorf("scan watched set: %w", err)
		}
		targets = append(targets, target)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read watched sets: %w", err)
	}
	rows.Close()

	sets := make([]Set, 0, len(targets))
	for _, target := range targets {
		pricing, err := repository.catalog.SetPricing(ctx, catalog.SetPricingFilter{
			SetID:     target.SetID,
			Edition:   target.Edition,
			Condition: filter.Condition,
			Period:    filter.Period,
		})
		if err != nil {
			return nil, fmt.Errorf("price watched set %s: %w", target.SetID, err)
		}
		set := Set{
			ItemID:         target.ItemID,
			SetID:          target.SetID,
			SetName:        target.SetName,
			SymbolURL:      target.SymbolURL,
			Edition:        target.Edition,
			Condition:      filter.Condition,
			CardCount:      pricing.Summary.CardCount,
			PricedCards:    pricing.Summary.PricedCards,
			WarningCards:   pricing.Summary.WarningCards,
			EstimatedCards: pricing.Summary.EstimatedCards,
			PriceMovement:  PriceMovement{Signal: "limited"},
		}
		if pricing.Summary.PricedCards > 0 {
			currentValue := pricing.Summary.TotalValue
			set.CurrentValue = &currentValue
		}
		if len(pricing.Points) > 0 {
			set.ObservationCount = len(pricing.Points)
			set.StartPrice = &pricing.Points[0].Price
			set.EndPrice = &pricing.Points[len(pricing.Points)-1].Price
			set.StartDate = &pricing.Points[0].Date
			set.EndDate = &pricing.Points[len(pricing.Points)-1].Date
			if len(pricing.Points) > 1 && *set.StartPrice > 0 {
				movement := market.CalculateMovement(
					filter.Period,
					*set.StartPrice,
					*set.EndPrice,
					set.ObservationCount,
				)
				set.ChangeAmount = &movement.Amount
				set.ChangePercent = &movement.Percent
				set.Signal = movement.Signal
			}
		}
		sets = append(sets, set)
	}
	return sets, nil
}

func applyMovement(
	movement *PriceMovement,
	period market.Period,
	startDate, endDate *time.Time,
) {
	if startDate != nil {
		value := startDate.Format(time.DateOnly)
		movement.StartDate = &value
	}
	if endDate != nil {
		value := endDate.Format(time.DateOnly)
		movement.EndDate = &value
	}
	if movement.StartPrice == nil || movement.EndPrice == nil ||
		startDate == nil || endDate == nil || startDate.Equal(*endDate) || *movement.StartPrice <= 0 {
		return
	}
	calculated := market.CalculateMovement(
		period,
		*movement.StartPrice,
		*movement.EndPrice,
		movement.ObservationCount,
	)
	movement.ChangeAmount = &calculated.Amount
	movement.ChangePercent = &calculated.Percent
	movement.Signal = calculated.Signal
}

func summarize(cards []Card, sets []Set) Summary {
	summary := Summary{CardCount: len(cards), SetCount: len(sets)}
	for _, card := range cards {
		if card.CurrentPrice != nil {
			summary.PricedCardCount++
			summary.CurrentCardValue += *card.CurrentPrice
		}
		includeMovement(&summary, card.ChangePercent)
		if card.EndDate != nil && *card.EndDate > summary.AsOf {
			summary.AsOf = *card.EndDate
		}
	}
	for _, set := range sets {
		includeMovement(&summary, set.ChangePercent)
		if set.EndDate != nil && *set.EndDate > summary.AsOf {
			summary.AsOf = *set.EndDate
		}
	}
	summary.CurrentCardValue = math.Round(summary.CurrentCardValue*100) / 100
	return summary
}

func includeMovement(summary *Summary, change *float64) {
	if change == nil {
		return
	}
	switch {
	case *change > 0:
		summary.RisingItems++
	case *change < 0:
		summary.FallingItems++
	default:
		summary.UnchangedItems++
	}
}
