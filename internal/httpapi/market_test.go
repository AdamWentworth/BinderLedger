package httpapi

import "testing"

func TestMarketCondition(t *testing.T) {
	tests := []struct {
		value string
		want  string
		ok    bool
	}{
		{value: "", want: "Near Mint", ok: true},
		{value: "Lightly Played", want: "Lightly Played", ok: true},
		{value: "Mint", want: "Mint", ok: false},
	}

	for _, test := range tests {
		got, ok := marketCondition(test.value)
		if got != test.want || ok != test.ok {
			t.Fatalf("marketCondition(%q) = (%q, %v)", test.value, got, ok)
		}
	}
}
