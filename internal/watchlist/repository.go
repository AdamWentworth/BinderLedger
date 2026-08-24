package watchlist

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/AdamWentworth/BinderLedger/internal/catalog"
	"github.com/AdamWentworth/BinderLedger/internal/market"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrWatchlistNotFound   = errors.New("watchlist was not found")
	ErrCardPrintingMissing = errors.New("card printing was not found")
	ErrSetEditionMissing   = errors.New("set edition was not found")
)

type Repository struct {
	db      *pgxpool.Pool
	catalog *catalog.Repository
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db, catalog: catalog.NewRepository(db)}
}

type Filter struct {
	WatchlistID string
	Condition   string
	Period      market.Period
}

type PriceMovement struct {
	StartPrice       *float64 `json:"startPrice"`
	EndPrice         *float64 `json:"endPrice"`
	ChangeAmount     *float64 `json:"changeAmount"`
	ChangePercent    *float64 `json:"changePercent"`
	StartDate        *string  `json:"startDate"`
	EndDate          *string  `json:"endDate"`
	ObservationCount int      `json:"observationCount"`
	Signal           string   `json:"signal"`
}

type Card struct {
	ItemID        int64                `json:"itemId"`
	CardID        string               `json:"cardId"`
	CardName      string               `json:"cardName"`
	CardNumber    *string              `json:"cardNumber"`
	SetID         string               `json:"setId"`
	SetName       string               `json:"setName"`
	ImageURL      *string              `json:"imageUrl"`
	Edition       string               `json:"edition"`
	Finish        string               `json:"finish"`
	Language      string               `json:"language"`
	VariantID     *string              `json:"variantId"`
	Printing      *string              `json:"printing"`
	Condition     string               `json:"condition"`
	CurrentPrice  *float64             `json:"currentPrice"`
	ValuationKind *string              `json:"valuationKind"`
	PriceQuality  catalog.PriceQuality `json:"priceQuality"`
	PriceMovement
}

type Set struct {
	ItemID         int64    `json:"itemId"`
	SetID          string   `json:"setId"`
	SetName        string   `json:"setName"`
	SymbolURL      *string  `json:"symbolUrl"`
	Edition        string   `json:"edition"`
	Condition      string   `json:"condition"`
	CurrentValue   *float64 `json:"currentValue"`
	CardCount      int      `json:"cardCount"`
	PricedCards    int      `json:"pricedCards"`
	WarningCards   int      `json:"warningCards"`
	EstimatedCards int      `json:"estimatedCards"`
	PriceMovement
}

type Summary struct {
	AsOf             string  `json:"asOf"`
	CardCount        int     `json:"cardCount"`
	SetCount         int     `json:"setCount"`
	PricedCardCount  int     `json:"pricedCardCount"`
	CurrentCardValue float64 `json:"currentCardValue"`
	RisingItems      int     `json:"risingItems"`
	FallingItems     int     `json:"fallingItems"`
	UnchangedItems   int     `json:"unchangedItems"`
}

type Overview struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Period    string  `json:"period"`
	Condition string  `json:"condition"`
	Summary   Summary `json:"summary"`
	Cards     []Card  `json:"cards"`
	Sets      []Set   `json:"sets"`
}

type CardTarget struct {
	CardID   string `json:"cardId"`
	Edition  string `json:"edition"`
	Finish   string `json:"finish"`
	Language string `json:"language"`
}

type CardMembership struct {
	ItemID int64 `json:"itemId"`
	CardTarget
}

type SetTarget struct {
	SetID   string `json:"setId"`
	Edition string `json:"edition"`
}

type SetMembership struct {
	ItemID int64 `json:"itemId"`
	SetTarget
}

type Memberships struct {
	ID    string           `json:"id"`
	Cards []CardMembership `json:"cards"`
	Sets  []SetMembership  `json:"sets"`
}

func (repository *Repository) Memberships(
	ctx context.Context,
	watchlistID string,
) (Memberships, error) {
	if ok, err := repository.exists(ctx, watchlistID); err != nil {
		return Memberships{}, err
	} else if !ok {
		return Memberships{}, ErrWatchlistNotFound
	}

	memberships := Memberships{
		ID:    watchlistID,
		Cards: make([]CardMembership, 0),
		Sets:  make([]SetMembership, 0),
	}
	cardRows, err := repository.db.Query(ctx, `
		SELECT id, card_id, edition, finish, language
		FROM watchlist_card_items
		WHERE watchlist_id = $1
		ORDER BY added_at DESC, id DESC
	`, watchlistID)
	if err != nil {
		return Memberships{}, fmt.Errorf("query watched card memberships: %w", err)
	}
	defer cardRows.Close()
	for cardRows.Next() {
		var membership CardMembership
		if err := cardRows.Scan(
			&membership.ItemID,
			&membership.CardID,
			&membership.Edition,
			&membership.Finish,
			&membership.Language,
		); err != nil {
			return Memberships{}, fmt.Errorf("scan watched card membership: %w", err)
		}
		memberships.Cards = append(memberships.Cards, membership)
	}
	if err := cardRows.Err(); err != nil {
		return Memberships{}, fmt.Errorf("read watched card memberships: %w", err)
	}
	cardRows.Close()

	setRows, err := repository.db.Query(ctx, `
		SELECT id, set_id, edition
		FROM watchlist_set_items
		WHERE watchlist_id = $1
		ORDER BY added_at DESC, id DESC
	`, watchlistID)
	if err != nil {
		return Memberships{}, fmt.Errorf("query watched set memberships: %w", err)
	}
	defer setRows.Close()
	for setRows.Next() {
		var membership SetMembership
		if err := setRows.Scan(
			&membership.ItemID,
			&membership.SetID,
			&membership.Edition,
		); err != nil {
			return Memberships{}, fmt.Errorf("scan watched set membership: %w", err)
		}
		memberships.Sets = append(memberships.Sets, membership)
	}
	if err := setRows.Err(); err != nil {
		return Memberships{}, fmt.Errorf("read watched set memberships: %w", err)
	}
	return memberships, nil
}

func (repository *Repository) Overview(ctx context.Context, filter Filter) (Overview, error) {
	filter.WatchlistID = strings.TrimSpace(filter.WatchlistID)
	var overview Overview
	if err := repository.db.QueryRow(ctx, `
		SELECT id, name
		FROM watchlists
		WHERE id = $1
	`, filter.WatchlistID).Scan(&overview.ID, &overview.Name); errors.Is(err, pgx.ErrNoRows) {
		return Overview{}, ErrWatchlistNotFound
	} else if err != nil {
		return Overview{}, fmt.Errorf("query watchlist: %w", err)
	}

	overview.Period = filter.Period.Key
	overview.Condition = filter.Condition
	overview.Cards = make([]Card, 0)
	overview.Sets = make([]Set, 0)

	cards, err := repository.cards(ctx, filter)
	if err != nil {
		return Overview{}, err
	}
	overview.Cards = cards

	sets, err := repository.sets(ctx, filter)
	if err != nil {
		return Overview{}, err
	}
	overview.Sets = sets
	overview.Summary = summarize(cards, sets)
	return overview, nil
}

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

func (repository *Repository) AddCard(
	ctx context.Context,
	watchlistID string,
	target CardTarget,
) (CardMembership, bool, error) {
	if ok, err := repository.exists(ctx, watchlistID); err != nil {
		return CardMembership{}, false, err
	} else if !ok {
		return CardMembership{}, false, ErrWatchlistNotFound
	}

	var membership CardMembership
	err := repository.db.QueryRow(ctx, `
		INSERT INTO watchlist_card_items (watchlist_id, card_id, edition, finish, language)
		SELECT $1, $2, $3, $4, $5
		WHERE EXISTS (
			SELECT 1
			FROM catalog_price_quality quality
			WHERE quality.card_id = $2
			  AND quality.edition = $3
			  AND quality.finish = $4
			  AND quality.language = $5
		)
		ON CONFLICT (watchlist_id, card_id, edition, finish, language) DO NOTHING
		RETURNING id, card_id, edition, finish, language
	`, watchlistID, target.CardID, target.Edition, target.Finish, target.Language).Scan(
		&membership.ItemID,
		&membership.CardID,
		&membership.Edition,
		&membership.Finish,
		&membership.Language,
	)
	if err == nil {
		return membership, true, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return CardMembership{}, false, fmt.Errorf("add watched card: %w", err)
	}

	err = repository.db.QueryRow(ctx, `
		SELECT id, card_id, edition, finish, language
		FROM watchlist_card_items
		WHERE watchlist_id = $1
		  AND card_id = $2
		  AND edition = $3
		  AND finish = $4
		  AND language = $5
	`, watchlistID, target.CardID, target.Edition, target.Finish, target.Language).Scan(
		&membership.ItemID,
		&membership.CardID,
		&membership.Edition,
		&membership.Finish,
		&membership.Language,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return CardMembership{}, false, ErrCardPrintingMissing
	}
	if err != nil {
		return CardMembership{}, false, fmt.Errorf("query watched card: %w", err)
	}
	return membership, false, nil
}

func (repository *Repository) RemoveCard(
	ctx context.Context,
	watchlistID string,
	itemID int64,
) (bool, error) {
	result, err := repository.db.Exec(ctx, `
		DELETE FROM watchlist_card_items
		WHERE watchlist_id = $1 AND id = $2
	`, watchlistID, itemID)
	if err != nil {
		return false, fmt.Errorf("remove watched card: %w", err)
	}
	return result.RowsAffected() == 1, nil
}

func (repository *Repository) AddSet(
	ctx context.Context,
	watchlistID string,
	target SetTarget,
) (SetMembership, bool, error) {
	if ok, err := repository.exists(ctx, watchlistID); err != nil {
		return SetMembership{}, false, err
	} else if !ok {
		return SetMembership{}, false, ErrWatchlistNotFound
	}

	var membership SetMembership
	err := repository.db.QueryRow(ctx, `
		INSERT INTO watchlist_set_items (watchlist_id, set_id, edition)
		SELECT $1, $2, $3
		WHERE EXISTS (
			SELECT 1
			FROM catalog_sets catalog_set
			WHERE catalog_set.id = $2
			  AND (
				EXISTS (
					SELECT 1
					FROM catalog_cards card
					JOIN catalog_price_quality quality ON quality.card_id = card.id
					WHERE card.set_id = catalog_set.id
					  AND quality.edition = $3
				)
				OR EXISTS (
					SELECT 1
					FROM catalog_set_printing_memberships membership
					WHERE membership.set_id = catalog_set.id
					  AND membership.catalog_edition = $3
				)
			  )
		)
		ON CONFLICT (watchlist_id, set_id, edition) DO NOTHING
		RETURNING id, set_id, edition
	`, watchlistID, target.SetID, target.Edition).Scan(
		&membership.ItemID,
		&membership.SetID,
		&membership.Edition,
	)
	if err == nil {
		return membership, true, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return SetMembership{}, false, fmt.Errorf("add watched set: %w", err)
	}

	err = repository.db.QueryRow(ctx, `
		SELECT id, set_id, edition
		FROM watchlist_set_items
		WHERE watchlist_id = $1 AND set_id = $2 AND edition = $3
	`, watchlistID, target.SetID, target.Edition).Scan(
		&membership.ItemID,
		&membership.SetID,
		&membership.Edition,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return SetMembership{}, false, ErrSetEditionMissing
	}
	if err != nil {
		return SetMembership{}, false, fmt.Errorf("query watched set: %w", err)
	}
	return membership, false, nil
}

func (repository *Repository) RemoveSet(
	ctx context.Context,
	watchlistID string,
	itemID int64,
) (bool, error) {
	result, err := repository.db.Exec(ctx, `
		DELETE FROM watchlist_set_items
		WHERE watchlist_id = $1 AND id = $2
	`, watchlistID, itemID)
	if err != nil {
		return false, fmt.Errorf("remove watched set: %w", err)
	}
	return result.RowsAffected() == 1, nil
}

func (repository *Repository) exists(ctx context.Context, watchlistID string) (bool, error) {
	var exists bool
	if err := repository.db.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM watchlists WHERE id = $1)
	`, watchlistID).Scan(&exists); err != nil {
		return false, fmt.Errorf("check watchlist: %w", err)
	}
	return exists, nil
}
