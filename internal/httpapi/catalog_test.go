package httpapi

import (
	"net/http/httptest"
	"testing"
)

func TestQueryInteger(t *testing.T) {
	tests := []struct {
		name     string
		query    string
		fallback int
		want     int
		wantOK   bool
	}{
		{name: "fallback", query: "", fallback: 24, want: 24, wantOK: true},
		{name: "valid", query: "?limit=36", fallback: 24, want: 36, wantOK: true},
		{name: "too large", query: "?limit=61", fallback: 24, wantOK: false},
		{name: "not a number", query: "?limit=all", fallback: 24, wantOK: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest("GET", "/api/catalog/cards"+test.query, nil)
			got, ok := queryInteger(request, "limit", test.fallback, 1, 60)
			if got != test.want || ok != test.wantOK {
				t.Fatalf("queryInteger() = (%d, %v), want (%d, %v)", got, ok, test.want, test.wantOK)
			}
		})
	}
}

func TestOptionalCatalogValue(t *testing.T) {
	for _, test := range []struct {
		value string
		want  bool
	}{
		{value: "", want: true},
		{value: "Unlimited", want: true},
		{value: "First Edition", want: true},
		{value: "Limited Edition", want: false},
	} {
		if got := optionalCatalogValue(test.value, "Unlimited", "First Edition"); got != test.want {
			t.Fatalf("optionalCatalogValue(%q) = %v, want %v", test.value, got, test.want)
		}
	}
}
