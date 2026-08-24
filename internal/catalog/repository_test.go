package catalog

import "testing"

func TestParseListingSort(t *testing.T) {
	tests := []struct {
		value string
		want  ListingSort
		ok    bool
	}{
		{value: "", want: ListingSortSetNumber, ok: true},
		{value: "price_desc", want: ListingSortPriceHigh, ok: true},
		{value: " name_asc ", want: ListingSortNameAZ, ok: true},
		{value: "newest", ok: false},
	}

	for _, test := range tests {
		got, ok := ParseListingSort(test.value)
		if got != test.want || ok != test.ok {
			t.Fatalf("ParseListingSort(%q) = (%q, %v), want (%q, %v)", test.value, got, ok, test.want, test.ok)
		}
	}
}
