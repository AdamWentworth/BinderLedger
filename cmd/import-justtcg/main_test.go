package main

import "testing"

func TestNumberSort(t *testing.T) {
	tests := map[string]*int{
		"004/102": intPointer(4),
		"11/64":   intPointer(11),
		"":        nil,
		"SWSH001": nil,
	}

	for input, want := range tests {
		got := numberSort(input)
		if got == nil && want == nil {
			continue
		}
		if got == nil || want == nil || *got != *want {
			t.Errorf("numberSort(%q) = %v, want %v", input, got, want)
		}
	}
}

func intPointer(value int) *int {
	return &value
}

func TestNormalizePrinting(t *testing.T) {
	tests := []struct {
		printing string
		edition  string
		finish   string
	}{
		{printing: "Normal", edition: "Unlimited", finish: "Normal"},
		{printing: "Holofoil", edition: "Unlimited", finish: "Holofoil"},
		{printing: "1st Edition", edition: "First Edition", finish: "Normal"},
		{printing: "1st Edition Holofoil", edition: "First Edition", finish: "Holofoil"},
		{printing: "Unlimited Reverse Holofoil", edition: "Unlimited", finish: "Reverse Holofoil"},
	}

	for _, test := range tests {
		edition, finish := normalizePrinting(test.printing)
		if edition != test.edition || finish != test.finish {
			t.Errorf("normalizePrinting(%q) = (%q, %q), want (%q, %q)",
				test.printing, edition, finish, test.edition, test.finish)
		}
	}
}

func TestPokemonTCGSetImages(t *testing.T) {
	logo, symbol := pokemonTCGSetImages("Jungle")
	if logo != "https://images.pokemontcg.io/base2/logo.png" {
		t.Fatalf("Jungle logo = %v", logo)
	}
	if symbol != "https://images.pokemontcg.io/base2/symbol.png" {
		t.Fatalf("Jungle symbol = %v", symbol)
	}

	logo, symbol = pokemonTCGSetImages("Unknown Set")
	if logo != "" || symbol != "" {
		t.Fatalf("unknown set images = (%q, %q), want empty values", logo, symbol)
	}
}
