package main

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"net/http"
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
		"https://storage.googleapis.com.evil.example/images.pricecharting.com/abc123/1600.jpg",
		"https://user@storage.googleapis.com/images.pricecharting.com/abc123/1600.jpg",
		"https://storage.googleapis.com:444/images.pricecharting.com/abc123/1600.jpg",
	} {
		if err := validateSourceURL(value); err == nil {
			t.Fatalf("untrusted URL %q accepted", value)
		}
	}
}

func TestDownloadRejectsUntrustedInitialURL(t *testing.T) {
	if _, err := download(context.Background(), http.DefaultClient, "https://example.com/card.jpg"); err == nil {
		t.Fatal("download accepted an untrusted initial URL")
	}
}

func TestExtractPriceChartingImageURL(t *testing.T) {
	body := []byte(`
		<img src="https://example.com/not-a-card.jpg" />
		<img class="photo" src="https://storage.googleapis.com/images.pricecharting.com/abc123/60.jpg" />
	`)

	got, ok := extractPriceChartingImageURL(body)
	if !ok || got != "https://storage.googleapis.com/images.pricecharting.com/abc123/60.jpg" {
		t.Fatalf("extractPriceChartingImageURL() = (%q, %v)", got, ok)
	}
}

func TestExtractPriceChartingImageURLRejectsDeceptiveHosts(t *testing.T) {
	for _, value := range []string{
		"https://example.com/https://storage.googleapis.com/images.pricecharting.com/abc123/1600.jpg",
		"https://storage.googleapis.com.evil.example/images.pricecharting.com/abc123/1600.jpg",
		"https://storage.googleapis.com/images.pricecharting.com/abc123/1600.jpg?next=https://evil.example",
	} {
		body := []byte(`<img src="` + value + `" />`)
		if got, ok := extractPriceChartingImageURL(body); ok {
			t.Fatalf("deceptive URL %q accepted as %q", value, got)
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
	if item.Number != "1" || item.Title != "Ampharos #1" {
		t.Fatalf("unexpected parsed item: %+v", item)
	}
	if got := highResolutionPriceChartingURL(item.ImageURL); got != "https://storage.googleapis.com/images.pricecharting.com/abc123/1600.jpg" {
		t.Fatalf("high-resolution URL = %q", got)
	}
}

func TestCatalogCardNumber(t *testing.T) {
	for value, want := range map[string]string{
		"001/111":  "1",
		"75/75":    "75",
		"050a/147": "50a",
		"H01/H32":  "h1",
	} {
		got, err := catalogCardNumber(value)
		if err != nil || got != want {
			t.Fatalf("catalogCardNumber(%q) = (%q, %v), want %q", value, got, err, want)
		}
	}
	if _, err := catalogCardNumber("SWSH001"); err == nil {
		t.Fatal("non-numeric catalog number accepted")
	}
}

func TestParsePriceChartingAlphanumericNumbers(t *testing.T) {
	body := []byte(`
		<tr id="product-123" data-product="123">
			<td class="image"><div>
				<a href="https://www.pricecharting.com/game/pokemon-aquapolis/golduck-50a" title="123">
					<img class="photo" src="https://storage.googleapis.com/images.pricecharting.com/abc123/60.jpg" />
				</a>
			</div></td>
			<td class="title" title="123">
				<a href="/game/pokemon-aquapolis/golduck-50a">Golduck #50a</a>
			</td>
		</tr>
	`)

	items := parsePriceChartingItems(body)
	if len(items) != 1 || items[0].Number != "50a" {
		t.Fatalf("unexpected parsed items: %+v", items)
	}
}

func TestPriceChartingItemMatchesTarget(t *testing.T) {
	tests := []struct {
		name   string
		title  string
		target target
		want   bool
	}{
		{
			name:  "unlimited regular",
			title: "Ampharos #1",
			target: target{
				Edition: "Unlimited",
				Finish:  "Holofoil",
			},
			want: true,
		},
		{
			name:  "reject first edition for unlimited",
			title: "Ampharos [1st Edition] #1",
			target: target{
				Edition: "Unlimited",
				Finish:  "Holofoil",
			},
		},
		{
			name:  "first edition",
			title: "Ampharos [1st Edition] #1",
			target: target{
				Edition: "First Edition",
				Finish:  "Holofoil",
			},
			want: true,
		},
		{
			name:  "reverse holo",
			title: "Dark Blastoise [Reverse Holo] #4",
			target: target{
				Edition: "Unlimited",
				Finish:  "Reverse Holofoil",
			},
			want: true,
		},
		{
			name:  "reject reverse holo for regular",
			title: "Dark Blastoise [Reverse Holo] #4",
			target: target{
				Edition: "Unlimited",
				Finish:  "Holofoil",
			},
		},
		{
			name:  "reject unrelated qualifier",
			title: "Dark Blastoise [Reverse Holo] [Error] #4",
			target: target{
				Edition: "Unlimited",
				Finish:  "Reverse Holofoil",
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			item := priceChartingItem{Title: test.title}
			if got := priceChartingItemMatchesTarget(item, test.target); got != test.want {
				t.Fatalf("priceChartingItemMatchesTarget(%q) = %v, want %v", test.title, got, test.want)
			}
		})
	}
}

func TestMatchingPriceChartingItemsFallsBackForSharedDotCodeReverse(t *testing.T) {
	items := []priceChartingItem{
		{Number: "74", Title: "Drowzee [Reverse Holo] #74"},
		{Number: "74a", Title: "Drowzee #74a"},
		{Number: "74b", Title: "Drowzee #74b"},
	}
	target := target{Edition: "Unlimited", Finish: "Reverse Holofoil"}

	matches := matchingPriceChartingItems(items, "74a", target)
	if len(matches) != 1 || matches[0].Number != "74" {
		t.Fatalf("unexpected shared reverse matches: %+v", matches)
	}
}

func TestMatchingPriceChartingItemsPrefersExactSuffix(t *testing.T) {
	items := []priceChartingItem{
		{Number: "50", Title: "Golduck [Reverse Holo] #50"},
		{Number: "50a", Title: "Golduck [Reverse Holo] #50a"},
	}
	target := target{Edition: "Unlimited", Finish: "Reverse Holofoil"}

	matches := matchingPriceChartingItems(items, "50a", target)
	if len(matches) != 1 || matches[0].Number != "50a" {
		t.Fatalf("exact suffix was not preferred: %+v", matches)
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

func TestInspectImageAllowsSmallVerifiedCardSource(t *testing.T) {
	card := image.NewRGBA(image.Rect(0, 0, 180, 249))
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, card, &jpeg.Options{Quality: 85}); err != nil {
		t.Fatal(err)
	}
	if _, err := inspectImage(encoded.Bytes()); err != nil {
		t.Fatalf("180x249 card image rejected: %v", err)
	}
}

func TestInspectImageTrimsLightSquareBorder(t *testing.T) {
	canvas := image.NewRGBA(image.Rect(0, 0, 400, 400))
	draw.Draw(
		canvas,
		canvas.Bounds(),
		&image.Uniform{C: color.RGBA{R: 235, G: 235, B: 233, A: 255}},
		image.Point{},
		draw.Src,
	)
	draw.Draw(
		canvas,
		image.Rect(80, 10, 320, 390),
		&image.Uniform{C: color.RGBA{R: 220, G: 170, B: 20, A: 255}},
		image.Point{},
		draw.Src,
	)
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, canvas, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}

	result, err := inspectImage(encoded.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if result.Width < 230 || result.Width > 250 || result.Height < 370 || result.Height > 390 {
		t.Fatalf("unexpected trimmed dimensions: %dx%d", result.Width, result.Height)
	}
}

func TestInspectImageTrimsDarkLandscapeBackground(t *testing.T) {
	canvas := image.NewRGBA(image.Rect(0, 0, 800, 600))
	draw.Draw(
		canvas,
		canvas.Bounds(),
		&image.Uniform{C: color.RGBA{R: 45, G: 47, B: 46, A: 255}},
		image.Point{},
		draw.Src,
	)
	draw.Draw(
		canvas,
		image.Rect(210, 20, 590, 580),
		&image.Uniform{C: color.RGBA{R: 215, G: 170, B: 25, A: 255}},
		image.Point{},
		draw.Src,
	)
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, canvas, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}

	result, err := inspectImage(encoded.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if result.Width < 370 || result.Width > 390 || result.Height < 550 || result.Height > 570 {
		t.Fatalf("unexpected dark-background trim: %dx%d", result.Width, result.Height)
	}
}

func TestInspectImageRejectsUnrecoverableSquareImage(t *testing.T) {
	canvas := image.NewRGBA(image.Rect(0, 0, 400, 400))
	draw.Draw(canvas, canvas.Bounds(), &image.Uniform{C: color.Black}, image.Point{}, draw.Src)
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, canvas, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	if _, err := inspectImage(encoded.Bytes()); err == nil {
		t.Fatal("unrecoverable square image accepted")
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
