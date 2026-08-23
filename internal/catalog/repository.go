package catalog

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

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
	CardCount    int      `json:"cardCount"`
	VariantCount int      `json:"variantCount"`
	MinimumPrice *float64 `json:"minimumPrice"`
	MaximumPrice *float64 `json:"maximumPrice"`
}

type Variant struct {
	ID           string   `json:"id"`
	Printing     string   `json:"printing"`
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

func (repository *Repository) ListSets(ctx context.Context) ([]Set, error) {
	rows, err := repository.db.Query(ctx, `
		SELECT
			s.id,
			s.name,
			to_char(s.release_date, 'YYYY-MM-DD'),
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
			&set.CardCount,
			&set.VariantCount,
			&set.MinimumPrice,
			&set.MaximumPrice,
		); err != nil {
			return nil, fmt.Errorf("scan catalog set: %w", err)
		}
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
