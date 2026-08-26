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

type MovementFilter struct {
	Period    Period
	Condition string
	SetID     string
	Query     string
	Direction string
	Rank      string
	Limit     int
	Offset    int
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
	Edition          string  `json:"edition"`
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
	Edition       string  `json:"edition"`
	LogoURL       *string `json:"logoUrl"`
	SymbolURL     *string `json:"symbolUrl"`
	StartValue    float64 `json:"startValue"`
	EndValue      float64 `json:"endValue"`
	ChangeAmount  float64 `json:"changeAmount"`
	ChangePercent float64 `json:"changePercent"`
	VariantCount  int     `json:"variantCount"`
}

type setMovementAssignment struct {
	SetID     string
	SetName   string
	Edition   string
	LogoURL   *string
	SymbolURL *string
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

type MovementPage struct {
	Period    string  `json:"period"`
	Condition string  `json:"condition"`
	Rank      string  `json:"rank"`
	Direction string  `json:"direction"`
	Movements []Mover `json:"movements"`
	Total     int     `json:"total"`
	Limit     int     `json:"limit"`
	Offset    int     `json:"offset"`
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

func ParseDirection(value string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "all":
		return "all", true
	case "gainers":
		return "gainers", true
	case "decliners":
		return "decliners", true
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
			v.edition,
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
		  AND (
			$3 = ''
			OR movement.set_id = $3
			OR EXISTS (
				SELECT 1
				FROM catalog_set_printing_memberships membership
				WHERE membership.set_id = $3
				  AND membership.card_id = v.card_id
				  AND membership.printing_edition = v.edition
			)
		  )
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
			&mover.Edition,
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

	setAssignments, err := repository.setMovementAssignments(ctx, filter.SetID)
	if err != nil {
		return Overview{}, err
	}
	overview.Summary = summarize(asOf.Format(time.DateOnly), movers)
	overview.Sets = summarizeSets(movers, setAssignments, filter.SetID, filter.Rank)

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

func (repository *Repository) Movements(ctx context.Context, filter MovementFilter) (MovementPage, error) {
	filter.SetID = strings.TrimSpace(filter.SetID)
	filter.Query = strings.TrimSpace(filter.Query)
	if direction, ok := ParseDirection(filter.Direction); ok {
		filter.Direction = direction
	} else {
		filter.Direction = "all"
	}
	if rank, ok := ParseRank(filter.Rank); ok {
		filter.Rank = rank
	} else {
		filter.Rank = "amount"
	}

	page := MovementPage{
		Period:    filter.Period.Key,
		Condition: filter.Condition,
		Rank:      filter.Rank,
		Direction: filter.Direction,
		Movements: make([]Mover, 0),
		Limit:     filter.Limit,
		Offset:    filter.Offset,
	}

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
			v.edition,
			v.printing,
			movement.condition,
			movement.start_date,
			movement.start_price::double precision,
			movement.end_date,
			movement.end_price::double precision,
			movement.change_amount::double precision,
			movement.change_percent::double precision,
			movement.observation_count,
			movement.signal,
			count(*) OVER()
		FROM market_variant_movements movement
		JOIN catalog_card_variants v ON v.id = movement.variant_id
		JOIN catalog_cards c ON c.id = v.card_id
		JOIN catalog_sets s ON s.id = c.set_id
		WHERE movement.period = $1
		  AND movement.condition = $2
		  AND (
			$3 = ''
			OR movement.set_id = $3
			OR EXISTS (
				SELECT 1
				FROM catalog_set_printing_memberships membership
				WHERE membership.set_id = $3
				  AND membership.card_id = v.card_id
				  AND membership.printing_edition = v.edition
			)
		  )
		  AND (
			$4 = ''
			OR c.name ILIKE '%' || $4 || '%'
			OR coalesce(c.number, '') ILIKE '%' || $4 || '%'
			OR s.name ILIKE '%' || $4 || '%'
		  )
		  AND (
			$5 = 'all'
			OR ($5 = 'gainers' AND movement.change_percent > 0)
			OR ($5 = 'decliners' AND movement.change_percent < 0)
		  )
		ORDER BY
			CASE WHEN $5 = 'all' AND $6 = 'amount' THEN abs(movement.change_amount) END DESC,
			CASE WHEN $5 = 'all' AND $6 = 'percent' THEN abs(movement.change_percent) END DESC,
			CASE WHEN $5 = 'gainers' AND $6 = 'amount' THEN movement.change_amount END DESC,
			CASE WHEN $5 = 'gainers' AND $6 = 'percent' THEN movement.change_percent END DESC,
			CASE WHEN $5 = 'decliners' AND $6 = 'amount' THEN movement.change_amount END ASC,
			CASE WHEN $5 = 'decliners' AND $6 = 'percent' THEN movement.change_percent END ASC,
			s.display_order,
			s.name,
			c.number,
			c.name,
			v.id
		LIMIT $7 OFFSET $8
	`, filter.Period.Key, filter.Condition, filter.SetID, filter.Query, filter.Direction, filter.Rank, filter.Limit, filter.Offset)
	if err != nil {
		return MovementPage{}, fmt.Errorf("query market movements: %w", err)
	}
	defer rows.Close()

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
			&mover.Edition,
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
			&page.Total,
		); err != nil {
			return MovementPage{}, fmt.Errorf("scan market movements: %w", err)
		}
		mover.StartDate = startDate.Format(time.DateOnly)
		mover.EndDate = endDate.Format(time.DateOnly)
		page.Movements = append(page.Movements, mover)
	}
	if err := rows.Err(); err != nil {
		return MovementPage{}, fmt.Errorf("read market movements: %w", err)
	}
	return page, nil
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

func (repository *Repository) setMovementAssignments(
	ctx context.Context,
	setID string,
) (map[string][]setMovementAssignment, error) {
	rows, err := repository.db.Query(ctx, `
		SELECT
			membership.card_id,
			membership.printing_edition,
			catalog_set.id,
			catalog_set.name,
			membership.catalog_edition,
			catalog_set.logo_url,
			catalog_set.symbol_url
		FROM catalog_set_printing_memberships membership
		JOIN catalog_sets catalog_set ON catalog_set.id = membership.set_id
		WHERE $1 = '' OR membership.set_id = $1
		ORDER BY membership.card_id, membership.printing_edition, catalog_set.display_order, catalog_set.name
	`, setID)
	if err != nil {
		return nil, fmt.Errorf("query market set memberships: %w", err)
	}
	defer rows.Close()

	assignments := make(map[string][]setMovementAssignment)
	for rows.Next() {
		var cardID, printingEdition string
		var assignment setMovementAssignment
		if err := rows.Scan(
			&cardID,
			&printingEdition,
			&assignment.SetID,
			&assignment.SetName,
			&assignment.Edition,
			&assignment.LogoURL,
			&assignment.SymbolURL,
		); err != nil {
			return nil, fmt.Errorf("scan market set membership: %w", err)
		}
		key := setMovementAssignmentKey(cardID, printingEdition)
		assignments[key] = append(assignments[key], assignment)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read market set memberships: %w", err)
	}
	return assignments, nil
}

func summarizeSets(
	movers []Mover,
	assignments map[string][]setMovementAssignment,
	filterSetID string,
	rank string,
) []SetMovement {
	bySet := make(map[string]*SetMovement)
	for _, mover := range movers {
		moverSets := make([]setMovementAssignment, 0, 2)
		if filterSetID == "" || mover.SetID == filterSetID {
			moverSets = append(moverSets, setMovementAssignment{
				SetID:     mover.SetID,
				SetName:   mover.SetName,
				Edition:   mover.Edition,
				LogoURL:   mover.SetLogoURL,
				SymbolURL: mover.SetSymbolURL,
			})
		}
		moverSets = append(
			moverSets,
			assignments[setMovementAssignmentKey(mover.CardID, mover.Edition)]...,
		)

		seen := make(map[string]struct{}, len(moverSets))
		for _, assignment := range moverSets {
			key := assignment.SetID + "\x00" + assignment.Edition
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			set := bySet[key]
			if set == nil {
				set = &SetMovement{
					SetID:     assignment.SetID,
					SetName:   assignment.SetName,
					Edition:   assignment.Edition,
					LogoURL:   assignment.LogoURL,
					SymbolURL: assignment.SymbolURL,
				}
				bySet[key] = set
			}
			set.StartValue += mover.StartPrice
			set.EndValue += mover.EndPrice
			set.VariantCount++
		}
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
			if math.Abs(sets[i].ChangeAmount) != math.Abs(sets[j].ChangeAmount) {
				return math.Abs(sets[i].ChangeAmount) > math.Abs(sets[j].ChangeAmount)
			}
		} else if math.Abs(sets[i].ChangePercent) != math.Abs(sets[j].ChangePercent) {
			return math.Abs(sets[i].ChangePercent) > math.Abs(sets[j].ChangePercent)
		}
		if sets[i].SetName != sets[j].SetName {
			return sets[i].SetName < sets[j].SetName
		}
		return sets[i].Edition < sets[j].Edition
	})
	return sets
}

func setMovementAssignmentKey(cardID, printingEdition string) string {
	return cardID + "\x00" + printingEdition
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
