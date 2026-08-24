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
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	ReleaseDate  *string  `json:"releaseDate"`
	LogoURL      *string  `json:"logoUrl"`
	SymbolURL    *string  `json:"symbolUrl"`
	Editions     []string `json:"editions"`
	CardCount    int      `json:"cardCount"`
	VariantCount int      `json:"variantCount"`
	MinimumPrice *float64 `json:"minimumPrice"`
	MaximumPrice *float64 `json:"maximumPrice"`
}

type Variant struct {
	ID           string   `json:"id"`
	Printing     string   `json:"printing"`
	Edition      string   `json:"edition"`
	Finish       string   `json:"finish"`
	Condition    string   `json:"condition"`
	Language     string   `json:"language"`
	CurrentPrice *float64 `json:"currentPrice"`
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
)

type Listing struct {
	ID                 string    `json:"id"`
	CardID             string    `json:"cardId"`
	Name               string    `json:"name"`
	Number             *string   `json:"number"`
	Rarity             *string   `json:"rarity"`
	TCGPlayerProductID *int64    `json:"tcgplayerProductId"`
	ImageURL           *string   `json:"imageUrl"`
	SetID              string    `json:"setId"`
	SetName            string    `json:"setName"`
	Edition            string    `json:"edition"`
	Finish             string    `json:"finish"`
	Language           string    `json:"language"`
	SelectedVariantID  *string   `json:"selectedVariantId"`
	CurrentPrice       *float64  `json:"currentPrice"`
	Variants           []Variant `json:"variants"`
}

type ListingFilter struct {
	SetID     string
	Query     string
	Edition   string
	Finish    string
	Condition string
	Sort      ListingSort
	Limit     int
	Offset    int
}

type ListingPage struct {
	Listings []Listing `json:"listings"`
	Total    int       `json:"total"`
	Limit    int       `json:"limit"`
	Offset   int       `json:"offset"`
}

type SetPricingFilter struct {
	SetID     string
	Edition   string
	Condition string
	Period    market.Period
}

type SetPriceSummary struct {
	TotalValue   float64  `json:"totalValue"`
	AveragePrice float64  `json:"averagePrice"`
	MinimumPrice *float64 `json:"minimumPrice"`
	MaximumPrice *float64 `json:"maximumPrice"`
	PricedCards  int      `json:"pricedCards"`
	CardCount    int      `json:"cardCount"`
	Complete     bool     `json:"complete"`
}

type SetPriceCard struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Number       *string  `json:"number"`
	Rarity       *string  `json:"rarity"`
	ImageURL     *string  `json:"imageUrl"`
	VariantID    *string  `json:"variantId"`
	Printing     *string  `json:"printing"`
	Finish       *string  `json:"finish"`
	CurrentPrice *float64 `json:"currentPrice"`
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
			count(DISTINCT c.id)::integer,
			count(v.id)::integer,
			min(v.current_price)::double precision,
			max(v.current_price)::double precision
		FROM catalog_sets s
		LEFT JOIN catalog_cards c ON c.set_id = s.id
		LEFT JOIN catalog_card_variants v ON v.card_id = c.id
		GROUP BY s.id
		ORDER BY s.release_date NULLS LAST, s.name
	`)
	if err != nil {
		return nil, fmt.Errorf("query catalog sets: %w", err)
	}
	defer rows.Close()

	sets := make([]Set, 0)
	for rows.Next() {
		var set Set
		if err := rows.Scan(
			&set.ID,
			&set.Name,
			&set.ReleaseDate,
			&set.LogoURL,
			&set.SymbolURL,
			&set.Editions,
			&set.CardCount,
			&set.VariantCount,
			&set.MinimumPrice,
			&set.MaximumPrice,
		); err != nil {
			return nil, fmt.Errorf("scan catalog set: %w", err)
		}
		sortEditions(set.Editions)
		sets = append(sets, set)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read catalog sets: %w", err)
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
		WHERE ($1 = '' OR c.set_id = $1)
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
		WHERE ($1 = '' OR c.set_id = $1)
		  AND ($2 = '' OR c.name ILIKE '%' || $2 || '%' OR c.number ILIKE '%' || $2 || '%')
		ORDER BY s.release_date NULLS LAST, s.name, c.number_sort NULLS LAST, c.name
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
	filter.Condition = strings.TrimSpace(filter.Condition)

	rows, err := repository.db.Query(ctx, `
		WITH printings AS (
			SELECT DISTINCT card_id, edition, finish, language
			FROM catalog_card_variants
		), listings AS (
			SELECT
				c.id AS card_id,
				c.name,
				c.number,
				c.number_sort,
				c.rarity,
				c.tcgplayer_product_id,
				c.image_url,
				s.id AS set_id,
				s.name AS set_name,
				s.release_date,
				p.edition,
				p.finish,
				p.language,
				selected.id AS selected_variant_id,
				selected.current_price::double precision AS current_price
			FROM printings p
			JOIN catalog_cards c ON c.id = p.card_id
			JOIN catalog_sets s ON s.id = c.set_id
			LEFT JOIN LATERAL (
				SELECT v.id, v.current_price
				FROM catalog_card_variants v
				WHERE v.card_id = p.card_id
				  AND v.edition = p.edition
				  AND v.finish = p.finish
				  AND v.language = p.language
				  AND v.condition = $5
				ORDER BY v.id
				LIMIT 1
			) selected ON true
			WHERE ($1 = '' OR c.set_id = $1)
			  AND ($2 = '' OR c.name ILIKE '%' || $2 || '%' OR c.number ILIKE '%' || $2 || '%')
			  AND ($3 = '' OR p.edition = $3)
			  AND ($4 = '' OR p.finish = $4)
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
			current_price
		FROM listings
		ORDER BY
			CASE WHEN $6 = 'price_desc' THEN current_price END DESC NULLS LAST,
			CASE WHEN $6 = 'price_asc' THEN current_price END ASC NULLS LAST,
			CASE WHEN $6 = 'name_asc' THEN lower(name) END ASC,
			CASE WHEN $6 = 'name_desc' THEN lower(name) END DESC,
			release_date NULLS LAST,
			set_name,
			number_sort NULLS LAST,
			name,
			CASE edition WHEN 'Unlimited' THEN 1 WHEN 'First Edition' THEN 2 ELSE 3 END,
			finish,
			language
		LIMIT $7 OFFSET $8
	`, filter.SetID, filter.Query, filter.Edition, filter.Finish, filter.Condition, filter.Sort, filter.Limit, filter.Offset)
	if err != nil {
		return ListingPage{}, fmt.Errorf("query catalog listings: %w", err)
	}
	defer rows.Close()

	page := ListingPage{
		Listings: make([]Listing, 0, filter.Limit),
		Limit:    filter.Limit,
		Offset:   filter.Offset,
	}
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
		); err != nil {
			return ListingPage{}, fmt.Errorf("scan catalog listing: %w", err)
		}
		listing.ID = listingKey(listing.CardID, listing.Edition, listing.Finish, listing.Language)
		listing.Variants = make([]Variant, 0, 5)
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
			&variant.CurrentPrice,
		); err != nil {
			return ListingPage{}, fmt.Errorf("scan listing variant: %w", err)
		}
		index, ok := listingIndex[listingKey(cardID, variant.Edition, variant.Finish, variant.Language)]
		if ok {
			page.Listings[index].Variants = append(page.Listings[index].Variants, variant)
		}
	}
	if err := variantRows.Err(); err != nil {
		return ListingPage{}, fmt.Errorf("read listing variants: %w", err)
	}

	return page, nil
}

func listingKey(cardID, edition, finish, language string) string {
	return strings.Join([]string{cardID, edition, finish, language}, ":")
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
			count(DISTINCT c.id)::integer,
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
		&pricing.Set.CardCount,
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
			c.image_url,
			selected.id,
			selected.printing,
			selected.finish,
			selected.current_price::double precision
		FROM catalog_cards c
		LEFT JOIN LATERAL (
			SELECT v.id, v.printing, v.finish, v.current_price
			FROM catalog_card_variants v
			WHERE v.card_id = c.id
			  AND v.edition = $2
			  AND v.condition = $3
			ORDER BY
				CASE v.finish
					WHEN 'Normal' THEN 1
					WHEN 'Holofoil' THEN 2
					WHEN 'Reverse Holofoil' THEN 3
					ELSE 4
				END,
				v.id
			LIMIT 1
		) selected ON true
		WHERE c.set_id = $1
		ORDER BY c.number_sort NULLS LAST, c.name
	`, filter.SetID, filter.Edition, filter.Condition)
	if err != nil {
		return SetPricing{}, fmt.Errorf("query set card prices: %w", err)
	}
	defer rows.Close()

	variantIDs := make([]string, 0, pricing.Set.CardCount)
	var total float64
	var minimum, maximum *float64
	for rows.Next() {
		var card SetPriceCard
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
		); err != nil {
			return SetPricing{}, fmt.Errorf("scan set card price: %w", err)
		}
		pricing.Cards = append(pricing.Cards, card)
		if card.CurrentPrice != nil {
			if card.VariantID != nil {
				variantIDs = append(variantIDs, *card.VariantID)
			}
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

	if len(variantIDs) > 0 {
		points, err := repository.setPriceHistory(ctx, variantIDs, filter.Period)
		if err != nil {
			return SetPricing{}, err
		}
		pricing.Points = points
	}

	return pricing, nil
}

func (repository *Repository) setPriceHistory(ctx context.Context, variantIDs []string, period market.Period) ([]SetPricePoint, error) {
	rows, err := repository.db.Query(ctx, `
		WITH bounds AS (
			SELECT min(observed_on) AS first_on, max(observed_on) AS as_of
			FROM price_observations
			WHERE variant_id = ANY($1)
		), dates AS (
			SELECT generate_series(
				CASE
					WHEN $2::integer = 0 THEN first_on
					ELSE greatest(first_on, as_of - $2::integer)
				END,
				as_of,
				interval '1 day'
			)::date AS day
			FROM bounds
			WHERE first_on IS NOT NULL AND as_of IS NOT NULL
		), selected AS (
			SELECT unnest($1::text[]) AS variant_id
		), daily AS (
			SELECT
				d.day,
				count(price.price)::integer AS priced_variants,
				sum(price.price)::double precision AS total_value
			FROM dates d
			CROSS JOIN selected s
			LEFT JOIN LATERAL (
				SELECT o.price
				FROM price_observations o
				WHERE o.variant_id = s.variant_id
				  AND o.observed_on <= d.day
				ORDER BY o.observed_on DESC
				LIMIT 1
			) price ON true
			GROUP BY d.day
		)
		SELECT day, total_value
		FROM daily
		WHERE priced_variants = cardinality($1::text[])
		ORDER BY day
	`, variantIDs, period.Days)
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
	sort.Slice(editions, func(i, j int) bool {
		if editions[i] == editions[j] {
			return false
		}
		if editions[i] == "Unlimited" {
			return true
		}
		if editions[j] == "Unlimited" {
			return false
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
