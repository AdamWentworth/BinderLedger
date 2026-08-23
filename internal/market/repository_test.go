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
