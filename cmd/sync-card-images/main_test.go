package main

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

func TestValidateSourceURL(t *testing.T) {
	for _, value := range []string{
		"https://product-images.tcgplayer.com/fit-in/437x437/42444.jpg",
		"https://storage.googleapis.com/images.pricecharting.com/abc123/1600.jpg",
	} {
		if err := validateSourceURL(value); err != nil {
			t.Fatalf("trusted URL %q rejected: %v", value, err)
		}
	}
	for _, value := range []string{
		"http://product-images.tcgplayer.com/42444.jpg",
		"https://example.com/42444.jpg",
	} {
		if err := validateSourceURL(value); err == nil {
			t.Fatalf("untrusted URL %q accepted", value)
		}
	}
}

func TestParsePriceChartingItems(t *testing.T) {
	body := []byte(`
		<tr id="product-762323" data-product="762323">
			<td class="image"><div>
				<a href="https://www.pricecharting.com/game/pokemon-neo-genesis/ampharos-1" title="762323">
					<img class="photo" src="https://storage.googleapis.com/images.pricecharting.com/abc123/60.jpg" />
				</a>
			</div></td>
			<td class="title" title="762323">
				<a href="/game/pokemon-neo-genesis/ampharos-1">Ampharos #1</a>
			</td>
		</tr>
	`)

	items := parsePriceChartingItems(body)
	if len(items) != 1 {
		t.Fatalf("item count = %d, want 1", len(items))
	}
	item := items[0]
	if item.Number != 1 || item.Title != "Ampharos #1" {
		t.Fatalf("unexpected parsed item: %+v", item)
	}
	if got := highResolutionPriceChartingURL(item.ImageURL); got != "https://storage.googleapis.com/images.pricecharting.com/abc123/1600.jpg" {
		t.Fatalf("high-resolution URL = %q", got)
	}
}

func TestCatalogCardNumber(t *testing.T) {
	for value, want := range map[string]int{
		"001/111": 1,
		"75/75":   75,
	} {
		got, err := catalogCardNumber(value)
		if err != nil || got != want {
			t.Fatalf("catalogCardNumber(%q) = (%d, %v), want %d", value, got, err, want)
		}
	}
	if _, err := catalogCardNumber("SWSH001"); err == nil {
		t.Fatal("non-numeric catalog number accepted")
	}
}

func TestInspectImage(t *testing.T) {
	card := image.NewRGBA(image.Rect(0, 0, 300, 420))
	for y := 0; y < 420; y++ {
		for x := 0; x < 300; x++ {
			card.Set(x, y, color.RGBA{R: uint8(x % 255), G: uint8(y % 255), B: 120, A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, card, &jpeg.Options{Quality: 85}); err != nil {
		t.Fatal(err)
	}

	result, err := inspectImage(encoded.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if result.Extension != ".jpg" || result.Width != 300 || result.Height != 420 {
		t.Fatalf("unexpected image metadata: %+v", result)
	}
	if len(result.SHA256) != 64 {
		t.Fatalf("SHA-256 length = %d, want 64", len(result.SHA256))
	}
}

func TestImageFilename(t *testing.T) {
	item := target{
		CardID:   "pokemon-base-set-2-mr-mime",
		Edition:  "Unlimited",
		Finish:   "Holofoil",
		Language: "English",
	}
	want := "pokemon-base-set-2-mr-mime--unlimited--holofoil--english.jpg"
	if got := imageFilename(item, ".jpg"); got != want {
		t.Fatalf("image filename = %q, want %q", got, want)
	}
}
