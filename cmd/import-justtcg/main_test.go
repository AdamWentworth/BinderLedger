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

func TestTCGPlayerImageURL(t *testing.T) {
	productID := int64(618732)
	want := "https://product-images.tcgplayer.com/fit-in/437x437/618732.jpg"
	if got := tcgplayerImageURL(&productID); got != want {
		t.Fatalf("tcgplayerImageURL() = %q, want %q", got, want)
	}
	if got := tcgplayerImageURL(nil); got != "" {
		t.Fatalf("tcgplayerImageURL(nil) = %q, want empty", got)
	}
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

func TestProviderCardExcluded(t *testing.T) {
	if !providerCardExcluded("pokemon-base-set-charizard-black-dot-error-holo-rare") {
		t.Fatal("Black Dot Error Charizard should be excluded")
	}
	if providerCardExcluded("pokemon-base-set-shadowless-charizard-holo-rare") {
		t.Fatal("standard catalog cards should remain importable")
	}
}

func TestCatalogSetIdentity(t *testing.T) {
	if got := catalogSetName(baseSetShadowlessID, "Base Set (Shadowless)"); got != "Base Set Shadowless" {
		t.Fatalf("catalogSetName() = %q, want Base Set Shadowless", got)
	}
	if got := catalogSetDisplayOrder(baseSetFirstEditionID); got != 10 {
		t.Fatalf("First Edition display order = %d, want 10", got)
	}
	if got := catalogSetDisplayOrder(baseSetShadowlessID); got != 20 {
		t.Fatalf("Shadowless display order = %d, want 20", got)
	}
	if got := catalogSetDisplayOrder(baseSetID); got != 30 {
		t.Fatalf("Base Set display order = %d, want 30", got)
	}
}

func TestCatalogVariantTarget(t *testing.T) {
	shadowlessCharizard := "pokemon-base-set-shadowless-charizard-holo-rare"
	firstEditionCharizard := "pokemon-base-set-first-edition-charizard-holo-rare"

	cardID, edition := catalogVariantTarget(baseSetShadowlessID, shadowlessCharizard, "First Edition")
	if cardID != firstEditionCharizard || edition != "First Edition" {
		t.Fatalf("First Edition target = (%q, %q), want (%q, First Edition)", cardID, edition, firstEditionCharizard)
	}

	cardID, edition = catalogVariantTarget(baseSetShadowlessID, shadowlessCharizard, "Unlimited")
	if cardID != shadowlessCharizard || edition != "Shadowless" {
		t.Fatalf("Shadowless target = (%q, %q), want (%q, Shadowless)", cardID, edition, shadowlessCharizard)
	}

	cardID, edition = catalogVariantTarget(baseSetID, "pokemon-base-set-charizard-holo-rare", "Unlimited")
	if cardID != "pokemon-base-set-charizard-holo-rare" || edition != "Unlimited" {
		t.Fatalf("Base Set target changed unexpectedly: (%q, %q)", cardID, edition)
	}
}

func TestCardHasEdition(t *testing.T) {
	card := providerCard{Variants: []providerVariant{
		{Printing: "Unlimited Holofoil"},
		{Printing: "1st Edition Holofoil"},
	}}
	if !cardHasEdition(card, "First Edition") {
		t.Fatal("expected First Edition variant to be detected")
	}
	if cardHasEdition(card, "Shadowless") {
		t.Fatal("provider variants should not contain derived Shadowless edition")
	}
}

func TestMachampVariantID(t *testing.T) {
	got, err := machampVariantID("107004", "Moderately Played")
	if err != nil {
		t.Fatal(err)
	}
	want := "curated-107004-first-edition-holofoil-moderately-played"
	if got != want {
		t.Fatalf("machampVariantID() = %q, want %q", got, want)
	}
	if _, err := machampVariantID("107004", "Unknown"); err == nil {
		t.Fatal("machampVariantID() accepted an unknown condition")
	}
	if _, err := machampVariantID("999", "Near Mint"); err == nil {
		t.Fatal("machampVariantID() accepted an unknown product")
	}
}
