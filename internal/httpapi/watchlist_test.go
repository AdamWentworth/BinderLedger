package httpapi

import (
	"net/http/httptest"
	"testing"

	"github.com/AdamWentworth/BinderLedger/internal/watchlist"
)

func TestWatchlistPathID(t *testing.T) {
	for _, test := range []struct {
		value string
		ok    bool
	}{
		{value: "default", ok: true},
		{value: "vintage-holos_2", ok: true},
		{value: "", ok: false},
		{value: "cards/all", ok: false},
	} {
		request := httptest.NewRequest("GET", "/", nil)
		request.SetPathValue("watchlistID", test.value)
		got, ok := watchlistPathID(request)
		if ok != test.ok || (ok && got != test.value) {
			t.Fatalf("watchlistPathID(%q) = (%q, %v)", test.value, got, ok)
		}
	}
}

func TestValidWatchlistTargets(t *testing.T) {
	if !validWatchlistCardTarget(watchlist.CardTarget{
		CardID:   "base-charizard",
		Edition:  "First Edition",
		Finish:   "Holofoil",
		Language: "English",
	}) {
		t.Fatal("expected card target to be valid")
	}
	if validWatchlistCardTarget(watchlist.CardTarget{
		CardID:   "base-charizard",
		Edition:  "First Edition",
		Finish:   "Holofoil",
		Language: "Japanese",
	}) {
		t.Fatal("expected unsupported language to be invalid")
	}
	if !validWatchlistSetTarget(watchlist.SetTarget{SetID: "base-set", Edition: "Shadowless"}) {
		t.Fatal("expected set target to be valid")
	}
}
