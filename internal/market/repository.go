package market

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

type Period struct {
	Key  string
	Days int
}

func ParsePeriod(value string) (Period, bool) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "1m":
		return Period{Key: "1m", Days: 30}, true
	case "1d":
		return Period{Key: "1d", Days: 1}, true
	case "1w":
		return Period{Key: "1w", Days: 7}, true
	case "1y":
		return Period{Key: "1y", Days: 365}, true
	case "all":
		return Period{Key: "all", Days: 0}, true
	default:
		return Period{}, false
	}
}

type OverviewFilter struct {
	Period    Period
	Condition string
	SetID     string
	Limit     int
	Rank      string
}

type Summary struct {
	AsOf                string  `json:"asOf"`
	EvaluatedVariants   int     `json:"evaluatedVariants"`
	RisingVariants      int     `json:"risingVariants"`
	FallingVariants     int     `json:"fallingVariants"`
	UnchangedVariants   int     `json:"unchangedVariants"`
	MedianChangeAmount  float64 `json:"medianChangeAmount"`
	MedianChangePercent float64 `json:"medianChangePercent"`
}

type Mover struct {
	VariantID        string  `json:"variantId"`
	CardID           string  `json:"cardId"`
	CardName         string  `json:"cardName"`
	CardNumber       *string `json:"cardNumber"`
	SetID            string  `json:"setId"`
	SetName          string  `json:"setName"`
	SetLogoURL       *string `json:"setLogoUrl"`
	SetSymbolURL     *string `json:"setSymbolUrl"`
	ImageURL         *string `json:"imageUrl"`
	Printing         string  `json:"printing"`
	Condition        string  `json:"condition"`
	StartPrice       float64 `json:"startPrice"`
	EndPrice         float64 `json:"endPrice"`
	ChangeAmount     float64 `json:"changeAmount"`
	ChangePercent    float64 `json:"changePercent"`
	StartDate        string  `json:"startDate"`
	EndDate          string  `json:"endDate"`
	ObservationCount int     `json:"observationCount"`
	Signal           string  `json:"signal"`
}

type SetMovement struct {
	SetID         string  `json:"setId"`
	SetName       string  `json:"setName"`
	LogoURL       *string `json:"logoUrl"`
	SymbolURL     *string `json:"symbolUrl"`
	StartValue    float64 `json:"startValue"`
	EndValue      float64 `json:"endValue"`
	ChangeAmount  float64 `json:"changeAmount"`
	ChangePercent float64 `json:"changePercent"`
	VariantCount  int     `json:"variantCount"`
}

type Overview struct {
	Period    string        `json:"period"`
	Condition string        `json:"condition"`
	Rank      string        `json:"rank"`
	Summary   Summary       `json:"summary"`
	Sets      []SetMovement `json:"sets"`
	Gainers   []Mover       `json:"gainers"`
	Losers    []Mover       `json:"losers"`
}

func ParseRank(value string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "amount":
		return "amount", true
	case "percent":
		return "percent", true
	default:
		return "", false
	}
}

type PricePoint struct {
	Date  string  `json:"date"`
	Price float64 `json:"price"`
}

type Movement struct {
	Amount  float64
	Percent float64
	Signal  string
}

func CalculateMovement(period Period, startPrice, endPrice float64, observations int) Movement {
	amount := roundMoney(endPrice - startPrice)
	percent := 0.0
	if startPrice > 0 {
		percent = roundPercent(amount / startPrice * 100)
	}
	return Movement{
		Amount:  amount,
		Percent: percent,
		Signal:  historySignal(period, observations, percent),
	}
}

type VariantHistory struct {
	VariantID     string       `json:"variantId"`
	CardID        string       `json:"cardId"`
	CardName      string       `json:"cardName"`
	CardNumber    *string      `json:"cardNumber"`
	SetID         string       `json:"setId"`
	SetName       string       `json:"setName"`
	ImageURL      *string      `json:"imageUrl"`
	Printing      string       `json:"printing"`
	Condition     string       `json:"condition"`
	Period        string       `json:"period"`
	StartPrice    *float64     `json:"startPrice"`
	EndPrice      *float64     `json:"endPrice"`
	ChangeAmount  *float64     `json:"changeAmount"`
	ChangePercent *float64     `json:"changePercent"`
	Signal        string       `json:"signal"`
	Points        []PricePoint `json:"points"`
}

func (repository *Repository) Overview(ctx context.Context, filter OverviewFilter) (Overview, error) {
	filter.SetID = strings.TrimSpace(filter.SetID)
	if rank, ok := ParseRank(filter.Rank); ok {
		filter.Rank = rank
	} else {
		filter.Rank = "amount"
	}

	var asOf *time.Time
	if err := repository.db.QueryRow(ctx, `
		SELECT max(as_of)
		FROM market_snapshot_status
		WHERE condition = $1
	`, filter.Condition).Scan(&asOf); err != nil {
		return Overview{}, fmt.Errorf("query market date: %w", err)
	}

	overview := Overview{
		Period:    filter.Period.Key,
		Condition: filter.Condition,
		Rank:      filter.Rank,
		Sets:      make([]SetMovement, 0),
		Gainers:   make([]Mover, 0),
		Losers:    make([]Mover, 0),
	}
	if asOf == nil {
		return overview, nil
	}
	overview.Summary.AsOf = asOf.Format(time.DateOnly)

	rows, err := repository.db.Query(ctx, `
		SELECT
			v.id,
			c.id,
			c.name,
			c.number,
			s.id,
			s.name,
			s.logo_url,
			s.symbol_url,
			coalesce(
				catalog_printing_image_url(c.id, v.edition, v.finish, v.language),
				c.image_url
			),
			v.printing,
			movement.condition,
			movement.start_date,
			movement.start_price::double precision,
			movement.end_date,
			movement.end_price::double precision,
			movement.change_amount::double precision,
			movement.change_percent::double precision,
			movement.observation_count,
			movement.signal
		FROM market_variant_movements movement
		JOIN catalog_card_variants v ON v.id = movement.variant_id
		JOIN catalog_cards c ON c.id = v.card_id
		JOIN catalog_sets s ON s.id = c.set_id
		WHERE movement.period = $1
		  AND movement.condition = $2
		  AND ($3 = '' OR movement.set_id = $3)
	`, filter.Period.Key, filter.Condition, filter.SetID)
	if err != nil {
		return Overview{}, fmt.Errorf("query market movement: %w", err)
	}
	defer rows.Close()

	movers := make([]Mover, 0)
	for rows.Next() {
		var mover Mover
		var startDate time.Time
		var endDate time.Time
		if err := rows.Scan(
			&mover.VariantID,
			&mover.CardID,
			&mover.CardName,
			&mover.CardNumber,
			&mover.SetID,
			&mover.SetName,
			&mover.SetLogoURL,
			&mover.SetSymbolURL,
			&mover.ImageURL,
			&mover.Printing,
			&mover.Condition,
			&startDate,
			&mover.StartPrice,
			&endDate,
			&mover.EndPrice,
			&mover.ChangeAmount,
			&mover.ChangePercent,
			&mover.ObservationCount,
			&mover.Signal,
		); err != nil {
			return Overview{}, fmt.Errorf("scan market movement: %w", err)
		}
		mover.StartDate = startDate.Format(time.DateOnly)
		mover.EndDate = endDate.Format(time.DateOnly)
		movers = append(movers, mover)
	}
	if err := rows.Err(); err != nil {
		return Overview{}, fmt.Errorf("read market movement: %w", err)
	}

	overview.Summary = summarize(asOf.Format(time.DateOnly), movers)
	overview.Sets = summarizeSets(movers, filter.Rank)

	sort.Slice(movers, func(i, j int) bool {
		if filter.Rank == "percent" {
			return movers[i].ChangePercent > movers[j].ChangePercent
		}
		return movers[i].ChangeAmount > movers[j].ChangeAmount
	})
	for _, mover := range movers {
		if mover.ChangePercent > 0 && len(overview.Gainers) < filter.Limit {
			overview.Gainers = append(overview.Gainers, mover)
		}
	}
	sort.Slice(movers, func(i, j int) bool {
		if filter.Rank == "percent" {
			return movers[i].ChangePercent < movers[j].ChangePercent
		}
		return movers[i].ChangeAmount < movers[j].ChangeAmount
	})
	for _, mover := range movers {
		if mover.ChangePercent < 0 && len(overview.Losers) < filter.Limit {
			overview.Losers = append(overview.Losers, mover)
		}
	}

	return overview, nil
}

func (repository *Repository) VariantHistory(ctx context.Context, variantID string, period Period) (VariantHistory, error) {
	var history VariantHistory
	var asOf *time.Time
	err := repository.db.QueryRow(ctx, `
		SELECT
			v.id,
			c.id,
			c.name,
			c.number,
			s.id,
			s.name,
			coalesce(
				catalog_printing_image_url(c.id, v.edition, v.finish, v.language),
				c.image_url
			),
			v.printing,
			v.condition,
			max(o.observed_on)
		FROM catalog_card_variants v
		JOIN catalog_cards c ON c.id = v.card_id
		JOIN catalog_sets s ON s.id = c.set_id
		LEFT JOIN price_observations o ON o.variant_id = v.id
		WHERE v.id = $1
		GROUP BY v.id, c.id, s.id
	`, variantID).Scan(
		&history.VariantID,
		&history.CardID,
		&history.CardName,
		&history.CardNumber,
		&history.SetID,
		&history.SetName,
		&history.ImageURL,
		&history.Printing,
		&history.Condition,
		&asOf,
	)
	if err != nil {
		return VariantHistory{}, err
	}

	history.Period = period.Key
	history.Points = make([]PricePoint, 0)
	if asOf == nil {
		history.Signal = "limited"
		return history, nil
	}

	var startDate *time.Time
	if period.Days > 0 {
		if err := repository.db.QueryRow(ctx, `
			SELECT coalesce(
				(SELECT max(observed_on) FROM price_observations WHERE variant_id = $1 AND observed_on <= $2::date - $3::integer),
				(SELECT min(observed_on) FROM price_observations WHERE variant_id = $1)
			)
		`, variantID, asOf.Format(time.DateOnly), period.Days).Scan(&startDate); err != nil {
			return VariantHistory{}, fmt.Errorf("query history start: %w", err)
		}
	}

	rows, err := repository.db.Query(ctx, `
		SELECT observed_on, price::double precision
		FROM price_observations
		WHERE variant_id = $1
		  AND ($2::date IS NULL OR observed_on >= $2::date)
		ORDER BY observed_on
	`, variantID, startDate)
	if err != nil {
		return VariantHistory{}, fmt.Errorf("query variant history: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var point PricePoint
		var date time.Time
		if err := rows.Scan(&date, &point.Price); err != nil {
			return VariantHistory{}, fmt.Errorf("scan variant history: %w", err)
		}
		point.Date = date.Format(time.DateOnly)
		history.Points = append(history.Points, point)
	}
	if err := rows.Err(); err != nil {
		return VariantHistory{}, fmt.Errorf("read variant history: %w", err)
	}

	if len(history.Points) > 0 {
		startPrice := history.Points[0].Price
		endPrice := history.Points[len(history.Points)-1].Price
		movement := CalculateMovement(period, startPrice, endPrice, len(history.Points))
		history.StartPrice = &startPrice
		history.EndPrice = &endPrice
		history.ChangeAmount = &movement.Amount
		if startPrice > 0 {
			history.ChangePercent = &movement.Percent
			history.Signal = movement.Signal
		} else {
			history.Signal = "limited"
		}
	} else {
		history.Signal = "limited"
	}

	return history, nil
}

func summarize(asOf string, movers []Mover) Summary {
	summary := Summary{AsOf: asOf, EvaluatedVariants: len(movers)}
	amounts := make([]float64, 0, len(movers))
	percents := make([]float64, 0, len(movers))
	for _, mover := range movers {
		amounts = append(amounts, mover.ChangeAmount)
		percents = append(percents, mover.ChangePercent)
		switch {
		case mover.ChangePercent > 0:
			summary.RisingVariants++
		case mover.ChangePercent < 0:
			summary.FallingVariants++
		default:
			summary.UnchangedVariants++
		}
	}
	if len(percents) == 0 {
		return summary
	}
	sort.Float64s(amounts)
	sort.Float64s(percents)
	middle := len(percents) / 2
	if len(percents)%2 == 0 {
		summary.MedianChangeAmount = roundMoney((amounts[middle-1] + amounts[middle]) / 2)
		summary.MedianChangePercent = roundPercent((percents[middle-1] + percents[middle]) / 2)
	} else {
		summary.MedianChangeAmount = amounts[middle]
		summary.MedianChangePercent = percents[middle]
	}
	return summary
}

func summarizeSets(movers []Mover, rank string) []SetMovement {
	bySet := make(map[string]*SetMovement)
	for _, mover := range movers {
		set := bySet[mover.SetID]
		if set == nil {
			set = &SetMovement{
				SetID:     mover.SetID,
				SetName:   mover.SetName,
				LogoURL:   mover.SetLogoURL,
				SymbolURL: mover.SetSymbolURL,
			}
			bySet[mover.SetID] = set
		}
		set.StartValue += mover.StartPrice
		set.EndValue += mover.EndPrice
		set.VariantCount++
	}

	sets := make([]SetMovement, 0, len(bySet))
	for _, set := range bySet {
		set.StartValue = roundMoney(set.StartValue)
		set.EndValue = roundMoney(set.EndValue)
		set.ChangeAmount = roundMoney(set.EndValue - set.StartValue)
		if set.StartValue > 0 {
			set.ChangePercent = roundPercent(set.ChangeAmount / set.StartValue * 100)
		}
		sets = append(sets, *set)
	}
	sort.Slice(sets, func(i, j int) bool {
		if rank == "amount" {
			return math.Abs(sets[i].ChangeAmount) > math.Abs(sets[j].ChangeAmount)
		}
		return math.Abs(sets[i].ChangePercent) > math.Abs(sets[j].ChangePercent)
	})
	return sets
}

func historySignal(period Period, observations int, changePercent float64) string {
	minimumObservations := map[string]int{
		"1d":  2,
		"1w":  4,
		"1m":  15,
		"1y":  180,
		"all": 180,
	}[period.Key]
	if observations < minimumObservations {
		return "limited"
	}
	if math.Abs(changePercent) >= 50 {
		return "volatile"
	}
	return "regular"
}

func roundMoney(value float64) float64 {
	return math.Round(value*100) / 100
}

func roundPercent(value float64) float64 {
	return math.Round(value*100) / 100
}
