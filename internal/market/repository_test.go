package market

import "testing"

func TestParsePeriod(t *testing.T) {
	tests := []struct {
		value    string
		wantKey  string
		wantDays int
		wantOK   bool
	}{
		{value: "", wantKey: "1m", wantDays: 30, wantOK: true},
		{value: "1D", wantKey: "1d", wantDays: 1, wantOK: true},
		{value: "1w", wantKey: "1w", wantDays: 7, wantOK: true},
		{value: "1y", wantKey: "1y", wantDays: 365, wantOK: true},
		{value: "all", wantKey: "all", wantDays: 0, wantOK: true},
		{value: "quarter", wantOK: false},
	}

	for _, test := range tests {
		t.Run(test.value, func(t *testing.T) {
			period, ok := ParsePeriod(test.value)
			if ok != test.wantOK || period.Key != test.wantKey || period.Days != test.wantDays {
				t.Fatalf("ParsePeriod(%q) = (%+v, %v)", test.value, period, ok)
			}
		})
	}
}

func TestParseRank(t *testing.T) {
	tests := []struct {
		value string
		want  string
		ok    bool
	}{
		{value: "", want: "amount", ok: true},
		{value: "amount", want: "amount", ok: true},
		{value: "PERCENT", want: "percent", ok: true},
		{value: "price", want: "", ok: false},
	}

	for _, test := range tests {
		got, ok := ParseRank(test.value)
		if got != test.want || ok != test.ok {
			t.Fatalf("ParseRank(%q) = (%q, %v)", test.value, got, ok)
		}
	}
}

func TestHistorySignal(t *testing.T) {
	period, _ := ParsePeriod("1m")
	if got := historySignal(period, 5, 3); got != "limited" {
		t.Fatalf("historySignal() = %q, want limited", got)
	}
	if got := historySignal(period, 30, 72); got != "volatile" {
		t.Fatalf("historySignal() = %q, want volatile", got)
	}
	if got := historySignal(period, 30, 12); got != "regular" {
		t.Fatalf("historySignal() = %q, want regular", got)
	}
}

func TestCalculateMovement(t *testing.T) {
	period, _ := ParsePeriod("1m")
	movement := CalculateMovement(period, 80, 92, 30)
	if movement.Amount != 12 || movement.Percent != 15 || movement.Signal != "regular" {
		t.Fatalf("CalculateMovement() = %+v", movement)
	}
}

func TestSummarizeIncludesMedianAmountAndPercent(t *testing.T) {
	summary := summarize("2026-08-25", []Mover{
		{ChangeAmount: -4, ChangePercent: -10},
		{ChangeAmount: 2, ChangePercent: 5},
		{ChangeAmount: 8, ChangePercent: 20},
		{ChangeAmount: 12, ChangePercent: 40},
	})

	if summary.MedianChangeAmount != 5 || summary.MedianChangePercent != 12.5 {
		t.Fatalf("summarize() medians = (%v, %v)", summary.MedianChangeAmount, summary.MedianChangePercent)
	}
}

func TestSummarizeSetsRanksByRequestedMovementAndCarriesArtwork(t *testing.T) {
	symbol := "/api/catalog/assets/jungle-symbol.png"
	movers := []Mover{
		{
			SetID: "jungle", SetName: "Jungle", Edition: "Unlimited", SetSymbolURL: &symbol,
			StartPrice: 100, EndPrice: 110,
		},
		{
			SetID: "base", SetName: "Base Set", Edition: "Unlimited",
			StartPrice: 10, EndPrice: 15,
		},
	}
	for index := range movers {
		movement := CalculateMovement(Period{Key: "1m", Days: 30}, movers[index].StartPrice, movers[index].EndPrice, 30)
		movers[index].ChangeAmount = movement.Amount
		movers[index].ChangePercent = movement.Percent
	}

	byAmount := summarizeSets(movers, "amount")
	if byAmount[0].SetID != "jungle" || byAmount[0].SymbolURL == nil || *byAmount[0].SymbolURL != symbol {
		t.Fatalf("summarizeSets(amount) = %+v", byAmount)
	}
	byPercent := summarizeSets(movers, "percent")
	if byPercent[0].SetID != "base" {
		t.Fatalf("summarizeSets(percent) = %+v", byPercent)
	}
}

func TestSummarizeSetsSeparatesEditionsWithinASet(t *testing.T) {
	sets := summarizeSets([]Mover{
		{
			SetID: "jungle", SetName: "Jungle", Edition: "First Edition",
			StartPrice: 125, EndPrice: 150,
		},
		{
			SetID: "jungle", SetName: "Jungle", Edition: "Unlimited",
			StartPrice: 50, EndPrice: 55,
		},
		{
			SetID: "jungle", SetName: "Jungle", Edition: "Unlimited",
			StartPrice: 25, EndPrice: 30,
		},
	}, "amount")

	if len(sets) != 2 {
		t.Fatalf("summarizeSets() returned %d editions, want 2: %+v", len(sets), sets)
	}
	if sets[0].Edition != "First Edition" || sets[0].VariantCount != 1 || sets[0].EndValue != 150 {
		t.Fatalf("summarizeSets() first edition = %+v", sets[0])
	}
	if sets[1].Edition != "Unlimited" || sets[1].VariantCount != 2 || sets[1].EndValue != 85 {
		t.Fatalf("summarizeSets() unlimited = %+v", sets[1])
	}
}
