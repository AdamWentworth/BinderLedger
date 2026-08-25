package main

import (
	"strings"
	"testing"
)

func TestDefaultTargetsPreserveFirstEditionProviderImages(t *testing.T) {
	t.Parallel()

	specs, err := parseTargetSpecs(defaultTargetNames)
	if err != nil {
		t.Fatal(err)
	}
	for _, spec := range specs {
		if spec.Key == "base-first-edition" {
			t.Fatal("default targets include Base Set First Edition")
		}
	}
}

func TestParseIndexPage(t *testing.T) {
	t.Parallel()

	page, err := parseIndexPage(strings.NewReader(`
		<table><tbody><tr id="product-1">
			<td class="image"><img src="https://storage.googleapis.com/images.pricecharting.com/hash/60.jpg"></td>
			<td class="title"><a href="/game/pokemon-base-set/pikachu-red-cheeks-shadowless-58">
				Pikachu Red Cheeks [Shadowless] #58
			</a></td>
		</tr></tbody></table>
		<form class="next_page js-next-page">
			<input name="release-date" value="2026-08-24">
			<input name="cursor" value="150">
		</form>
	`))
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Products) != 1 {
		t.Fatalf("got %d products, want 1", len(page.Products))
	}
	product := page.Products[0]
	if product.Number != 58 {
		t.Errorf("number = %d, want 58", product.Number)
	}
	if product.PageURL != "https://www.pricecharting.com/game/pokemon-base-set/pikachu-red-cheeks-shadowless-58" {
		t.Errorf("page URL = %q", product.PageURL)
	}
	if product.ImageURL != "https://storage.googleapis.com/images.pricecharting.com/hash/1600.jpg" {
		t.Errorf("image URL = %q", product.ImageURL)
	}
	if page.NextCursor != "150" || page.ReleaseDate != "2026-08-24" {
		t.Errorf("pagination = %#v", page)
	}
}

func TestMatchTargetsSeparatesPikachuPrints(t *testing.T) {
	t.Parallel()

	spec := availableTargets["base-shadowless"]
	targets := []catalogTarget{
		{CardID: "yellow", Name: "Pikachu", Number: 58},
		{CardID: "red", Name: "Pikachu (Red Cheeks)", Number: 58},
	}
	products := []product{
		{Title: "Pikachu [Shadowless] #58", Number: 58},
		{Title: "Pikachu [Shadowless Red Cheeks] #58", Number: 58},
	}

	matches, err := matchTargets(spec, targets, products)
	if err != nil {
		t.Fatal(err)
	}
	if matches["yellow"].Title != "Pikachu [Shadowless] #58" {
		t.Errorf("yellow cheeks match = %q", matches["yellow"].Title)
	}
	if matches["red"].Title != "Pikachu [Shadowless Red Cheeks] #58" {
		t.Errorf("red cheeks match = %q", matches["red"].Title)
	}
}

func TestProductBelongsToTarget(t *testing.T) {
	t.Parallel()

	firstEdition := availableTargets["base-first-edition"]
	shadowless := availableTargets["base-shadowless"]
	baseUnlimited := availableTargets["base-unlimited"]
	jungle := availableTargets["jungle-unlimited"]
	fossil := availableTargets["fossil-unlimited"]
	teamRocket := availableTargets["team-rocket-unlimited"]
	gymHeroes := availableTargets["gym-heroes-unlimited"]
	gymChallenge := availableTargets["gym-challenge-unlimited"]
	if !productBelongsToTarget(firstEdition, product{Title: "Alakazam [1st Edition] #1"}) {
		t.Error("first-edition product did not match")
	}
	if !productBelongsToTarget(firstEdition, product{Title: "Pikachu [1st Edition Red Cheeks] #58"}) {
		t.Error("first-edition red-cheeks product did not match")
	}
	if productBelongsToTarget(firstEdition, product{Title: "Pikachu [1st Edition Ghost Stamp] #58"}) {
		t.Error("ghost-stamp product matched regular first-edition target")
	}
	if productBelongsToTarget(firstEdition, product{Title: "Alakazam [Shadowless] #1"}) {
		t.Error("shadowless product matched first-edition target")
	}
	if !productBelongsToTarget(shadowless, product{Title: "Alakazam [Shadowless] #1"}) {
		t.Error("shadowless product did not match")
	}
	if productBelongsToTarget(shadowless, product{Title: "Alakazam [1st Edition] #1"}) {
		t.Error("first-edition product matched shadowless")
	}
	if !productBelongsToTarget(baseUnlimited, product{Title: "Alakazam #1"}) {
		t.Error("Base Set unlimited product did not match")
	}
	if productBelongsToTarget(baseUnlimited, product{Title: "Alakazam [1999-2000] #1"}) {
		t.Error("fourth-print product matched Base Set unlimited")
	}
	if !productBelongsToTarget(jungle, product{Title: "Clefable #1"}) {
		t.Error("unlimited Jungle product did not match")
	}
	if productBelongsToTarget(jungle, product{Title: "Clefable [1st Edition] #1"}) {
		t.Error("first-edition Jungle product matched unlimited")
	}
	if !productBelongsToTarget(fossil, product{Title: "Aerodactyl #1"}) {
		t.Error("unlimited Fossil product did not match")
	}
	if productBelongsToTarget(fossil, product{Title: "Aerodactyl [Prerelease] #1"}) {
		t.Error("prerelease Fossil product matched unlimited")
	}
	if !productBelongsToTarget(teamRocket, product{Title: "Dark Raichu #83"}) {
		t.Error("unlimited Team Rocket product did not match")
	}
	if productBelongsToTarget(teamRocket, product{Title: "Dark Raichu [1st Edition] #83"}) {
		t.Error("first-edition Team Rocket product matched unlimited")
	}
	if !productBelongsToTarget(teamRocket, product{Title: "Dark Dragonite [Holo] #5"}) {
		t.Error("regular Unlimited Dark Dragonite holo did not match")
	}
	if productBelongsToTarget(teamRocket, product{Title: "Dark Dragonite [Error] #5"}) {
		t.Error("Dark Dragonite error matched regular Unlimited target")
	}
	if !productBelongsToTarget(gymHeroes, product{Title: "Blaine's Moltres #1"}) {
		t.Error("unlimited Gym Heroes product did not match")
	}
	if productBelongsToTarget(gymHeroes, product{Title: "Blaine's Moltres [1st Edition] #1"}) {
		t.Error("first-edition Gym Heroes product matched unlimited")
	}
	if !productBelongsToTarget(gymChallenge, product{Title: "Blaine's Charizard #2"}) {
		t.Error("unlimited Gym Challenge product did not match")
	}
	if productBelongsToTarget(gymChallenge, product{Title: "Misty's Seadra [Prerelease] #9"}) {
		t.Error("prerelease Gym Challenge product matched unlimited")
	}
}

func TestMatchTargetsSelectsBaseUnlimitedOverrides(t *testing.T) {
	t.Parallel()

	spec := availableTargets["base-unlimited"]
	targets := []catalogTarget{
		{
			CardID: "pokemon-base-set-machamp-first-edition-holo-rare",
			Name:   "Machamp", Number: 8, Edition: "First Edition", Finish: "Holofoil",
		},
		{
			CardID: "pokemon-base-set-computer-search-rare",
			Name:   "Computer Search", Number: 71, Edition: "Unlimited", Finish: "Normal",
		},
	}

	matches, err := matchTargets(spec, targets, nil)
	if err != nil {
		t.Fatal(err)
	}
	machamp := matches[targets[0].CardID]
	if machamp.Source != "TCGplayer" || !strings.Contains(machamp.ImageURL, "42425") {
		t.Errorf("later stamped Machamp match = %#v", machamp)
	}
	computerSearch := matches[targets[1].CardID]
	if computerSearch.Source != "TCGplayer" || !strings.Contains(computerSearch.ImageURL, "42417") {
		t.Errorf("Computer Search match = %#v", computerSearch)
	}
}

func TestMatchTargetsSeparatesFirstEditionPikachuPrints(t *testing.T) {
	t.Parallel()

	spec := availableTargets["base-first-edition"]
	targets := []catalogTarget{
		{CardID: "yellow", Name: "Pikachu", Number: 58},
		{CardID: "red", Name: "Pikachu (Red Cheeks)", Number: 58},
	}
	products := []product{
		{Title: "Pikachu [1st Edition] #58", Number: 58},
		{Title: "Pikachu [1st Edition Red Cheeks] #58", Number: 58},
	}

	matches, err := matchTargets(spec, targets, products)
	if err != nil {
		t.Fatal(err)
	}
	if matches["yellow"].Title != "Pikachu [1st Edition] #58" {
		t.Errorf("yellow cheeks match = %q", matches["yellow"].Title)
	}
	if matches["red"].Title != "Pikachu [1st Edition Red Cheeks] #58" {
		t.Errorf("red cheeks match = %q", matches["red"].Title)
	}
}

func TestMatchTargetsSelectsRegularDarkDragoniteHolo(t *testing.T) {
	t.Parallel()

	spec := availableTargets["team-rocket-unlimited"]
	targets := []catalogTarget{
		{CardID: "regular-holo", Name: "Dark Dragonite (5)", Number: 5, Finish: "Holofoil"},
	}
	products := []product{
		{Title: "Dark Dragonite #5", Number: 5, PageURL: "missing-holo-error"},
		{Title: "Dark Dragonite [Holo] #5", Number: 5, PageURL: "regular-holo"},
	}

	matches, err := matchTargets(spec, targets, products)
	if err != nil {
		t.Fatal(err)
	}
	if matches["regular-holo"].PageURL != "regular-holo" {
		t.Errorf("Dark Dragonite match = %q", matches["regular-holo"].PageURL)
	}
}

func TestMatchTargetsUsesNameToResolveDuplicateNumbers(t *testing.T) {
	t.Parallel()

	spec := availableTargets["gym-heroes-unlimited"]
	targets := []catalogTarget{
		{CardID: "vermilion-city-gym", Name: "Vermilion City Gym", Number: 120},
	}
	products := []product{
		{Title: "Vermilion City Gym #120", Number: 120, PageURL: "correct-spelling"},
		{Title: "Vermillion City Gym #120", Number: 120, PageURL: "incorrect-spelling"},
	}

	matches, err := matchTargets(spec, targets, products)
	if err != nil {
		t.Fatal(err)
	}
	if matches[targets[0].CardID].PageURL != "correct-spelling" {
		t.Errorf("Vermilion City Gym match = %q", matches[targets[0].CardID].PageURL)
	}
}

func TestMatchTargetsUsesKogaImageFallback(t *testing.T) {
	t.Parallel()

	spec := availableTargets["gym-challenge-unlimited"]
	targets := []catalogTarget{
		{
			CardID: "pokemon-gym-challenge-koga-106-rare",
			Name:   "Koga (106)", Number: 106, Edition: "Unlimited", Finish: "Normal",
		},
	}
	products := []product{
		{Title: "Koga #106", Number: 106, PageURL: "malformed-pricecharting-image"},
	}

	matches, err := matchTargets(spec, targets, products)
	if err != nil {
		t.Fatal(err)
	}
	match := matches[targets[0].CardID]
	if match.Source != "TCGplayer" || !strings.Contains(match.ImageURL, "86503") {
		t.Errorf("Koga image match = %#v", match)
	}
}
