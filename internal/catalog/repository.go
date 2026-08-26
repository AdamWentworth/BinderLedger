package catalog

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/AdamWentworth/BinderLedger/internal/market"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrEditionUnavailable = errors.New("edition is unavailable for this set")

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

type Set struct {
	ID                    string         `json:"id"`
	Name                  string         `json:"name"`
	ReleaseDate           *string        `json:"releaseDate"`
	LogoURL               *string        `json:"logoUrl"`
	SymbolURL             *string        `json:"symbolUrl"`
	Editions              []string       `json:"editions"`
	EditionPrintingCounts map[string]int `json:"editionPrintingCounts"`
	DeclaredCardCount     *int           `json:"declaredCardCount"`
	CardCount             int            `json:"cardCount"`
	PrintingCount         int            `json:"printingCount"`
	SharedCardCount       int            `json:"sharedCardCount"`
	SharedPrintingCount   int            `json:"sharedPrintingCount"`
	VariantCount          int            `json:"variantCount"`
	MinimumPrice          *float64       `json:"minimumPrice"`
	MaximumPrice          *float64       `json:"maximumPrice"`
}

type Variant struct {
	ID             string   `json:"id"`
	Printing       string   `json:"printing"`
	Edition        string   `json:"edition"`
	Finish         string   `json:"finish"`
	Condition      string   `json:"condition"`
	Language       string   `json:"language"`
	SourceProvider string   `json:"sourceProvider"`
	CurrentPrice   *float64 `json:"currentPrice"`
}

type Card struct {
	ID                 string    `json:"id"`
	Name               string    `json:"name"`
	Number             *string   `json:"number"`
	Rarity             *string   `json:"rarity"`
	TCGPlayerProductID *int64    `json:"tcgplayerProductId"`
	ImageURL           *string   `json:"imageUrl"`
	SetID              string    `json:"setId"`
	SetName            string    `json:"setName"`
	Variants           []Variant `json:"variants"`
}

type CardFilter struct {
	SetID  string
	Query  string
	Limit  int
	Offset int
}

type CardPage struct {
	Cards  []Card `json:"cards"`
	Total  int    `json:"total"`
	Limit  int    `json:"limit"`
	Offset int    `json:"offset"`
}

type ListingSort string

const (
	ListingSortSetNumber ListingSort = "set_number"
	ListingSortPriceHigh ListingSort = "price_desc"
	ListingSortPriceLow  ListingSort = "price_asc"
	ListingSortNameAZ    ListingSort = "name_asc"
	ListingSortNameZA    ListingSort = "name_desc"

	ValuationKindCondition         = "condition"
	ValuationKindUngradedReference = "ungraded_reference"
)

type Listing struct {
	ID                  string               `json:"id"`
	CardID              string               `json:"cardId"`
	Name                string               `json:"name"`
	Number              *string              `json:"number"`
	Rarity              *string              `json:"rarity"`
	TCGPlayerProductID  *int64               `json:"tcgplayerProductId"`
	ImageURL            *string              `json:"imageUrl"`
	SetID               string               `json:"setId"`
	SetName             string               `json:"setName"`
	Edition             string               `json:"edition"`
	Finish              string               `json:"finish"`
	Language            string               `json:"language"`
	SelectedVariantID   *string              `json:"selectedVariantId"`
	CurrentPrice        *float64             `json:"currentPrice"`
	ValuationKind       *string              `json:"valuationKind"`
	PriceQuality        PriceQuality         `json:"priceQuality"`
	Variants            []Variant            `json:"variants"`
	ValuationReferences []ValuationReference `json:"valuationReferences"`
	trustedDamaged      *float64
	trustedHP           *float64
	trustedMP           *float64
	trustedLP           *float64
	trustedNM           *float64
}

type PriceQuality struct {
	Status string  `json:"status"`
	AsOf   *string `json:"asOf"`
	Reason *string `json:"reason"`
}

type ValuationReference struct {
	ID              string   `json:"id"`
	Kind            string   `json:"kind"`
	Label           string   `json:"label"`
	Grader          *string  `json:"grader"`
	Grade           *string  `json:"grade"`
	Amount          *float64 `json:"amount"`
	Currency        string   `json:"currency"`
	SourceName      string   `json:"sourceName"`
	SourceURL       string   `json:"sourceUrl"`
	PrintingVariant string   `json:"printingVariant"`
	IsPrimary       bool     `json:"isPrimary"`
	CheckedOn       string   `json:"checkedOn"`
	Note            *string  `json:"note"`
}

type ListingFilter struct {
	SetID      string
	Query      string
	Edition    string
	Finish     string
	VariantID  string
	GradedOnly bool
	Condition  string
	Sort       ListingSort
	Limit      int
	Offset     int
}

type ListingPage struct {
	Listings []Listing      `json:"listings"`
	Total    int            `json:"total"`
	Limit    int            `json:"limit"`
	Offset   int            `json:"offset"`
	Pricing  PricingContext `json:"pricing"`
}

type PricingContext struct {
	Currency string  `json:"currency"`
	AsOf     *string `json:"asOf"`
}

type SetPricingFilter struct {
	SetID     string
	Edition   string
	Condition string
	Period    market.Period
}

type SetPriceSummary struct {
	TotalValue       float64  `json:"totalValue"`
	AveragePrice     float64  `json:"averagePrice"`
	MinimumPrice     *float64 `json:"minimumPrice"`
	MaximumPrice     *float64 `json:"maximumPrice"`
	PricedCards      int      `json:"pricedCards"`
	CurrentCards     int      `json:"currentCards"`
	HistoricalCards  int      `json:"historicalCards"`
	EstimatedCards   int      `json:"estimatedCards"`
	WarningCards     int      `json:"warningCards"`
	UnavailableCards int      `json:"unavailableCards"`
	CardCount        int      `json:"cardCount"`
	Complete         bool     `json:"complete"`
}

type SetPriceCard struct {
	ID            string        `json:"id"`
	Name          string        `json:"name"`
	Number        *string       `json:"number"`
	Rarity        *string       `json:"rarity"`
	ImageURL      *string       `json:"imageUrl"`
	VariantID     *string       `json:"variantId"`
	Printing      *string       `json:"printing"`
	Finish        *string       `json:"finish"`
	CurrentPrice  *float64      `json:"currentPrice"`
	ValuationKind *string       `json:"valuationKind"`
	PriceQuality  *PriceQuality `json:"priceQuality"`
}

type SetPricePoint struct {
	Date  string  `json:"date"`
	Price float64 `json:"price"`
}

type SetPricing struct {
	Set       Set             `json:"set"`
	Edition   string          `json:"edition"`
	Condition string          `json:"condition"`
	Period    string          `json:"period"`
	Summary   SetPriceSummary `json:"summary"`
	Cards     []SetPriceCard  `json:"cards"`
	Points    []SetPricePoint `json:"points"`
}

func (repository *Repository) ListSets(ctx context.Context) ([]Set, error) {
	rows, err := repository.db.Query(ctx, `
		SELECT
			s.id,
			s.name,
			to_char(s.release_date, 'YYYY-MM-DD'),
			s.logo_url,
			s.symbol_url,
			coalesce(array_agg(DISTINCT v.edition) FILTER (WHERE v.edition IS NOT NULL), '{}'),
			s.declared_card_count,
			count(DISTINCT c.id)::integer,
			count(DISTINCT (c.id, v.edition, v.finish, v.language))
				FILTER (WHERE v.id IS NOT NULL)::integer,
			coalesce((
				SELECT count(DISTINCT membership.card_id)::integer
				FROM catalog_set_printing_memberships membership
				WHERE membership.set_id = s.id
			), 0),
			coalesce((
				SELECT count(DISTINCT (
					membership.card_id,
					variant.finish,
					variant.language
				))::integer
				FROM catalog_set_printing_memberships membership
				JOIN catalog_card_variants variant
				  ON variant.card_id = membership.card_id
				 AND variant.edition = membership.printing_edition
				WHERE membership.set_id = s.id
			), 0),
			count(v.id)::integer,
			min(v.current_price)::double precision,
			max(v.current_price)::double precision
		FROM catalog_sets s
		LEFT JOIN catalog_cards c ON c.set_id = s.id
		LEFT JOIN catalog_card_variants v ON v.card_id = c.id
		GROUP BY s.id
		ORDER BY s.release_date NULLS LAST, s.display_order, s.name
	`)
	if err != nil {
		return nil, fmt.Errorf("query catalog sets: %w", err)
	}
	defer rows.Close()

	sets := make([]Set, 0)
	setIndex := make(map[string]int)
	for rows.Next() {
		var set Set
		if err := rows.Scan(
			&set.ID,
			&set.Name,
			&set.ReleaseDate,
			&set.LogoURL,
			&set.SymbolURL,
			&set.Editions,
			&set.DeclaredCardCount,
			&set.CardCount,
			&set.PrintingCount,
			&set.SharedCardCount,
			&set.SharedPrintingCount,
			&set.VariantCount,
			&set.MinimumPrice,
			&set.MaximumPrice,
		); err != nil {
			return nil, fmt.Errorf("scan catalog set: %w", err)
		}
		sortEditions(set.Editions)
		set.EditionPrintingCounts = make(map[string]int, len(set.Editions))
		setIndex[set.ID] = len(sets)
		sets = append(sets, set)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read catalog sets: %w", err)
	}
	rows.Close()

	editionRows, err := repository.db.Query(ctx, `
		WITH set_printings AS (
			SELECT
				card.set_id,
				variant.edition AS catalog_edition,
				card.id AS card_id,
				variant.finish,
				variant.language
			FROM catalog_cards card
			JOIN catalog_card_variants variant ON variant.card_id = card.id

			UNION

			SELECT
				membership.set_id,
				membership.catalog_edition,
				membership.card_id,
				variant.finish,
				variant.language
			FROM catalog_set_printing_memberships membership
			JOIN catalog_card_variants variant
			  ON variant.card_id = membership.card_id
			 AND variant.edition = membership.printing_edition
		)
		SELECT set_id, catalog_edition, count(*)::integer
		FROM set_printings
		GROUP BY set_id, catalog_edition
		ORDER BY set_id, catalog_edition
	`)
	if err != nil {
		return nil, fmt.Errorf("query catalog edition printing counts: %w", err)
	}
	defer editionRows.Close()
	for editionRows.Next() {
		var setID, edition string
		var count int
		if err := editionRows.Scan(&setID, &edition, &count); err != nil {
			return nil, fmt.Errorf("scan catalog edition printing count: %w", err)
		}
		if index, ok := setIndex[setID]; ok {
			sets[index].EditionPrintingCounts[edition] = count
		}
	}
	if err := editionRows.Err(); err != nil {
		return nil, fmt.Errorf("read catalog edition printing counts: %w", err)
	}
	return sets, nil
}

func (repository *Repository) ListCards(ctx context.Context, filter CardFilter) (CardPage, error) {
	filter.SetID = strings.TrimSpace(filter.SetID)
	filter.Query = strings.TrimSpace(filter.Query)

	var total int
	if err := repository.db.QueryRow(ctx, `
		SELECT count(*)::integer
		FROM catalog_cards c
		WHERE (
			$1 = ''
			OR c.set_id = $1
			OR EXISTS (
				SELECT 1
				FROM catalog_set_printing_memberships membership
				WHERE membership.set_id = $1
				  AND membership.card_id = c.id
			)
		)
		  AND ($2 = '' OR c.name ILIKE '%' || $2 || '%' OR c.number ILIKE '%' || $2 || '%')
	`, filter.SetID, filter.Query).Scan(&total); err != nil {
		return CardPage{}, fmt.Errorf("count catalog cards: %w", err)
	}

	rows, err := repository.db.Query(ctx, `
		SELECT
			c.id,
			c.name,
			c.number,
			c.rarity,
			c.tcgplayer_product_id,
			c.image_url,
			s.id,
			s.name
		FROM catalog_cards c
		JOIN catalog_sets s ON s.id = c.set_id
		WHERE (
			$1 = ''
			OR c.set_id = $1
			OR EXISTS (
				SELECT 1
				FROM catalog_set_printing_memberships membership
				WHERE membership.set_id = $1
				  AND membership.card_id = c.id
			)
		)
		  AND ($2 = '' OR c.name ILIKE '%' || $2 || '%' OR c.number ILIKE '%' || $2 || '%')
		ORDER BY s.release_date NULLS LAST, s.display_order, s.name, c.number_sort NULLS LAST, c.name
		LIMIT $3 OFFSET $4
	`, filter.SetID, filter.Query, filter.Limit, filter.Offset)
	if err != nil {
		return CardPage{}, fmt.Errorf("query catalog cards: %w", err)
	}
	defer rows.Close()

	cards := make([]Card, 0, filter.Limit)
	cardIndex := make(map[string]int, filter.Limit)
	cardIDs := make([]string, 0, filter.Limit)
	for rows.Next() {
		var card Card
		if err := rows.Scan(
			&card.ID,
			&card.Name,
			&card.Number,
			&card.Rarity,
			&card.TCGPlayerProductID,
			&card.ImageURL,
			&card.SetID,
			&card.SetName,
		); err != nil {
			return CardPage{}, fmt.Errorf("scan catalog card: %w", err)
		}
		card.Variants = make([]Variant, 0)
		cardIndex[card.ID] = len(cards)
		cardIDs = append(cardIDs, card.ID)
		cards = append(cards, card)
	}
	if err := rows.Err(); err != nil {
		return CardPage{}, fmt.Errorf("read catalog cards: %w", err)
	}

	if len(cardIDs) > 0 {
		variantRows, err := repository.db.Query(ctx, `
			SELECT
				card_id,
				id,
				printing,
				edition,
				finish,
				condition,
				language,
				source_provider,
				current_price::double precision
			FROM catalog_card_variants
			WHERE card_id = ANY($1)
			ORDER BY
				card_id,
				printing,
				CASE condition
					WHEN 'Near Mint' THEN 1
					WHEN 'Lightly Played' THEN 2
					WHEN 'Moderately Played' THEN 3
					WHEN 'Heavily Played' THEN 4
					WHEN 'Damaged' THEN 5
					ELSE 6
				END
		`, cardIDs)
		if err != nil {
			return CardPage{}, fmt.Errorf("query card variants: %w", err)
		}
		defer variantRows.Close()

		for variantRows.Next() {
			var cardID string
			var variant Variant
			if err := variantRows.Scan(
				&cardID,
				&variant.ID,
				&variant.Printing,
				&variant.Edition,
				&variant.Finish,
				&variant.Condition,
				&variant.Language,
				&variant.SourceProvider,
				&variant.CurrentPrice,
			); err != nil {
				return CardPage{}, fmt.Errorf("scan card variant: %w", err)
			}
			index, ok := cardIndex[cardID]
			if ok {
				cards[index].Variants = append(cards[index].Variants, variant)
			}
		}
		if err := variantRows.Err(); err != nil {
			return CardPage{}, fmt.Errorf("read card variants: %w", err)
		}
	}

	return CardPage{
		Cards:  cards,
		Total:  total,
		Limit:  filter.Limit,
		Offset: filter.Offset,
	}, nil
}

func ParseListingSort(value string) (ListingSort, bool) {
	sortValue := ListingSort(strings.TrimSpace(value))
	if sortValue == "" {
		return ListingSortSetNumber, true
	}
	switch sortValue {
	case ListingSortSetNumber, ListingSortPriceHigh, ListingSortPriceLow, ListingSortNameAZ, ListingSortNameZA:
		return sortValue, true
	default:
		return "", false
	}
}

func (repository *Repository) ListListings(ctx context.Context, filter ListingFilter) (ListingPage, error) {
	filter.SetID = strings.TrimSpace(filter.SetID)
	filter.Query = strings.TrimSpace(filter.Query)
	filter.Edition = strings.TrimSpace(filter.Edition)
	filter.Finish = strings.TrimSpace(filter.Finish)
	filter.VariantID = strings.TrimSpace(filter.VariantID)
	filter.Condition = strings.TrimSpace(filter.Condition)

	page := ListingPage{
		Listings: make([]Listing, 0, filter.Limit),
		Limit:    filter.Limit,
		Offset:   filter.Offset,
		Pricing: PricingContext{
			Currency: "USD",
		},
	}
	if err := repository.db.QueryRow(ctx, `
		SELECT to_char(max(observed_on), 'YYYY-MM-DD')
		FROM price_observations
	`).Scan(&page.Pricing.AsOf); err != nil {
		return ListingPage{}, fmt.Errorf("query catalog pricing context: %w", err)
	}

	rows, err := repository.db.Query(ctx, `
		WITH listings AS (
			SELECT
				c.id AS card_id,
				c.name,
				c.number,
				c.number_sort,
				c.rarity,
				c.tcgplayer_product_id,
				coalesce(
					catalog_printing_image_url(
						c.id,
						quality.edition,
						quality.finish,
						quality.language
					),
					c.image_url
				) AS image_url,
				s.id AS set_id,
				s.name AS set_name,
				s.release_date,
				s.display_order AS set_display_order,
				quality.edition,
				quality.finish,
				quality.language,
				selected.id AS selected_variant_id,
				CASE
					WHEN $5 = 'Near Mint' AND fallback.amount IS NOT NULL
						THEN greatest(
							coalesce(quality.near_mint_price, fallback.amount),
							fallback.amount
						)
					WHEN (quality.status = 'unavailable' OR quality.reason IS NOT NULL)
						AND fallback.amount IS NOT NULL
						THEN fallback.amount
					ELSE CASE $5
						WHEN 'Damaged' THEN quality.damaged_price
						WHEN 'Heavily Played' THEN quality.heavily_played_price
						WHEN 'Moderately Played' THEN quality.moderately_played_price
						WHEN 'Lightly Played' THEN quality.lightly_played_price
						WHEN 'Near Mint' THEN quality.near_mint_price
					END
				END::double precision AS current_price,
				CASE
					WHEN $5 = 'Near Mint'
						AND fallback.amount IS NOT NULL
						AND (quality.near_mint_price IS NULL OR fallback.amount > quality.near_mint_price)
						THEN 'ungraded_reference'
					WHEN $5 <> 'Near Mint'
						AND (quality.status = 'unavailable' OR quality.reason IS NOT NULL)
						AND fallback.amount IS NOT NULL
						THEN 'ungraded_reference'
					WHEN quality.status <> 'unavailable' THEN 'condition'
				END AS valuation_kind,
				quality.status AS price_status,
				to_char(quality.as_of, 'YYYY-MM-DD') AS price_as_of,
				quality.reason AS price_reason,
				quality.damaged_price::double precision,
				quality.heavily_played_price::double precision,
				quality.moderately_played_price::double precision,
				quality.lightly_played_price::double precision,
				quality.near_mint_price::double precision
			FROM catalog_price_quality quality
			JOIN catalog_cards c ON c.id = quality.card_id
			JOIN catalog_sets s ON s.id = c.set_id
			LEFT JOIN LATERAL (
				SELECT v.id
				FROM catalog_card_variants v
				WHERE v.card_id = quality.card_id
				  AND v.edition = quality.edition
				  AND v.finish = quality.finish
				  AND v.language = quality.language
				  AND v.condition = $5
				  AND ($10 = '' OR v.id = $10)
				ORDER BY v.id
				LIMIT 1
			) selected ON true
			LEFT JOIN LATERAL (
				SELECT reference.amount
				FROM catalog_valuation_references reference
				WHERE reference.tcgplayer_product_id = c.tcgplayer_product_id
				  AND reference.edition = quality.edition
				  AND reference.finish = quality.finish
				  AND reference.language = quality.language
				  AND reference.kind = 'ungraded'
				  AND reference.is_primary
				ORDER BY reference.checked_on DESC, reference.sort_order, reference.id
				LIMIT 1
			) fallback ON true
			WHERE (
				$1 = ''
				OR c.set_id = $1
				OR EXISTS (
					SELECT 1
					FROM catalog_set_printing_memberships membership
					WHERE membership.set_id = $1
					  AND membership.card_id = c.id
					  AND membership.printing_edition = quality.edition
					  AND ($3 = '' OR membership.catalog_edition = $3)
				)
			)
			  AND ($2 = '' OR c.name ILIKE '%' || $2 || '%' OR c.number ILIKE '%' || $2 || '%')
			  AND (
				$3 = ''
				OR quality.edition = $3
				OR EXISTS (
					SELECT 1
					FROM catalog_set_printing_memberships membership
					WHERE membership.set_id = $1
					  AND membership.card_id = c.id
					  AND membership.catalog_edition = $3
					  AND membership.printing_edition = quality.edition
				)
			)
			  AND ($4 = '' OR quality.finish = $4)
			  AND (
				$10 = ''
				OR EXISTS (
					SELECT 1
					FROM catalog_card_variants requested
					WHERE requested.id = $10
					  AND requested.card_id = quality.card_id
					  AND requested.edition = quality.edition
					  AND requested.finish = quality.finish
					  AND requested.language = quality.language
					  AND requested.condition = $5
				)
			  )
			  AND (
				NOT $6
				OR EXISTS (
					SELECT 1
					FROM catalog_valuation_references graded_reference
					WHERE graded_reference.tcgplayer_product_id = c.tcgplayer_product_id
					  AND graded_reference.edition = quality.edition
					  AND graded_reference.finish = quality.finish
					  AND graded_reference.language = quality.language
					  AND graded_reference.kind = 'graded'
				)
			  )
		)
		SELECT
			count(*) OVER()::integer,
			card_id,
			name,
			number,
			rarity,
			tcgplayer_product_id,
			image_url,
			set_id,
			set_name,
			edition,
			finish,
			language,
			selected_variant_id,
			current_price,
			valuation_kind,
			price_status,
			price_as_of,
			price_reason,
			damaged_price,
			heavily_played_price,
			moderately_played_price,
			lightly_played_price,
			near_mint_price
		FROM listings
		ORDER BY
			CASE WHEN $7 = 'price_desc' THEN current_price END DESC NULLS LAST,
			CASE WHEN $7 = 'price_asc' THEN current_price END ASC NULLS LAST,
			CASE WHEN $7 = 'name_asc' THEN lower(name) END ASC,
			CASE WHEN $7 = 'name_desc' THEN lower(name) END DESC,
			CASE WHEN $1 = '' THEN release_date END NULLS LAST,
			CASE WHEN $1 = '' THEN set_display_order END NULLS LAST,
			CASE WHEN $1 = '' THEN set_name END NULLS LAST,
			number_sort NULLS LAST,
			name,
			CASE edition WHEN 'First Edition' THEN 1 WHEN 'Shadowless' THEN 2 WHEN 'Unlimited' THEN 3 ELSE 4 END,
			finish,
			language
		LIMIT $8 OFFSET $9
	`, filter.SetID, filter.Query, filter.Edition, filter.Finish, filter.Condition, filter.GradedOnly, filter.Sort, filter.Limit, filter.Offset, filter.VariantID)
	if err != nil {
		return ListingPage{}, fmt.Errorf("query catalog listings: %w", err)
	}
	defer rows.Close()

	listingIndex := make(map[string]int, filter.Limit)
	cardIDs := make([]string, 0, filter.Limit)
	seenCardIDs := make(map[string]struct{}, filter.Limit)
	for rows.Next() {
		var listing Listing
		if err := rows.Scan(
			&page.Total,
			&listing.CardID,
			&listing.Name,
			&listing.Number,
			&listing.Rarity,
			&listing.TCGPlayerProductID,
			&listing.ImageURL,
			&listing.SetID,
			&listing.SetName,
			&listing.Edition,
			&listing.Finish,
			&listing.Language,
			&listing.SelectedVariantID,
			&listing.CurrentPrice,
			&listing.ValuationKind,
			&listing.PriceQuality.Status,
			&listing.PriceQuality.AsOf,
			&listing.PriceQuality.Reason,
			&listing.trustedDamaged,
			&listing.trustedHP,
			&listing.trustedMP,
			&listing.trustedLP,
			&listing.trustedNM,
		); err != nil {
			return ListingPage{}, fmt.Errorf("scan catalog listing: %w", err)
		}
		listing.ID = listingKey(listing.CardID, listing.Edition, listing.Finish, listing.Language)
		listing.Variants = make([]Variant, 0, 5)
		listing.ValuationReferences = make([]ValuationReference, 0)
		listingIndex[listing.ID] = len(page.Listings)
		if _, seen := seenCardIDs[listing.CardID]; !seen {
			seenCardIDs[listing.CardID] = struct{}{}
			cardIDs = append(cardIDs, listing.CardID)
		}
		page.Listings = append(page.Listings, listing)
	}
	if err := rows.Err(); err != nil {
		return ListingPage{}, fmt.Errorf("read catalog listings: %w", err)
	}

	if len(cardIDs) == 0 {
		return page, nil
	}

	variantRows, err := repository.db.Query(ctx, `
		SELECT
			card_id,
			id,
			printing,
			edition,
			finish,
			condition,
			language,
			source_provider,
			current_price::double precision
		FROM catalog_card_variants
		WHERE card_id = ANY($1)
		ORDER BY
			card_id,
			edition,
			finish,
			language,
			CASE condition
				WHEN 'Near Mint' THEN 1
				WHEN 'Lightly Played' THEN 2
				WHEN 'Moderately Played' THEN 3
				WHEN 'Heavily Played' THEN 4
				WHEN 'Damaged' THEN 5
				ELSE 6
			END
	`, cardIDs)
	if err != nil {
		return ListingPage{}, fmt.Errorf("query listing variants: %w", err)
	}
	defer variantRows.Close()

	for variantRows.Next() {
		var cardID string
		var variant Variant
		if err := variantRows.Scan(
			&cardID,
			&variant.ID,
			&variant.Printing,
			&variant.Edition,
			&variant.Finish,
			&variant.Condition,
			&variant.Language,
			&variant.SourceProvider,
			&variant.CurrentPrice,
		); err != nil {
			return ListingPage{}, fmt.Errorf("scan listing variant: %w", err)
		}
		index, ok := listingIndex[listingKey(cardID, variant.Edition, variant.Finish, variant.Language)]
		if ok {
			variant.CurrentPrice = trustedConditionPrice(page.Listings[index], variant.Condition)
			page.Listings[index].Variants = append(page.Listings[index].Variants, variant)
		}
	}
	if err := variantRows.Err(); err != nil {
		return ListingPage{}, fmt.Errorf("read listing variants: %w", err)
	}

	if err := repository.attachValuationReferences(ctx, cardIDs, listingIndex, page.Listings); err != nil {
		return ListingPage{}, err
	}

	return page, nil
}

func (repository *Repository) attachValuationReferences(
	ctx context.Context,
	cardIDs []string,
	listingIndex map[string]int,
	listings []Listing,
) error {
	rows, err := repository.db.Query(ctx, `
		SELECT
			card.id,
			reference.edition,
			reference.finish,
			reference.language,
			reference.id,
			reference.kind,
			reference.label,
			reference.grader,
			reference.grade,
			reference.amount::double precision,
			reference.currency,
			reference.source_name,
			reference.source_url,
			reference.printing_variant,
			reference.is_primary,
			to_char(reference.checked_on, 'YYYY-MM-DD'),
			reference.note
		FROM catalog_valuation_references reference
		JOIN catalog_cards card
		  ON card.tcgplayer_product_id = reference.tcgplayer_product_id
		WHERE card.id = ANY($1)
		ORDER BY
			reference.is_primary DESC,
			reference.printing_variant,
			reference.kind DESC,
			reference.sort_order,
			reference.label
	`, cardIDs)
	if err != nil {
		return fmt.Errorf("query listing valuation references: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var cardID, edition, finish, language string
		var reference ValuationReference
		if err := rows.Scan(
			&cardID,
			&edition,
			&finish,
			&language,
			&reference.ID,
			&reference.Kind,
			&reference.Label,
			&reference.Grader,
			&reference.Grade,
			&reference.Amount,
			&reference.Currency,
			&reference.SourceName,
			&reference.SourceURL,
			&reference.PrintingVariant,
			&reference.IsPrimary,
			&reference.CheckedOn,
			&reference.Note,
		); err != nil {
			return fmt.Errorf("scan listing valuation reference: %w", err)
		}
		index, ok := listingIndex[listingKey(cardID, edition, finish, language)]
		if ok {
			listings[index].ValuationReferences = append(listings[index].ValuationReferences, reference)
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("read listing valuation references: %w", err)
	}
	return nil
}

func listingKey(cardID, edition, finish, language string) string {
	return strings.Join([]string{cardID, edition, finish, language}, ":")
}

func trustedConditionPrice(listing Listing, condition string) *float64 {
	switch condition {
	case "Damaged":
		return listing.trustedDamaged
	case "Heavily Played":
		return listing.trustedHP
	case "Moderately Played":
		return listing.trustedMP
	case "Lightly Played":
		return listing.trustedLP
	case "Near Mint":
		return listing.trustedNM
	default:
		return nil
	}
}

func (repository *Repository) SetPricing(ctx context.Context, filter SetPricingFilter) (SetPricing, error) {
	filter.SetID = strings.TrimSpace(filter.SetID)
	filter.Edition = strings.TrimSpace(filter.Edition)
	filter.Condition = strings.TrimSpace(filter.Condition)

	pricing := SetPricing{
		Condition: filter.Condition,
		Period:    filter.Period.Key,
		Cards:     make([]SetPriceCard, 0),
		Points:    make([]SetPricePoint, 0),
	}
	if err := repository.db.QueryRow(ctx, `
		SELECT
			s.id,
			s.name,
			to_char(s.release_date, 'YYYY-MM-DD'),
			s.logo_url,
			s.symbol_url,
			s.declared_card_count,
			count(DISTINCT c.id)::integer,
			count(DISTINCT (c.id, v.edition, v.finish, v.language))
				FILTER (WHERE v.id IS NOT NULL)::integer,
			coalesce((
				SELECT count(DISTINCT membership.card_id)::integer
				FROM catalog_set_printing_memberships membership
				WHERE membership.set_id = s.id
			), 0),
			coalesce((
				SELECT count(DISTINCT (
					membership.card_id,
					variant.finish,
					variant.language
				))::integer
				FROM catalog_set_printing_memberships membership
				JOIN catalog_card_variants variant
				  ON variant.card_id = membership.card_id
				 AND variant.edition = membership.printing_edition
				WHERE membership.set_id = s.id
			), 0),
			count(v.id)::integer,
			min(v.current_price)::double precision,
			max(v.current_price)::double precision,
			coalesce(array_agg(DISTINCT v.edition) FILTER (WHERE v.edition IS NOT NULL), '{}')
		FROM catalog_sets s
		LEFT JOIN catalog_cards c ON c.set_id = s.id
		LEFT JOIN catalog_card_variants v ON v.card_id = c.id
		WHERE s.id = $1
		GROUP BY s.id
	`, filter.SetID).Scan(
		&pricing.Set.ID,
		&pricing.Set.Name,
		&pricing.Set.ReleaseDate,
		&pricing.Set.LogoURL,
		&pricing.Set.SymbolURL,
		&pricing.Set.DeclaredCardCount,
		&pricing.Set.CardCount,
		&pricing.Set.PrintingCount,
		&pricing.Set.SharedCardCount,
		&pricing.Set.SharedPrintingCount,
		&pricing.Set.VariantCount,
		&pricing.Set.MinimumPrice,
		&pricing.Set.MaximumPrice,
		&pricing.Set.Editions,
	); err != nil {
		return SetPricing{}, fmt.Errorf("query catalog set: %w", err)
	}
	sortEditions(pricing.Set.Editions)

	if filter.Edition == "" {
		filter.Edition = defaultEdition(pricing.Set.Editions)
	}
	if !contains(pricing.Set.Editions, filter.Edition) {
		return SetPricing{}, ErrEditionUnavailable
	}
	pricing.Edition = filter.Edition

	rows, err := repository.db.Query(ctx, `
		SELECT
			c.id,
			c.name,
			c.number,
			c.rarity,
			coalesce(selected.image_url, c.image_url),
			selected.id,
			selected.printing,
			selected.finish,
			selected.current_price::double precision,
			selected.valuation_kind,
			selected.price_status,
			selected.price_as_of,
			selected.price_reason
		FROM catalog_cards c
		LEFT JOIN LATERAL (
			SELECT
				variant.id,
				variant.printing,
				quality.finish,
				catalog_printing_image_url(
					quality.card_id,
					quality.edition,
					quality.finish,
					quality.language
				) AS image_url,
				CASE
					WHEN $3 = 'Near Mint' AND fallback.amount IS NOT NULL
						THEN greatest(
							coalesce(quality.near_mint_price, fallback.amount),
							fallback.amount
						)
					WHEN (quality.status = 'unavailable' OR quality.reason IS NOT NULL)
						AND fallback.amount IS NOT NULL
						THEN fallback.amount
					ELSE CASE $3
						WHEN 'Damaged' THEN quality.damaged_price
						WHEN 'Heavily Played' THEN quality.heavily_played_price
						WHEN 'Moderately Played' THEN quality.moderately_played_price
						WHEN 'Lightly Played' THEN quality.lightly_played_price
						WHEN 'Near Mint' THEN quality.near_mint_price
					END
				END AS current_price,
				CASE
					WHEN $3 = 'Near Mint'
						AND fallback.amount IS NOT NULL
						AND (quality.near_mint_price IS NULL OR fallback.amount > quality.near_mint_price)
						THEN 'ungraded_reference'
					WHEN $3 <> 'Near Mint'
						AND (quality.status = 'unavailable' OR quality.reason IS NOT NULL)
						AND fallback.amount IS NOT NULL
						THEN 'ungraded_reference'
					WHEN quality.status <> 'unavailable' THEN 'condition'
				END AS valuation_kind,
				quality.status AS price_status,
				to_char(quality.as_of, 'YYYY-MM-DD') AS price_as_of,
				quality.reason AS price_reason
			FROM catalog_price_quality quality
			LEFT JOIN LATERAL (
				SELECT v.id, v.printing
				FROM catalog_card_variants v
				WHERE v.card_id = quality.card_id
				  AND v.edition = quality.edition
				  AND v.finish = quality.finish
				  AND v.language = quality.language
				  AND v.condition = $3
				ORDER BY v.id
				LIMIT 1
				) variant ON true
				LEFT JOIN LATERAL (
					SELECT reference.amount
					FROM catalog_valuation_references reference
					WHERE reference.tcgplayer_product_id = c.tcgplayer_product_id
					  AND reference.edition = quality.edition
					  AND reference.finish = quality.finish
					  AND reference.language = quality.language
					  AND reference.kind = 'ungraded'
					  AND reference.is_primary
					ORDER BY reference.checked_on DESC, reference.sort_order, reference.id
					LIMIT 1
				) fallback ON true
			WHERE quality.card_id = c.id
			  AND (
				(c.set_id = $1 AND quality.edition = $2)
				OR EXISTS (
					SELECT 1
					FROM catalog_set_printing_memberships membership
					WHERE membership.set_id = $1
					  AND membership.card_id = c.id
					  AND membership.catalog_edition = $2
					  AND membership.printing_edition = quality.edition
				)
			  )
			ORDER BY
				CASE quality.finish
					WHEN 'Normal' THEN 1
					WHEN 'Holofoil' THEN 2
					WHEN 'Reverse Holofoil' THEN 3
					ELSE 4
				END,
				quality.language
			LIMIT 1
		) selected ON true
		WHERE c.set_id = $1
		   OR EXISTS (
			SELECT 1
			FROM catalog_set_printing_memberships membership
			WHERE membership.set_id = $1
			  AND membership.card_id = c.id
			  AND membership.catalog_edition = $2
		   )
		ORDER BY c.number_sort NULLS LAST, c.name
	`, filter.SetID, filter.Edition, filter.Condition)
	if err != nil {
		return SetPricing{}, fmt.Errorf("query set card prices: %w", err)
	}
	defer rows.Close()

	var total float64
	var minimum, maximum *float64
	for rows.Next() {
		var card SetPriceCard
		var qualityStatus *string
		var qualityAsOf *string
		var qualityReason *string
		if err := rows.Scan(
			&card.ID,
			&card.Name,
			&card.Number,
			&card.Rarity,
			&card.ImageURL,
			&card.VariantID,
			&card.Printing,
			&card.Finish,
			&card.CurrentPrice,
			&card.ValuationKind,
			&qualityStatus,
			&qualityAsOf,
			&qualityReason,
		); err != nil {
			return SetPricing{}, fmt.Errorf("scan set card price: %w", err)
		}
		if qualityStatus != nil {
			card.PriceQuality = &PriceQuality{
				Status: *qualityStatus,
				AsOf:   qualityAsOf,
				Reason: qualityReason,
			}
			if qualityReason != nil {
				pricing.Summary.WarningCards++
			}
			if card.ValuationKind != nil && *card.ValuationKind == ValuationKindUngradedReference {
				pricing.Summary.EstimatedCards++
			} else {
				switch *qualityStatus {
				case "current":
					pricing.Summary.CurrentCards++
				case "historical":
					pricing.Summary.HistoricalCards++
				case "unavailable":
					pricing.Summary.UnavailableCards++
				}
			}
		} else {
			pricing.Summary.UnavailableCards++
		}
		pricing.Cards = append(pricing.Cards, card)
		if card.CurrentPrice != nil {
			total += *card.CurrentPrice
			pricing.Summary.PricedCards++
			if minimum == nil || *card.CurrentPrice < *minimum {
				value := *card.CurrentPrice
				minimum = &value
			}
			if maximum == nil || *card.CurrentPrice > *maximum {
				value := *card.CurrentPrice
				maximum = &value
			}
		}
	}
	if err := rows.Err(); err != nil {
		return SetPricing{}, fmt.Errorf("read set card prices: %w", err)
	}

	pricing.Summary.CardCount = len(pricing.Cards)
	pricing.Summary.TotalValue = roundMoney(total)
	pricing.Summary.MinimumPrice = minimum
	pricing.Summary.MaximumPrice = maximum
	pricing.Summary.Complete = pricing.Summary.CardCount > 0 && pricing.Summary.PricedCards == pricing.Summary.CardCount
	if pricing.Summary.PricedCards > 0 {
		pricing.Summary.AveragePrice = roundMoney(total / float64(pricing.Summary.PricedCards))
	}

	if pricing.Summary.CardCount > 0 {
		points, err := repository.setPriceHistory(ctx, filter)
		if err != nil {
			return SetPricing{}, err
		}
		pricing.Points = points
	}

	return pricing, nil
}

func (repository *Repository) setPriceHistory(ctx context.Context, filter SetPricingFilter) ([]SetPricePoint, error) {
	rows, err := repository.db.Query(ctx, `
		WITH selected_printings AS (
			SELECT DISTINCT ON (quality.card_id)
				quality.card_id,
				quality.edition,
				quality.finish,
				quality.language
			FROM catalog_price_quality quality
			JOIN catalog_cards card ON card.id = quality.card_id
			WHERE (
				(card.set_id = $1 AND quality.edition = $2)
				OR EXISTS (
					SELECT 1
					FROM catalog_set_printing_memberships membership
					WHERE membership.set_id = $1
					  AND membership.card_id = card.id
					  AND membership.catalog_edition = $2
					  AND membership.printing_edition = quality.edition
				)
			)
			ORDER BY
				quality.card_id,
				CASE quality.finish
					WHEN 'Normal' THEN 1
					WHEN 'Holofoil' THEN 2
					WHEN 'Reverse Holofoil' THEN 3
					ELSE 4
				END,
				quality.language
		), daily_snapshots AS (
			SELECT
				selected.card_id,
				observation.observed_on,
				max(observation.price) FILTER (WHERE variant.condition = 'Damaged') AS damaged_price,
				max(observation.price) FILTER (WHERE variant.condition = 'Heavily Played') AS heavily_played_price,
				max(observation.price) FILTER (WHERE variant.condition = 'Moderately Played') AS moderately_played_price,
				max(observation.price) FILTER (WHERE variant.condition = 'Lightly Played') AS lightly_played_price,
				max(observation.price) FILTER (WHERE variant.condition = 'Near Mint') AS near_mint_price
			FROM selected_printings selected
			JOIN catalog_card_variants variant
			  ON variant.card_id = selected.card_id
			 AND variant.edition = selected.edition
			 AND variant.finish = selected.finish
			 AND variant.language = selected.language
			JOIN price_observations observation ON observation.variant_id = variant.id
			GROUP BY selected.card_id, observation.observed_on
		), selected_snapshots AS (
			SELECT
				card_id,
				observed_on,
				CASE $3
					WHEN 'Damaged' THEN damaged_price
					WHEN 'Heavily Played' THEN heavily_played_price
					WHEN 'Moderately Played' THEN moderately_played_price
					WHEN 'Lightly Played' THEN lightly_played_price
					WHEN 'Near Mint' THEN near_mint_price
				END AS selected_price
			FROM daily_snapshots
		), expected AS (
			SELECT count(*)::integer AS card_count
			FROM selected_printings selected
			WHERE EXISTS (
				SELECT 1
				FROM catalog_card_variants variant
				JOIN price_observations observation ON observation.variant_id = variant.id
				WHERE variant.card_id = selected.card_id
				  AND variant.edition = selected.edition
				  AND variant.finish = selected.finish
				  AND variant.language = selected.language
				  AND variant.condition = $3
			)
		), set_daily AS (
			SELECT
				selected.observed_on,
				sum(selected.selected_price)::double precision AS total_value
			FROM selected_snapshots selected
			WHERE selected.selected_price IS NOT NULL
			GROUP BY selected.observed_on
			HAVING count(*) = (SELECT card_count FROM expected)
		), bounds AS (
			SELECT min(observed_on) AS first_on, max(observed_on) AS as_of
			FROM set_daily
		)
		SELECT daily.observed_on, daily.total_value
		FROM set_daily daily
		CROSS JOIN bounds
		WHERE $4::integer = 0
		   OR daily.observed_on >= greatest(bounds.first_on, bounds.as_of - $4::integer)
		ORDER BY daily.observed_on
	`, filter.SetID, filter.Edition, filter.Condition, filter.Period.Days)
	if err != nil {
		return nil, fmt.Errorf("query set price history: %w", err)
	}
	defer rows.Close()

	points := make([]SetPricePoint, 0)
	for rows.Next() {
		var day time.Time
		var point SetPricePoint
		if err := rows.Scan(&day, &point.Price); err != nil {
			return nil, fmt.Errorf("scan set price history: %w", err)
		}
		point.Date = day.Format(time.DateOnly)
		point.Price = roundMoney(point.Price)
		points = append(points, point)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read set price history: %w", err)
	}
	return points, nil
}

func sortEditions(editions []string) {
	order := map[string]int{
		"First Edition": 1,
		"Shadowless":    2,
		"Unlimited":     3,
	}
	sort.Slice(editions, func(i, j int) bool {
		if editions[i] == editions[j] {
			return false
		}
		iOrder, iKnown := order[editions[i]]
		jOrder, jKnown := order[editions[j]]
		if iKnown && jKnown {
			return iOrder < jOrder
		}
		if iKnown != jKnown {
			return iKnown
		}
		return editions[i] < editions[j]
	})
}

func defaultEdition(editions []string) string {
	if contains(editions, "Unlimited") {
		return "Unlimited"
	}
	if len(editions) > 0 {
		return editions[0]
	}
	return ""
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func roundMoney(value float64) float64 {
	return math.Round(value*100) / 100
}
