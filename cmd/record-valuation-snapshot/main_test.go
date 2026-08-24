package main

import (
	"strings"
	"testing"
	"time"
)

func TestValidateSnapshotRequiresEveryStoredLabel(t *testing.T) {
	references := []referenceTarget{
		{ID: "ungraded", Label: "Ungraded", Currency: "USD"},
		{ID: "grade-9", Label: "Grade 9", Currency: "USD"},
	}
	snapshot := manualSnapshot{
		ObservedOn: "2026-08-24",
		SourceURL:  "https://www.pricecharting.com/game/pokemon-base-set/pikachu-shadowless-red-cheeks-58",
		Values:     map[string]*float64{"Ungraded": price(53.81)},
	}

	_, _, err := validateSnapshot(snapshot, references, time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC))
	if err == nil || !strings.Contains(err.Error(), "Grade 9") {
		t.Fatalf("validateSnapshot() error = %v, want missing Grade 9", err)
	}
}

func TestValidateSnapshotNormalizesAmounts(t *testing.T) {
	references := []referenceTarget{
		{ID: "ungraded", Label: "Ungraded", Currency: "USD"},
		{ID: "grade-9", Label: "Grade 9", Currency: "USD"},
	}
	snapshot := manualSnapshot{
		ObservedOn: "2026-08-24",
		SourceURL:  "https://www.pricecharting.com/game/pokemon-base-set/pikachu-shadowless-red-cheeks-58",
		Values: map[string]*float64{
			"Ungraded": price(53.81),
			"Grade 9":  price(356.5),
		},
	}

	values, observedOn, err := validateSnapshot(
		snapshot,
		references,
		time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatal(err)
	}
	if got := observedOn.Format(time.DateOnly); got != "2026-08-24" {
		t.Fatalf("observedOn = %q", got)
	}
	if optionalAmount(values[0].Amount) != "53.81" || optionalAmount(values[1].Amount) != "356.50" {
		t.Fatalf(
			"amounts = (%q, %q)",
			optionalAmount(values[0].Amount),
			optionalAmount(values[1].Amount),
		)
	}
}

func TestValidateSnapshotRejectsFutureDate(t *testing.T) {
	references := []referenceTarget{{ID: "ungraded", Label: "Ungraded", Currency: "USD"}}
	snapshot := manualSnapshot{
		ObservedOn: "2026-08-25",
		SourceURL:  "https://www.pricecharting.com/game/pokemon-base-set/pikachu-shadowless-red-cheeks-58",
		Values:     map[string]*float64{"Ungraded": price(53.81)},
	}

	_, _, err := validateSnapshot(snapshot, references, time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC))
	if err == nil || !strings.Contains(err.Error(), "future") {
		t.Fatalf("validateSnapshot() error = %v, want future-date error", err)
	}
}

func TestValidateSnapshotPreservesUnavailableGrade(t *testing.T) {
	references := []referenceTarget{{ID: "grade-1", Label: "Grade 1", Currency: "USD"}}
	snapshot := manualSnapshot{
		ObservedOn: "2026-08-24",
		SourceURL:  "https://www.pricecharting.com/game/pokemon-base-set/example-card-1",
		Values:     map[string]*float64{"Grade 1": nil},
	}

	values, _, err := validateSnapshot(
		snapshot,
		references,
		time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatal(err)
	}
	if values[0].Amount != nil {
		t.Fatalf("Amount = %v, want nil", values[0].Amount)
	}
}

func price(value float64) *float64 {
	return &value
}
