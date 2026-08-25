package main

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

func TestValidateSourceURL(t *testing.T) {
	if err := validateSourceURL("https://product-images.tcgplayer.com/fit-in/437x437/42444.jpg"); err != nil {
		t.Fatalf("trusted URL rejected: %v", err)
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
