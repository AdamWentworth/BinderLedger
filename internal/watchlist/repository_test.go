package watchlist

import (
	"testing"
	"time"

	"github.com/AdamWentworth/BinderLedger/internal/market"
)

func TestApplyMovement(t *testing.T) {
	period, _ := market.ParsePeriod("1m")
	start := 80.0
	end := 92.0
	startDate := time.Date(2026, 7, 24, 0, 0, 0, 0, time.UTC)
	endDate := time.Date(2026, 8, 24, 0, 0, 0, 0, time.UTC)
	movement := PriceMovement{
		StartPrice:       &start,
		EndPrice:         &end,
		ObservationCount: 30,
		Signal:           "limited",
	}

	applyMovement(&movement, period, &startDate, &endDate)

	if movement.ChangeAmount == nil || *movement.ChangeAmount != 12 {
		t.Fatalf("ChangeAmount = %v", movement.ChangeAmount)
	}
	if movement.ChangePercent == nil || *movement.ChangePercent != 15 {
		t.Fatalf("ChangePercent = %v", movement.ChangePercent)
	}
	if movement.Signal != "regular" {
		t.Fatalf("Signal = %q, want regular", movement.Signal)
	}
}

func TestSummarize(t *testing.T) {
	cardPrice := 10.25
	rising := 5.0
	falling := -2.0
	asOf := "2026-08-24"
	summary := summarize(
		[]Card{
			{CurrentPrice: &cardPrice, PriceMovement: PriceMovement{ChangePercent: &rising, EndDate: &asOf}},
			{},
		},
		[]Set{{PriceMovement: PriceMovement{ChangePercent: &falling}}},
	)

	if summary.CardCount != 2 || summary.SetCount != 1 || summary.PricedCardCount != 1 {
		t.Fatalf("counts = %+v", summary)
	}
	if summary.CurrentCardValue != 10.25 || summary.RisingItems != 1 || summary.FallingItems != 1 {
		t.Fatalf("summary = %+v", summary)
	}
	if summary.AsOf != asOf {
		t.Fatalf("AsOf = %q, want %q", summary.AsOf, asOf)
	}
}

func TestTrustedConditionMovementRejectsReferenceValuation(t *testing.T) {
	condition := "condition"
	reference := "ungraded_reference"
	if !hasTrustedConditionMovement(&condition) {
		t.Fatal("condition valuation should retain its market movement")
	}
	if hasTrustedConditionMovement(&reference) || hasTrustedConditionMovement(nil) {
		t.Fatal("reference or unavailable valuation should not expose condition movement")
	}
}
