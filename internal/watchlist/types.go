package watchlist

import (
	"errors"

	"github.com/AdamWentworth/BinderLedger/internal/catalog"
	"github.com/AdamWentworth/BinderLedger/internal/market"
)

var (
	ErrWatchlistNotFound   = errors.New("watchlist was not found")
	ErrCardPrintingMissing = errors.New("card printing was not found")
	ErrSetEditionMissing   = errors.New("set edition was not found")
)

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
